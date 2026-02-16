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
 * AI Price Prediction Service
 * 
 * Phase 1 Models:
 * - ARIMA (AutoRegressive Integrated Moving Average)
 * - Prophet-style decomposition (seasonal + trend)
 * 
 * Factors:
 * - Historical price trends
 * - Seasonal patterns
 * - Known sale events
 * - Demand indicators (stock patterns)
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

    // Run prediction models
    const arimaResult = this.arimaPredict(prices);
    const seasonalResult = this.seasonalDecomposition(history);

    // Get event-based adjustment
    const eventFactor = await this.getEventAdjustment(productId);

    // Ensemble prediction
    const prediction = this.ensemblePrediction(
      productId,
      currentPrice,
      arimaResult,
      seasonalResult,
      eventFactor
    );

    // Cache the prediction
    await cacheSet(cacheKey, prediction, API_CONFIG.CACHE_TTL.PREDICTION);

    // Store in database
    await this.storePrediction(prediction);

    return prediction;
  }

  /**
   * Simplified ARIMA-style prediction
   * Uses autoregressive model with moving averages
   */
  private arimaPredict(prices: number[]): {
    expectedLow: number;
    expectedHigh: number;
    trend: 'up' | 'down' | 'flat';
    confidence: number;
  } {
    const n = prices.length;

    // Calculate moving averages
    const ma7 = this.movingAverage(prices, 7);
    const ma30 = this.movingAverage(prices, Math.min(30, Math.floor(n / 2)));

    // Trend detection
    const recentMA = ma7.slice(-7);
    const trendSlope = this.calculateSlope(recentMA);

    let trend: 'up' | 'down' | 'flat';
    if (trendSlope > 0.5) trend = 'up';
    else if (trendSlope < -0.5) trend = 'down';
    else trend = 'flat';

    // Calculate prediction range
    const lastPrice = prices[n - 1];
    const stdDev = this.standardDeviation(prices.slice(-30));
    const avgRecentPrice = this.mean(prices.slice(-14));

    // AR(1) coefficient estimation
    const ar1 = this.calculateAR1(prices);

    // Predicted next value using AR(1)
    const predictedNext = avgRecentPrice + ar1 * (lastPrice - avgRecentPrice);

    const expectedLow = Math.max(0, predictedNext - 1.5 * stdDev);
    const expectedHigh = predictedNext + 1.5 * stdDev;

    // Confidence based on data stability
    const cv = stdDev / avgRecentPrice;
    const confidence = Math.max(0.3, Math.min(0.95, 1 - cv));

    return { expectedLow, expectedHigh, trend, confidence };
  }

  /**
   * Seasonal decomposition (Prophet-style)
   * Detects weekly and monthly patterns
   */
  private seasonalDecomposition(history: PriceHistoryEntry[]): {
    seasonalFactor: number;
    trendComponent: number;
    residualVariance: number;
    dayOfWeekEffect: number;
  } {
    const prices = history.map(h => h.price);
    const n = prices.length;

    // Trend component (linear regression)
    const trendComponent = this.calculateSlope(prices);

    // Weekly seasonality (if enough data)
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

      dayOfWeekEffect = (todayMean - overallMean) / overallMean;
    }

    // Monthly seasonality
    let seasonalFactor = 0;
    if (n >= 30) {
      const currentMonth = new Date().getMonth();
      const monthPrices = history
        .filter(h => new Date(h.timestamp).getMonth() === currentMonth)
        .map(h => h.price);

      if (monthPrices.length > 0) {
        const overallMean = this.mean(prices);
        const monthMean = this.mean(monthPrices);
        seasonalFactor = (monthMean - overallMean) / overallMean;
      }
    }

    // Residual variance
    const detrended = prices.map((p, i) => p - (prices[0] + trendComponent * i));
    const residualVariance = this.variance(detrended);

    return { seasonalFactor, trendComponent, residualVariance, dayOfWeekEffect };
  }

  /**
   * Get event-based price adjustment
   */
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

  /**
   * Combine predictions from multiple models
   */
  private ensemblePrediction(
    productId: string,
    currentPrice: number,
    arima: ReturnType<typeof this.arimaPredict>,
    seasonal: ReturnType<typeof this.seasonalDecomposition>,
    eventFactor: Awaited<ReturnType<typeof this.getEventAdjustment>>
  ): PricePrediction {
    // Weighted ensemble - dynamic weights based on events
    let arimaWeight = 0.5;
    const seasonalWeight = 0.3;
    let eventWeight = 0.2;

    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 7) {
      eventWeight = 0.4;
      arimaWeight = 0.3;
    }

    let expectedLow = arima.expectedLow;
    let expectedHigh = arima.expectedHigh;

    // Apply seasonal adjustment
    const seasonalAdjustment = 1 + seasonal.seasonalFactor;
    expectedLow *= seasonalAdjustment;
    expectedHigh *= seasonalAdjustment;

    // Apply event adjustment
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      const eventDiscount = eventFactor.expectedDiscount / 100;
      const eventLow = currentPrice * (1 - eventDiscount * 1.2);
      const eventHigh = currentPrice * (1 - eventDiscount * 0.5);

      expectedLow = expectedLow * (1 - eventWeight) + eventLow * eventWeight;
      expectedHigh = expectedHigh * (1 - eventWeight) + eventHigh * eventWeight;
    }

    // Round prices
    expectedLow = Math.round(expectedLow * 100) / 100;
    expectedHigh = Math.round(expectedHigh * 100) / 100;

    // Calculate drop probability
    const dropProbability = this.calculateDropProbability(
      currentPrice, expectedLow, expectedHigh, arima.trend, eventFactor
    );

    // Calculate wait days
    const suggestedWaitDays = this.calculateWaitDays(
      arima.trend, eventFactor, dropProbability
    );

    // Calculate confidence
    const confidence = Math.round(arima.confidence * 100) / 100;

    // Build factors
    const factors = this.buildFactors(arima, seasonal, eventFactor, currentPrice);

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

  private calculateDropProbability(
    currentPrice: number,
    expectedLow: number,
    expectedHigh: number,
    trend: 'up' | 'down' | 'flat',
    eventFactor: { nearestEventDays: number; expectedDiscount: number }
  ): number {
    let probability = 0;

    // Base probability from price range
    if (expectedLow < currentPrice) {
      const dropRange = currentPrice - expectedLow;
      const totalRange = expectedHigh - expectedLow;
      probability = totalRange > 0 ? (dropRange / totalRange) * 0.5 : 0.25;
    }

    // Adjust for trend
    if (trend === 'down') probability += 0.2;
    else if (trend === 'up') probability -= 0.15;

    // Adjust for upcoming events
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      probability += (eventFactor.expectedDiscount / 100) * 0.3;
    }

    return Math.max(0, Math.min(1, probability));
  }

  private calculateWaitDays(
    trend: 'up' | 'down' | 'flat',
    eventFactor: { nearestEventDays: number },
    dropProbability: number
  ): number {
    if (dropProbability < 0.2) return 0; // Buy now

    // If event is coming soon, wait for it
    if (eventFactor.nearestEventDays > 0 && eventFactor.nearestEventDays <= 30) {
      return eventFactor.nearestEventDays;
    }

    // Based on trend
    if (trend === 'down') return 7;
    if (trend === 'flat') return 14;
    return 0; // Price going up, buy now
  }

  private buildFactors(
    arima: ReturnType<typeof this.arimaPredict>,
    seasonal: ReturnType<typeof this.seasonalDecomposition>,
    eventFactor: { nearestEventDays: number; expectedDiscount: number; eventName: string | null },
    currentPrice: number
  ): PredictionFactor[] {
    const factors: PredictionFactor[] = [];

    // Trend factor
    factors.push({
      name: 'Price Trend',
      impact: arima.trend === 'down' ? 'positive' : arima.trend === 'up' ? 'negative' : 'neutral',
      weight: 0.35,
      description: `Price is trending ${arima.trend}`,
    });

    // Seasonal factor
    if (Math.abs(seasonal.seasonalFactor) > 0.02) {
      factors.push({
        name: 'Seasonal Pattern',
        impact: seasonal.seasonalFactor < 0 ? 'positive' : 'negative',
        weight: 0.25,
        description: `Current season typically has ${seasonal.seasonalFactor < 0 ? 'lower' : 'higher'} prices`,
      });
    }

    // Event factor
    if (eventFactor.eventName && eventFactor.nearestEventDays <= 60) {
      factors.push({
        name: 'Upcoming Sale Event',
        impact: 'positive',
        weight: 0.3,
        description: `${eventFactor.eventName} in ${eventFactor.nearestEventDays} days (avg ${eventFactor.expectedDiscount}% off)`,
      });
    }

    // Volatility factor
    const cv = (arima.expectedHigh - arima.expectedLow) / currentPrice;
    factors.push({
      name: 'Price Volatility',
      impact: cv > 0.1 ? 'positive' : 'neutral',
      weight: 0.1,
      description: cv > 0.1
        ? 'High volatility - price drops are likely'
        : 'Price is relatively stable',
    });

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
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    return denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  }

  private calculateAR1(data: number[]): number {
    if (data.length < 3) return 0;

    const mean = this.mean(data);
    let numerator = 0;
    let denominator = 0;

    for (let i = 1; i < data.length; i++) {
      numerator += (data[i] - mean) * (data[i - 1] - mean);
      denominator += Math.pow(data[i - 1] - mean, 2);
    }

    return denominator !== 0 ? numerator / denominator : 0;
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

    // Round to 2 decimal places to avoid floating-point display issues
    const expectedLow = Math.round(currentPrice * 0.9 * 100) / 100;
    const expectedHigh = Math.round(currentPrice * 1.1 * 100) / 100;

    return {
      productId,
      currentPrice: Math.round(currentPrice * 100) / 100,
      expectedPriceRange: {
        low: expectedLow,
        high: expectedHigh,
      },
      dropProbability: 0.3,
      suggestedWaitDays: 7,
      confidenceScore: 0.3,
      modelUsed: PredictionModel.ARIMA,
      factors: [{
        name: 'Insufficient Data',
        impact: 'neutral',
        weight: 1,
        description: `Only ${history.length} data point${history.length !== 1 ? 's' : ''} available. Need ${PREDICTION_CONFIG.MIN_DATA_POINTS} for reliable prediction. Visit this product regularly to improve accuracy.`,
      }],
      generatedAt: new Date(),
    };
  }
}

export const predictionService = new PredictionService();
