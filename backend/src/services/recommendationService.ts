import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import {
  Recommendation,
  RecommendationAction,
  PricePrediction,
  ProductVolatility,
  RetailEvent,
  Platform,
} from '@shared/types';
import { PREDICTION_CONFIG } from '@shared/constants';
import { predictionService } from './predictionService';
import { eventService } from './eventService';

/**
 * Smart Recommendation Engine
 * 
 * Makes Buy Now / Wait / Track decisions based on:
 * - Current vs historical low price
 * - Predicted drop probability
 * - Event proximity
 * - Volatility score
 * - Confidence threshold
 */
export class RecommendationService {

  /**
   * Get a smart buying recommendation for a product
   */
  async getRecommendation(productId: string, platform?: Platform): Promise<Recommendation> {
    const cacheKey = `recommendation:${productId}:${platform || 'all'}`;
    const cached = await cacheGet<Recommendation>(cacheKey);
    if (cached) return cached;

    // Get prediction
    const prediction = await predictionService.predict(productId, platform);

    // Get price history stats
    const historyStats = await this.getPriceStats(productId, platform);

    // Get event proximity
    const saleLikelihood = await eventService.getSaleLikelihood(30);

    // Calculate recommendation
    const recommendation = this.calculateRecommendation(
      prediction,
      historyStats,
      saleLikelihood
    );

    await cacheSet(cacheKey, recommendation, 1800); // 30 min cache
    return recommendation;
  }

  /**
   * Core recommendation logic
   */
  private calculateRecommendation(
    prediction: PricePrediction,
    stats: {
      currentPrice: number;
      allTimeLow: number;
      averagePrice: number;
      volatility: ProductVolatility;
    },
    saleLikelihood: {
      likelihood: number;
      nearestEvent: RetailEvent | null;
      daysUntil: number;
    }
  ): Recommendation {
    const reasoning: string[] = [];
    let score = 0; // Positive = buy now, Negative = wait

    // Factor 1: Current price vs all-time low
    const priceLowRatio = stats.allTimeLow > 0
      ? stats.currentPrice / stats.allTimeLow
      : 1;

    if (priceLowRatio <= 1.05) {
      score += 3;
      reasoning.push('Price is at or near all-time low');
    } else if (priceLowRatio <= 1.15) {
      score += 1;
      reasoning.push('Price is within 15% of all-time low');
    } else if (priceLowRatio > 1.3) {
      score -= 2;
      reasoning.push('Price is significantly above all-time low');
    }

    // Factor 2: Current price vs average
    const priceAvgRatio = stats.averagePrice > 0
      ? stats.currentPrice / stats.averagePrice
      : 1;

    if (priceAvgRatio < 0.9) {
      score += 2;
      reasoning.push('Price is below historical average');
    } else if (priceAvgRatio > 1.1) {
      score -= 1;
      reasoning.push('Price is above historical average');
    }

    // Factor 3: Drop probability
    if (prediction.dropProbability > 0.7) {
      score -= 3;
      reasoning.push(`High probability (${Math.round(prediction.dropProbability * 100)}%) of price drop`);
    } else if (prediction.dropProbability > 0.4) {
      score -= 1;
      reasoning.push(`Moderate probability (${Math.round(prediction.dropProbability * 100)}%) of price drop`);
    } else if (prediction.dropProbability < 0.2) {
      score += 2;
      reasoning.push('Low probability of further price drop');
    }

    // Factor 4: Event proximity
    if (saleLikelihood.nearestEvent && saleLikelihood.daysUntil <= 14) {
      score -= 3;
      reasoning.push(`${saleLikelihood.nearestEvent.name} sale starts in ${saleLikelihood.daysUntil} days`);
    } else if (saleLikelihood.nearestEvent && saleLikelihood.daysUntil <= 30) {
      score -= 1;
      reasoning.push(`${saleLikelihood.nearestEvent.name} sale approaching in ${saleLikelihood.daysUntil} days`);
    }

    // Factor 5: Volatility
    if (stats.volatility === ProductVolatility.HIGHLY_VOLATILE) {
      score -= 1;
      reasoning.push('Price is highly volatile - potential for drops');
    } else if (stats.volatility === ProductVolatility.STABLE) {
      score += 1;
      reasoning.push('Price is stable - unlikely to change significantly');
    }

    // Factor 6: Prediction confidence
    if (prediction.confidenceScore < PREDICTION_CONFIG.CONFIDENCE_THRESHOLD) {
      reasoning.push('Note: Prediction confidence is low - recommendation may be less reliable');
    }

    // Determine action
    let action: RecommendationAction;
    if (score >= 3) {
      action = RecommendationAction.BUY_NOW;
    } else if (score <= -2) {
      action = RecommendationAction.WAIT;
    } else {
      action = RecommendationAction.TRACK;
    }

    // Calculate confidence
    const confidence = Math.min(
      0.95,
      Math.max(0.3, 0.5 + Math.abs(score) * 0.08 + prediction.confidenceScore * 0.2)
    );

    return {
      action,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
      prediction,
      nearestEvent: saleLikelihood.nearestEvent || undefined,
    };
  }

  // ─── Database Helpers ────────────────────────────────────────

  private async getPriceStats(
    productId: string,
    platform?: Platform
  ): Promise<{
    currentPrice: number;
    allTimeLow: number;
    averagePrice: number;
    volatility: ProductVolatility;
  }> {
    let sql = `
      SELECT
        MIN(price) as all_time_low,
        MAX(price) as all_time_high,
        AVG(price) as average_price,
        STDDEV(price) as std_dev,
        (SELECT price FROM price_history
         WHERE product_id = $1
         ORDER BY recorded_at DESC LIMIT 1) as current_price
      FROM price_history
      WHERE product_id = $1
    `;
    const params: unknown[] = [productId];

    if (platform) {
      sql += ' AND platform = $2';
      params.push(platform);
    }

    const result = await query(sql, params);
    const row = result.rows[0];

    if (!row || !row.current_price) {
      return {
        currentPrice: 0,
        allTimeLow: 0,
        averagePrice: 0,
        volatility: ProductVolatility.STABLE,
      };
    }

    const avgPrice = parseFloat(row.average_price);
    const stdDev = parseFloat(row.std_dev) || 0;
    const cv = avgPrice > 0 ? stdDev / avgPrice : 0;

    let volatility: ProductVolatility;
    if (cv < PREDICTION_CONFIG.VOLATILITY_THRESHOLDS.STABLE) {
      volatility = ProductVolatility.STABLE;
    } else if (cv < PREDICTION_CONFIG.VOLATILITY_THRESHOLDS.MODERATE) {
      volatility = ProductVolatility.MODERATE;
    } else {
      volatility = ProductVolatility.HIGHLY_VOLATILE;
    }

    return {
      currentPrice: parseFloat(row.current_price),
      allTimeLow: parseFloat(row.all_time_low),
      averagePrice: Math.round(avgPrice * 100) / 100,
      volatility,
    };
  }
}

export const recommendationService = new RecommendationService();
