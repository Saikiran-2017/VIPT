import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  PricePrediction,
  PredictionModel,
  PredictionFactor,
  PriceHistoryEntry,
  Platform,
} from '@shared/types';
import { API_CONFIG, PREDICTION_CONFIG } from '@shared/constants';
import { eventService } from './eventService';

/**
 * Enhanced AI Price Prediction Service
 * 
 * Uses multiple statistical models for ensemble prediction:
 * 1. ARIMA-style autoregressive model (trend + momentum)
 * 2. Seasonal decomposition (weekly + monthly patterns)
 * 3. Exponential smoothing (Holt-Winters-like)
 * 4. Price elasticity analysis
 * 5. Event-driven adjustment
 * 6. Competitive price positioning
 */
export class PredictionService {

  /**
   * Generate price prediction for a product
   */
  async predict(productId: string, platform?: Platform): Promise<PricePrediction> {
    const cacheKey = `prediction:${productId}:${platform || 'best'}`;
    const cached = await cacheGet<PricePrediction>(cacheKey);
    if (cached) return cached;

    // Fetch price history
    const history = await this.getHistoryData(productId, platform);

    if (history.length < 5) {
      const lowDataPred = this.createLowDataPrediction(productId, history);
      lowDataPred.confidenceScore = 0.1;
      return lowDataPred;
    }

    if (history.length < PREDICTION_CONFIG.MIN_DATA_POINTS) {
      return this.createLowDataPrediction(productId, history);
    }

    const prices = history.map(h => h.price);
    const currentPrice = prices[prices.length - 1];

    // Run multiple prediction models
    const arimaResult = this.arimaPredict(prices);
    const seasonalResult = this.seasonalDecomposition(history);
    const hwResult = this.holtWintersSmooth(prices);
    const elasticity = this.priceElasticityAnalysis(prices);
    const momentum = this.momentumAnalysis(prices);

    // Get event-based adjustment
    const eventFactor = await this.getEventAdjustment(productId);

    // Get cross-platform intelligence
    const crossPlatformFactor = await this.getCrossPlatformPricingSignal(productId);

    // Enhanced ensemble prediction
    const prediction = this.enhancedEnsemblePrediction(
      productId,
      currentPrice,
      arimaResult,
      seasonalResult,
      hwResult,
      elasticity,
      momentum,
      eventFactor,
      crossPlatformFactor,
      history.length
    );

    // Cache the prediction
    await cacheSet(cacheKey, prediction, API_CONFIG.CACHE_TTL.PREDICTION);

    // Store in database
    await this.storePrediction(prediction);

    return prediction;
  }

  // ─── ARIMA-style Prediction ─────────────────────────────────

  private arimaPredict(prices: number[]): {
    expectedLow: number;
    expectedHigh: number;
    trend: 'up' | 'down' | 'flat';
    confidence: number;
    predictedNext: number;
  } {
    const n = prices.length;

    // Calculate multiple moving averages
    const ma7 = this.movingAverage(prices, Math.min(7, n));
    const ma30 = this.movingAverage(prices, Math.min(30, Math.floor(n / 2)));

    // Trend detection using regression on recent data
    const recentPrices = prices.slice(-Math.min(14, n));
    const trendSlope = this.calculateSlope(recentPrices);
    const normalizedSlope = trendSlope / this.mean(recentPrices);

    let trend: 'up' | 'down' | 'flat';
    if (normalizedSlope > 0.005) trend = 'up';
    else if (normalizedSlope < -0.005) trend = 'down';
    else trend = 'flat';

    // AR(2) coefficient estimation  
    const ar1 = this.calculateAR1(prices);
    const ar2 = n >= 5 ? this.calculateAR2(prices) : 0;

    // Predicted next value using AR(2)
    const lastPrice = prices[n - 1];
    const avgRecentPrice = this.mean(prices.slice(-14));
    const predictedNext = avgRecentPrice + 
      ar1 * (lastPrice - avgRecentPrice) + 
      (n >= 3 ? ar2 * (prices[n - 2] - avgRecentPrice) : 0);

    // MA crossover signal
    const latestMA7 = ma7[ma7.length - 1];
    const latestMA30 = ma30[ma30.length - 1];
    const maCrossover = latestMA7 < latestMA30 ? -0.05 : 0.03;

    const adjustedPrediction = predictedNext * (1 + maCrossover);

    // Calculate prediction range based on recent volatility
    const stdDev = this.standardDeviation(prices.slice(-30));
    const iqr = this.interquartileRange(prices.slice(-30));
    const spread = Math.min(stdDev * 1.5, iqr * 1.5);

    const expectedLow = Math.max(0, adjustedPrediction - spread);
    const expectedHigh = adjustedPrediction + spread;

    // Confidence based on prediction stability & data quantity
    const cv = stdDev / avgRecentPrice;
    const dataQuality = Math.min(1, n / 60);
    const confidence = Math.max(0.3, Math.min(0.95, (1 - cv) * 0.7 + dataQuality * 0.3));

    return { expectedLow, expectedHigh, trend, confidence, predictedNext: adjustedPrediction };
  }

  // ─── Seasonal Decomposition ────────────────────────────────

  private seasonalDecomposition(history: PriceHistoryEntry[]): {
    seasonalFactor: number;
    trendComponent: number;
    residualVariance: number;
    dayOfWeekEffect: number;
    monthEffect: number;
    isHistoricallyLow: boolean;
  } {
    const prices = history.map(h => h.price);
    const n = prices.length;

    const trendComponent = this.calculateSlope(prices);

    // Weekly seasonality
    let dayOfWeekEffect = 0;
    if (n >= 14) {
      const dayEffects: number[][] = [[], [], [], [], [], [], []];
      history.forEach((entry) => {
        const day = new Date(entry.timestamp).getDay();
        dayEffects[day].push(entry.price);
      });

      const overallMean = this.mean(prices);
      const todayDay = new Date().getDay();
      const todayMean = dayEffects[todayDay].length > 0
        ? this.mean(dayEffects[todayDay])
        : overallMean;

      dayOfWeekEffect = overallMean > 0 ? (todayMean - overallMean) / overallMean : 0;
    }

    // Monthly seasonality
    let monthEffect = 0;
    let seasonalFactor = 0;
    if (n >= 30) {
      const currentMonth = new Date().getMonth();
      const monthPrices = history
        .filter(h => new Date(h.timestamp).getMonth() === currentMonth)
        .map(h => h.price);

      if (monthPrices.length > 0) {
        const overallMean = this.mean(prices);
        const monthMean = this.mean(monthPrices);
        monthEffect = overallMean > 0 ? (monthMean - overallMean) / overallMean : 0;
        seasonalFactor = monthEffect;
      }
    }

    // Check if current price is historically low
    const currentPrice = prices[prices.length - 1];
    const percentile = this.percentileRank(prices, currentPrice);
    const isHistoricallyLow = percentile <= 25;

    // Residual variance
    const detrended = prices.map((p, i) => p - (prices[0] + trendComponent * i));
    const residualVariance = this.variance(detrended);

    return { seasonalFactor, trendComponent, residualVariance, dayOfWeekEffect, monthEffect, isHistoricallyLow };
  }

  // ─── Holt-Winters Exponential Smoothing ────────────────────

  private holtWintersSmooth(prices: number[]): {
    smoothedValue: number;
    trendValue: number;
    forecastNext: number;
  } {
    const alpha = 0.3;
    const beta = 0.1;

    let level = prices[0];
    let trend = prices.length > 1 ? prices[1] - prices[0] : 0;

    for (let i = 1; i < prices.length; i++) {
      const prevLevel = level;
      level = alpha * prices[i] + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    const forecastNext = level + trend;

    return {
      smoothedValue: level,
      trendValue: trend,
      forecastNext: Math.max(0, forecastNext),
    };
  }

  // ─── Price Elasticity Analysis ─────────────────────────────

  private priceElasticityAnalysis(prices: number[]): {
    meanReversion: number;
    priceFloor: number;
    priceCeiling: number;
    currentPosition: number;
  } {
    const n = prices.length;
    const mean = this.mean(prices);
    const currentPrice = prices[n - 1];

    // Mean reversion strength
    let sumProduct = 0;
    let sumSq = 0;
    for (let i = 1; i < n; i++) {
      const deviation = prices[i - 1] - mean;
      sumProduct += deviation * (prices[i] - prices[i - 1]);
      sumSq += deviation * deviation;
    }
    const meanReversion = sumSq > 0 ? -sumProduct / sumSq : 0.5;

    // Estimate price floor and ceiling using percentiles
    const sorted = [...prices].sort((a, b) => a - b);
    const p5 = sorted[Math.floor(n * 0.05)] || sorted[0];
    const p95 = sorted[Math.floor(n * 0.95)] || sorted[sorted.length - 1];

    const priceFloor = p5 * 0.98;
    const priceCeiling = p95 * 1.02;

    const range = priceCeiling - priceFloor;
    const currentPosition = range > 0 ? (currentPrice - priceFloor) / range : 0.5;

    return {
      meanReversion: Math.max(0, Math.min(1, meanReversion)),
      priceFloor: Math.round(priceFloor * 100) / 100,
      priceCeiling: Math.round(priceCeiling * 100) / 100,
      currentPosition: Math.max(0, Math.min(1, currentPosition)),
    };
  }

  // ─── Momentum Analysis ─────────────────────────────────────

  private momentumAnalysis(prices: number[]): {
    rsi: number;
    macdSignal: string;
    velocity: number;
  } {
    const n = prices.length;

    // RSI (Relative Strength Index)
    let gains = 0, losses = 0;
    const period = Math.min(14, n - 1);
    for (let i = n - period; i < n; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period || 0.001;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    // MACD-like signal
    const shortMA = this.mean(prices.slice(-Math.min(7, n)));
    const longMA = this.mean(prices.slice(-Math.min(26, n)));
    const macdValue = shortMA - longMA;
    const signalThreshold = this.standardDeviation(prices) * 0.1;

    let macdSignal: string;
    if (macdValue < -signalThreshold) macdSignal = 'bearish';
    else if (macdValue > signalThreshold) macdSignal = 'bullish';
    else macdSignal = 'neutral';

    // Price velocity
    const recent = prices.slice(-Math.min(7, n));
    const velocity = recent.length > 1 
      ? (recent[recent.length - 1] - recent[0]) / recent[0] 
      : 0;

    return { rsi, macdSignal, velocity };
  }

  // ─── Cross-Platform Pricing Signal ─────────────────────────

  private async getCrossPlatformPricingSignal(productId: string): Promise<{
    lowestKnownPrice: number | null;
    priceSpread: number;
    platformCount: number;
  }> {
    try {
      const result = await query(
        `SELECT MIN(current_price) as min_price, MAX(current_price) as max_price, COUNT(*) as count
         FROM platform_listings WHERE product_id = $1`,
        [productId]
      );

      if (result.rows.length === 0 || parseInt(result.rows[0].count) === 0) {
        return { lowestKnownPrice: null, priceSpread: 0, platformCount: 0 };
      }

      const minPrice = parseFloat(result.rows[0].min_price);
      const maxPrice = parseFloat(result.rows[0].max_price);
      const count = parseInt(result.rows[0].count);

      return {
        lowestKnownPrice: minPrice,
        priceSpread: maxPrice > 0 ? (maxPrice - minPrice) / maxPrice : 0,
        platformCount: count,
      };
    } catch {
      return { lowestKnownPrice: null, priceSpread: 0, platformCount: 0 };
    }
  }

  // ─── Event Adjustment ──────────────────────────────────────

  private async getEventAdjustment(productId: string): Promise<{
    nearestEventDays: number;
    expectedDiscount: number;
    eventName: string | null;
  }> {
    const events = await eventService.getUpcomingEvents(60);

    if (events.length === 0) {
      return { nearestEventDays: -1, expectedDiscount: 0, eventName: null };
    }

    const nearest = events[0];
    const daysUntil = Math.ceil(
      (new Date(nearest.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const avgDiscount = (nearest.expectedDiscountRange.min + nearest.expectedDiscountRange.max) / 2;

    return {
      nearestEventDays: daysUntil,
      expectedDiscount: avgDiscount,
      eventName: nearest.name,
    };
  }

  // ─── Enhanced Ensemble Prediction ──────────────────────────

  private enhancedEnsemblePrediction(
    productId: string,
    currentPrice: number,
    arima: ReturnType<typeof this.arimaPredict>,
    seasonal: ReturnType<typeof this.seasonalDecomposition>,
    hw: ReturnType<typeof this.holtWintersSmooth>,
    elasticity: ReturnType<typeof this.priceElasticityAnalysis>,
    momentum: ReturnType<typeof this.momentumAnalysis>,
    eventFactor: Awaited<ReturnType<typeof this.getEventAdjustment>>,
    crossPlatform: Awaited<ReturnType<typeof this.getCrossPlatformPricingSignal>>,
    dataPoints: number
  ): PricePrediction {
    // Dynamic model weights - Adjusted for better accuracy
    const weights = {
      arima: 0.35,
      holtWinters: 0.25,
      elasticity: 0.15,
      seasonal: 0.05,
      event: 0.10,
      crossPlatform: 0.10,
    };

    // Increase event weight if a major sale is imminent
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 14) {
      const proximityFactor = 1 - (eventFactor.nearestEventDays / 14);
      weights.event = 0.10 + 0.30 * proximityFactor;
      weights.arima -= 0.15 * proximityFactor;
      weights.holtWinters -= 0.10 * proximityFactor;
    }
    if (crossPlatform.platformCount > 2) {
      weights.crossPlatform = 0.20;
      weights.arima = 0.25;
      weights.holtWinters = 0.20;
    }
    if (dataPoints < 30) {
      weights.seasonal = 0.05;
      weights.arima = 0.35;
    }

    // Normalize weights
    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
    Object.keys(weights).forEach(k => {
      (weights as any)[k] /= totalWeight;
    });

    // Calculate expected price range
    let expectedLow = arima.expectedLow;
    let expectedHigh = arima.expectedHigh;

    // Blend with Holt-Winters
    const hwLow = hw.forecastNext * 0.95;
    const hwHigh = hw.forecastNext * 1.05;
    expectedLow = expectedLow * weights.arima + hwLow * weights.holtWinters + 
                  expectedLow * (1 - weights.arima - weights.holtWinters);
    expectedHigh = expectedHigh * weights.arima + hwHigh * weights.holtWinters + 
                   expectedHigh * (1 - weights.arima - weights.holtWinters);

    // Apply elasticity bounds
    expectedLow = Math.max(expectedLow, elasticity.priceFloor);
    expectedHigh = Math.min(expectedHigh, elasticity.priceCeiling);

    // Apply seasonal adjustment
    const seasonalAdjustment = 1 + seasonal.seasonalFactor * weights.seasonal * 2;
    expectedLow *= seasonalAdjustment;
    expectedHigh *= seasonalAdjustment;

    // Apply event adjustment
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      const eventDiscount = eventFactor.expectedDiscount / 100;
      const proximity = 1 - (eventFactor.nearestEventDays / 30);
      const eventLow = currentPrice * (1 - eventDiscount * (1 + proximity * 0.5));
      expectedLow = expectedLow * (1 - weights.event) + eventLow * weights.event;
    }

    // Cross-platform floor 
    if (crossPlatform.lowestKnownPrice && crossPlatform.lowestKnownPrice < expectedLow) {
      expectedLow = expectedLow * 0.7 + crossPlatform.lowestKnownPrice * 0.3;
    }

    // Ensure range makes sense
    expectedLow = Math.max(0.01, Math.round(expectedLow * 100) / 100);
    expectedHigh = Math.max(expectedLow * 1.01, Math.round(expectedHigh * 100) / 100);

    // Calculate drop probability
    const dropProbability = this.calculateEnhancedDropProbability(
      currentPrice, expectedLow, expectedHigh,
      arima.trend, momentum, elasticity, eventFactor, seasonal
    );

    // Calculate wait days
    const suggestedWaitDays = this.calculateSmartWaitDays(
      arima.trend, momentum, eventFactor, dropProbability, seasonal
    );

    // Calculate confidence
    const arimaConf = arima.confidence;
    const dataConf = Math.min(1, dataPoints / 60);
    const momentumConf = momentum.rsi > 20 && momentum.rsi < 80 ? 0.8 : 0.5;
    const confidence = Math.round(
      (arimaConf * 0.4 + dataConf * 0.3 + momentumConf * 0.3) * 100
    ) / 100;

    // Build analysis factors
    const factors = this.buildEnhancedFactors(
      arima, seasonal, hw, elasticity, momentum, eventFactor, crossPlatform, currentPrice
    );

    return {
      productId,
      currentPrice: Math.round(currentPrice * 100) / 100,
      expectedPriceRange: { low: expectedLow, high: expectedHigh },
      dropProbability: Math.round(dropProbability * 100) / 100,
      suggestedWaitDays,
      confidenceScore: confidence,
      modelUsed: PredictionModel.ENSEMBLE,
      factors,
      generatedAt: new Date(),
    };
  }

  // ─── Enhanced Drop Probability ─────────────────────────────

  private calculateEnhancedDropProbability(
    currentPrice: number,
    expectedLow: number,
    expectedHigh: number,
    trend: 'up' | 'down' | 'flat',
    momentum: ReturnType<typeof this.momentumAnalysis>,
    elasticity: ReturnType<typeof this.priceElasticityAnalysis>,
    eventFactor: { nearestEventDays: number; expectedDiscount: number },
    seasonal: { isHistoricallyLow: boolean; monthEffect: number }
  ): number {
    let probability = 0;

    // Base: price position in range - Increased weight to 50%
    if (expectedLow < currentPrice) {
      const dropRange = currentPrice - expectedLow;
      const totalRange = expectedHigh - expectedLow;
      probability = totalRange > 0 ? (dropRange / totalRange) * 0.5 : 0.25;
    }

    // Trend signal - Weighted more heavily
    if (trend === 'down') probability += 0.20;
    else if (trend === 'up') probability -= 0.15;

    // RSI signal
    if (momentum.rsi > 70) probability += 0.15;
    else if (momentum.rsi < 30) probability -= 0.10;

    // MACD signal
    if (momentum.macdSignal === 'bearish') probability += 0.08;
    else if (momentum.macdSignal === 'bullish') probability -= 0.06;

    // Mean reversion
    if (elasticity.currentPosition > 0.7) probability += 0.12;
    else if (elasticity.currentPosition < 0.3) probability -= 0.08;

    // Event proximity
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      const eventImpact = (eventFactor.expectedDiscount / 100) * 0.3;
      const proximityBoost = 1 - (eventFactor.nearestEventDays / 30);
      probability += eventImpact * (0.5 + proximityBoost * 0.5);
    }

    // Seasonal
    if (seasonal.monthEffect < -0.03) probability += 0.05;
    else if (seasonal.monthEffect > 0.03) probability -= 0.05;

    // At historical low? Less likely to drop
    if (seasonal.isHistoricallyLow) probability -= 0.15;

    return Math.max(0.02, Math.min(0.98, probability));
  }

  // ─── Smart Wait Days ───────────────────────────────────────

  private calculateSmartWaitDays(
    trend: 'up' | 'down' | 'flat',
    momentum: ReturnType<typeof this.momentumAnalysis>,
    eventFactor: { nearestEventDays: number },
    dropProbability: number,
    seasonal: { isHistoricallyLow: boolean }
  ): number {
    if (seasonal.isHistoricallyLow && dropProbability < 0.3) return 0;
    if (dropProbability < 0.15) return 0;

    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      return eventFactor.nearestEventDays;
    }

    if (momentum.rsi > 70) return 7;
    if (trend === 'down' && momentum.velocity < -0.02) return 5;
    if (trend === 'down') return 7;
    if (trend === 'flat' && dropProbability > 0.4) return 10;
    if (trend === 'up' && dropProbability < 0.3) return 0;

    return 3;
  }

  // ─── Enhanced Factor Analysis ──────────────────────────────

  private buildEnhancedFactors(
    arima: ReturnType<typeof this.arimaPredict>,
    seasonal: ReturnType<typeof this.seasonalDecomposition>,
    hw: ReturnType<typeof this.holtWintersSmooth>,
    elasticity: ReturnType<typeof this.priceElasticityAnalysis>,
    momentum: ReturnType<typeof this.momentumAnalysis>,
    eventFactor: { nearestEventDays: number; expectedDiscount: number; eventName: string | null },
    crossPlatform: { lowestKnownPrice: number | null; priceSpread: number; platformCount: number },
    currentPrice: number
  ): PredictionFactor[] {
    const factors: PredictionFactor[] = [];

    // Price Trend
    const trendDesc = arima.trend === 'down' 
      ? `AI detects a clear downward price trend of ${(Math.abs(momentum.velocity) * 100).toFixed(1)}% per week, suggesting a further drop is likely.`
      : arima.trend === 'up'
        ? `Price is showing upward momentum (+${(momentum.velocity * 100).toFixed(1)}%/week). Buying now might avoid further increases.`
        : 'The price has stabilized at this level with no significant trend detected by AI models.';
    
    factors.push({
      name: 'AI Trend Analysis',
      impact: arima.trend === 'down' ? 'positive' : arima.trend === 'up' ? 'negative' : 'neutral',
      weight: 0.30,
      description: trendDesc,
    });

    // Momentum (RSI)
    const rsiRounded = Math.round(momentum.rsi);
    if (rsiRounded > 70) {
      factors.push({
        name: 'Overbought Signal',
        impact: 'positive',
        weight: 0.20,
        description: `RSI at ${rsiRounded} — price is overbought, likely to decrease`,
      });
    } else if (rsiRounded < 30) {
      factors.push({
        name: 'Oversold Signal',
        impact: 'negative',
        weight: 0.20,
        description: `RSI at ${rsiRounded} — price is oversold, good buying opportunity`,
      });
    } else {
      factors.push({
        name: 'Momentum',
        impact: 'neutral',
        weight: 0.15,
        description: `RSI at ${rsiRounded} — balanced price momentum`,
      });
    }

    // Price Position
    const positionPct = Math.round(elasticity.currentPosition * 100);
    factors.push({
      name: 'Historical Price Position',
      impact: positionPct > 65 ? 'positive' : positionPct < 35 ? 'negative' : 'neutral',
      weight: 0.15,
      description: positionPct > 65
        ? `Price at ${positionPct}th percentile — above average, likely to decrease`
        : positionPct < 35
          ? `Price at ${positionPct}th percentile — near historical low`
          : `Price at ${positionPct}th percentile — mid-range historically`,
    });

    // Seasonal Pattern
    if (Math.abs(seasonal.monthEffect) > 0.02) {
      const monthDir = seasonal.monthEffect < 0 ? 'lower' : 'higher';
      factors.push({
        name: 'Seasonal Pattern',
        impact: seasonal.monthEffect < 0 ? 'positive' : 'negative',
        weight: 0.10,
        description: `This month typically has ${Math.abs(Math.round(seasonal.monthEffect * 100))}% ${monthDir} prices`,
      });
    }

    // Event Factor
    if (eventFactor.eventName && eventFactor.nearestEventDays <= 60) {
      factors.push({
        name: 'Upcoming Sale Event',
        impact: 'positive',
        weight: eventFactor.nearestEventDays <= 7 ? 0.25 : 0.15,
        description: `${eventFactor.eventName} in ${eventFactor.nearestEventDays} days — expected ${eventFactor.expectedDiscount}% discount`,
      });
    }

    // Cross-Platform Intelligence
    if (crossPlatform.lowestKnownPrice && crossPlatform.platformCount > 1) {
      const savings = currentPrice - crossPlatform.lowestKnownPrice;
      if (savings > 0.01) {
        factors.push({
          name: 'Cross-Platform Price',
          impact: 'positive',
          weight: 0.10,
          description: `Available $${savings.toFixed(2)} cheaper on another platform (${crossPlatform.platformCount} tracked)`,
        });
      } else {
        factors.push({
          name: 'Cross-Platform Price',
          impact: 'neutral',
          weight: 0.05,
          description: `Best price across ${crossPlatform.platformCount} tracked platforms`,
        });
      }
    }

    // Model Consensus
    const hwTrend = hw.trendValue > 0 ? 'up' : hw.trendValue < 0 ? 'down' : 'flat';
    const modelsAgree = arima.trend === hwTrend;
    if (modelsAgree && arima.trend !== 'flat') {
      factors.push({
        name: 'Model Consensus',
        impact: arima.trend === 'down' ? 'positive' : 'negative',
        weight: 0.10,
        description: `Multiple AI models agree the price is trending ${arima.trend}`,
      });
    }

    // Normalize factor weights
    const factorTotal = factors.reduce((s, f) => s + f.weight, 0);
    factors.forEach(f => { f.weight = Math.round((f.weight / factorTotal) * 100) / 100; });

    return factors;
  }

  // ─── Math Utilities ──────────────────────────────────────────

  private movingAverage(data: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      result.push(this.mean(slice));
    }
    return result;
  }

  private calculateSlope(data: number[]): number {
    const n = data.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += data[i]; sumXY += i * data[i]; sumX2 += i * i;
    }
    const denominator = n * sumX2 - sumX * sumX;
    return denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  }

  private calculateAR1(data: number[]): number {
    if (data.length < 3) return 0;
    const mean = this.mean(data);
    let num = 0, den = 0;
    for (let i = 1; i < data.length; i++) {
      num += (data[i] - mean) * (data[i - 1] - mean);
      den += Math.pow(data[i - 1] - mean, 2);
    }
    return den !== 0 ? num / den : 0;
  }

  private calculateAR2(data: number[]): number {
    if (data.length < 4) return 0;
    const mean = this.mean(data);
    let num = 0, den = 0;
    for (let i = 2; i < data.length; i++) {
      num += (data[i] - mean) * (data[i - 2] - mean);
      den += Math.pow(data[i - 2] - mean, 2);
    }
    return den !== 0 ? num / den : 0;
  }

  private mean(data: number[]): number {
    return data.length > 0 ? data.reduce((s, v) => s + v, 0) / data.length : 0;
  }

  private variance(data: number[]): number {
    const avg = this.mean(data);
    return this.mean(data.map(v => Math.pow(v - avg, 2)));
  }

  private standardDeviation(data: number[]): number {
    return Math.sqrt(this.variance(data));
  }

  private interquartileRange(data: number[]): number {
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return (q3 || 0) - (q1 || 0);
  }

  private percentileRank(data: number[], value: number): number {
    const belowCount = data.filter(d => d < value).length;
    return Math.round((belowCount / data.length) * 100);
  }

  // ─── Database Helpers ────────────────────────────────────────

  private async getHistoryData(
    productId: string,
    platform?: Platform
  ): Promise<PriceHistoryEntry[]> {
    let sql = `
      SELECT * FROM price_history
      WHERE product_id = $1
      ORDER BY recorded_at ASC
    `;
    const params: unknown[] = [productId];

    if (platform) {
      sql = `
        SELECT * FROM price_history
        WHERE product_id = $1 AND platform = $2
        ORDER BY recorded_at ASC
      `;
      params.push(platform);
    }

    const result = await query(sql, params);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      productId: row.product_id as string,
      platform: row.platform as Platform,
      price: parseFloat(row.price as string),
      currency: (row.currency as string) || 'USD',
      discount: row.discount ? parseFloat(row.discount as string) : undefined,
      inStock: row.in_stock as boolean,
      timestamp: new Date(row.recorded_at as string),
    }));
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

  private createLowDataPrediction(
    productId: string,
    history: PriceHistoryEntry[]
  ): PricePrediction {
    const prices = history.map(h => h.price);
    const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;

    const expectedLow = Math.round(currentPrice * 0.9 * 100) / 100;
    const expectedHigh = Math.round(currentPrice * 1.1 * 100) / 100;

    return {
      productId,
      currentPrice: Math.round(currentPrice * 100) / 100,
      expectedPriceRange: { low: expectedLow, high: expectedHigh },
      dropProbability: 0.3,
      suggestedWaitDays: 7,
      confidenceScore: 0.3,
      modelUsed: PredictionModel.ARIMA,
      factors: [{
        name: 'Insufficient Data',
        impact: 'neutral',
        weight: 1,
        description: `Only ${history.length} data point${history.length !== 1 ? 's' : ''} available. Need ${PREDICTION_CONFIG.MIN_DATA_POINTS} for reliable prediction. Building history automatically — check back in a few minutes.`,
      }],
      generatedAt: new Date(),
    };
  }
}

export const predictionService = new PredictionService();
