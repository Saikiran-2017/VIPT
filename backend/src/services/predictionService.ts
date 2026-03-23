import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  PricePrediction,
  PredictionModel,
  PredictionFactor,
  Platform,
  type ProductProfile,
} from '@shared/types';
import { API_CONFIG } from '@shared/constants';
import { loadValidatedFeatureContext } from './priceHistoryForPrediction';
import { predictionOutcomeService } from './predictionOutcomeService';
import { productProfiler } from './productProfiler';
import {
  adjustPredictedPrice,
  getPredictionStrategy,
  type PredictionStrategy,
} from './dynamicEnsemble';
import { enrichPredictionContext } from './signalEnricher';
import { buildTrustContext } from './trustEngine';
import { modelHealthService } from './modelHealthService';
import { BASELINE_ROLLUP_MODEL } from './modelPerformanceService';

export function rollingMeanLast(prices: number[], window: number): number {
  if (prices.length === 0) return 0;
  const slice = prices.slice(-Math.min(window, prices.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Confidence heuristic: higher when recent prices are relatively stable (low CV on last 7 points).
 */
export function baselineConfidenceFromPrices(prices: number[]): number {
  const slice = prices.slice(-Math.min(7, prices.length));
  if (slice.length === 0) return 0.1;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (mean <= 0) return 0.15;
  const variance =
    slice.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, slice.length);
  const std = Math.sqrt(variance);
  const cv = std / mean;
  const raw = 1 - Math.min(cv * 2, 0.85);
  return Math.max(0.15, Math.min(0.92, raw));
}

/**
 * Baseline price prediction: validated history → FeatureEngineer features, next price ≈ 7-day rolling mean (or last price).
 * No ML models, no external APIs, no ensemble.
 *
 * Readiness / backtest metrics: see `PredictionEvaluationService` and `GET /predictions/:id?includeEvaluation=1`.
 */
export class PredictionService {
  async predict(productId: string, platform?: Platform): Promise<PricePrediction> {
    const cacheKey = `prediction:ensemble:${productId}:${platform || 'all'}`;
    const cached = await cacheGet<PricePrediction>(cacheKey);
    if (cached) return cached;

    const ctx = await loadValidatedFeatureContext(productId, platform);
    if (!ctx) {
      const empty = this.emptyPrediction(productId);
      await this.attachTrustContext(empty, {
        profile: null,
        strategy: { mode: 'baseline_only' },
        pricesLength: 0,
        fallbackFreshness: null,
      });
      await this.recordOutcomeSkeleton(productId, empty, platform);
      await cacheSet(cacheKey, empty, 300);
      return empty;
    }

    const { prices, featureVector, dates } = ctx;
    const currentPrice = prices[prices.length - 1];
    const rm7 = rollingMeanLast(prices, 7);
    const rm30 = rollingMeanLast(prices, 30);
    const baselinePredicted =
      rm7 > 0 ? Math.round(rm7 * 100) / 100 : Math.round(currentPrice * 100) / 100;

    let profile: ProductProfile | null = null;
    let strategy: PredictionStrategy = { mode: 'baseline_only' };
    try {
      profile = await productProfiler.getProductProfile(productId, platform);
      strategy = getPredictionStrategy(profile);
    } catch (err) {
      logger.warn('ProductProfiler failed; falling back to baseline_only', {
        productId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let predictedPrice = baselinePredicted;
    try {
      predictedPrice = adjustPredictedPrice(strategy, {
        currentPrice,
        rm7,
        rm30,
        baselinePredicted,
      });
    } catch (err) {
      logger.warn('DynamicEnsemble adjustment failed; using baseline point estimate', {
        productId,
        error: err instanceof Error ? err.message : String(err),
      });
      predictedPrice = baselinePredicted;
    }

    const confidenceScore = baselineConfidenceFromPrices(prices);

    const band = Math.max(0.01, currentPrice * 0.02);
    const expectedLow = Math.max(0.01, Math.round((predictedPrice - band) * 100) / 100);
    const expectedHigh = Math.round((predictedPrice + band) * 100) / 100;

    let dropProbability = 0.15;
    if (currentPrice > 0 && predictedPrice < currentPrice) {
      dropProbability = Math.min(
        0.9,
        Math.max(0.05, (currentPrice - predictedPrice) / currentPrice)
      );
    }

    const suggestedWaitDays = dropProbability > 0.45 ? 7 : 0;

    const factors: PredictionFactor[] = [
      {
        name: '7-day rolling mean baseline',
        impact:
          predictedPrice < currentPrice - 0.01
            ? 'positive'
            : predictedPrice > currentPrice + 0.01
              ? 'negative'
              : 'neutral',
        weight: 1,
        description: `Estimate uses the mean of up to the last 7 validated observations (current $${currentPrice.toFixed(2)} vs forecast $${predictedPrice.toFixed(2)}).`,
      },
    ];
    if (strategy.mode !== 'baseline_only') {
      factors.push({
        name: 'Dynamic ensemble',
        impact: 'neutral',
        weight: 1,
        description:
          strategy.mode === 'smoothed'
            ? `Volatile profile: blended 7d mean and last price (mode=${strategy.mode}).`
            : `Stable profile: ${Math.round(0.65 * 100)}% weight on 30d mean, ${Math.round(0.35 * 100)}% on 7d mean (mode=${strategy.mode}).`,
      });
    }

    const prediction: PricePrediction = {
      productId,
      currentPrice: Math.round(currentPrice * 100) / 100,
      expectedPriceRange: { low: expectedLow, high: expectedHigh },
      dropProbability: Math.round(dropProbability * 100) / 100,
      suggestedWaitDays,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      modelUsed: PredictionModel.BASELINE,
      factors,
      generatedAt: new Date(),
      predictedPrice,
      featureVector,
    };

    const lastDate = dates?.length ? dates[dates.length - 1] : null;
    const fallbackFreshness = lastDate
      ? Math.round((Date.now() - lastDate.getTime()) / 60000)
      : null;
    try {
      prediction.enrichedSignals = enrichPredictionContext(productId, profile, prediction, {
        strategy,
        fallbackUsablePoints: prices.length,
        fallbackFreshnessMinutes: fallbackFreshness,
      });
    } catch (err) {
      logger.warn('SignalEnricher failed; continuing without enrichedSignals', {
        productId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await this.attachTrustContext(prediction, {
      profile,
      strategy,
      pricesLength: prices.length,
      fallbackFreshness,
    });

    await this.recordOutcomeSkeleton(productId, prediction, platform);

    await cacheSet(cacheKey, prediction, API_CONFIG.CACHE_TTL.PREDICTION);
    await this.storePrediction(prediction);

    return prediction;
  }

  private async attachTrustContext(
    prediction: PricePrediction,
    args: {
      profile: ProductProfile | null;
      strategy: PredictionStrategy;
      pricesLength: number;
      fallbackFreshness: number | null;
    }
  ): Promise<void> {
    let modelHealth = null;
    try {
      modelHealth = await modelHealthService.getModelHealth(BASELINE_ROLLUP_MODEL);
    } catch (err) {
      logger.warn('TrustEngine: model health unavailable', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      prediction.trustContext = buildTrustContext({
        profile: args.profile,
        strategy: args.strategy,
        enrichedSignals: prediction.enrichedSignals,
        modelHealth,
        baselineConfidenceScore: prediction.confidenceScore,
        usableDataPoints: args.pricesLength,
        validatedFraction: args.profile?.validatedFraction ?? null,
        freshnessMinutes:
          prediction.enrichedSignals?.freshnessMinutes ??
          args.fallbackFreshness ??
          args.profile?.freshnessMinutes ??
          null,
      });
    } catch (err) {
      logger.warn('TrustEngine failed; continuing without trustContext', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Prompt 8: skeleton row in `prediction_outcomes`; failures do not block the API response. */
  private async recordOutcomeSkeleton(
    productId: string,
    prediction: PricePrediction,
    platform?: Platform
  ): Promise<void> {
    const predicted =
      prediction.predictedPrice !== undefined && prediction.predictedPrice !== null
        ? prediction.predictedPrice
        : prediction.currentPrice;
    const outcomeId = await predictionOutcomeService.recordPrediction(
      productId,
      predicted,
      { baseline: 1 },
      {
        modelUsed: prediction.modelUsed,
        platform: platform ?? null,
        confidenceScore: prediction.confidenceScore,
      }
    );
    if (outcomeId) {
      prediction.predictionOutcomeId = outcomeId;
    }
  }

  private emptyPrediction(productId: string): PricePrediction {
    const empty: PricePrediction = {
      productId,
      currentPrice: 0,
      expectedPriceRange: { low: 0, high: 0 },
      dropProbability: 0,
      suggestedWaitDays: 0,
      confidenceScore: 0,
      modelUsed: PredictionModel.BASELINE,
      factors: [
        {
          name: 'No validated history',
          impact: 'neutral',
          weight: 1,
          description:
            'No non-rejected price_history rows for this product (or platform filter). Add observations before forecasting.',
        },
      ],
      generatedAt: new Date(),
      predictedPrice: 0,
    };
    try {
      empty.enrichedSignals = enrichPredictionContext(productId, null, empty, {
        strategy: { mode: 'baseline_only' },
        fallbackUsablePoints: 0,
        fallbackFreshnessMinutes: null,
      });
    } catch (err) {
      logger.warn('SignalEnricher failed for empty prediction', {
        productId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return empty;
  }

  private async storePrediction(prediction: PricePrediction): Promise<void> {
    try {
      await query(
        `INSERT INTO predictions (id, product_id, model_used, expected_price_low, expected_price_high, drop_probability, suggested_wait_days, confidence_score, factors, generated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '1 hour')`,
        [
          uuidv4(),
          prediction.productId,
          prediction.modelUsed,
          prediction.expectedPriceRange.low,
          prediction.expectedPriceRange.high,
          prediction.dropProbability,
          prediction.suggestedWaitDays,
          prediction.confidenceScore,
          JSON.stringify(prediction.factors),
        ]
      );
    } catch (error) {
      logger.error('Failed to store prediction:', error);
    }
  }
}

export const predictionService = new PredictionService();
