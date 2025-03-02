import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import {
  AntiManipulationResult,
  ManipulationFlag,
  PriceHistoryEntry,
  Platform,
} from '@shared/types';
import { ANTI_MANIPULATION_CONFIG } from '@shared/constants';

/**
 * Anti-Manipulation Detection Service
 * 
 * Detects fake/artificial discount behavior:
 * - Price spikes before sales
 * - Artificial MRP inflation
 * - Never-valid reference prices
 * - Frequent suspicious price changes
 */
export class AntiManipulationService {

  /**
   * Analyze a product for discount manipulation
   */
  async analyze(productId: string, platform?: Platform): Promise<AntiManipulationResult> {
    const cacheKey = `antimanip:${productId}:${platform || 'all'}`;
    const cached = await cacheGet<AntiManipulationResult>(cacheKey);
    if (cached) return cached;

    const history = await this.getRecentHistory(productId, platform);

    if (history.length < ANTI_MANIPULATION_CONFIG.MIN_HISTORY_DAYS) {
      return this.createInsufficientDataResult();
    }

    const prices = history.map(h => h.price);
    const currentPrice = prices[prices.length - 1];
    const movingAverage30d = this.calculateMovingAverage(prices, ANTI_MANIPULATION_CONFIG.MOVING_AVERAGE_DAYS);

    const flags: ManipulationFlag[] = [];

    // Check 1: Price spike before sale
    if (this.detectPreSaleSpike(prices)) {
      flags.push(ManipulationFlag.PRICE_SPIKE_BEFORE_SALE);
    }

    // Check 2: Artificial discount (current price shown as discounted but is actually normal)
    if (this.detectArtificialDiscount(currentPrice, movingAverage30d, history)) {
      flags.push(ManipulationFlag.ARTIFICIAL_DISCOUNT);
    }

    // Check 3: Frequent suspicious price changes
    if (this.detectFrequentChanges(prices)) {
      flags.push(ManipulationFlag.FREQUENT_PRICE_CHANGES);
    }

    // Check 4: Never actually sold at the "original" price
    if (this.detectNeverSoldAtMRP(history)) {
      flags.push(ManipulationFlag.NEVER_SOLD_AT_MRP);
    }

    const isGenuineDiscount = flags.length === 0;
    const confidence = this.calculateConfidence(history.length, flags.length);

    // Determine priceBeforeDiscount
    const priceBeforeDiscount = this.findPriceBeforeDiscount(prices);

    const result: AntiManipulationResult = {
      isGenuineDiscount,
      confidence,
      flags,
      movingAverage30d,
      priceBeforeDiscount,
    };

    await cacheSet(cacheKey, result, 1800); // 30 min cache
    return result;
  }

  /**
   * Detect if price was spiked before a discount period
   */
  private detectPreSaleSpike(prices: number[]): boolean {
    if (prices.length < 14) return false;

    const currentPrice = prices[prices.length - 1];
    const recentPrices = prices.slice(-14);
    const olderPrices = prices.slice(-30, -14);

    if (olderPrices.length < 7) return false;

    const recentMax = Math.max(...recentPrices);
    const olderAvg = this.mean(olderPrices);

    // If there was a spike > 20% above the older average followed by a "discount"
    const spikeRatio = recentMax / olderAvg;
    if (spikeRatio > ANTI_MANIPULATION_CONFIG.SPIKE_THRESHOLD) {
      // Check if current price is "discounted" from the spike but still near old average
      const discountFromSpike = (recentMax - currentPrice) / recentMax;
      if (discountFromSpike > 0.15 && currentPrice >= olderAvg * 0.95) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect if the shown discount is artificial
   * (price has been at or below "discounted" price for most of history)
   */
  private detectArtificialDiscount(
    currentPrice: number,
    movingAverage30d: number,
    history: PriceHistoryEntry[]
  ): boolean {
    // If current price is ABOVE or very near the 30-day average, discount isn't genuine
    if (currentPrice >= movingAverage30d * 0.98) {
      // Check if any listed discount exists
      const lastEntry = history[history.length - 1];
      if (lastEntry.discount && lastEntry.discount > 10) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect suspiciously frequent price changes
   */
  private detectFrequentChanges(prices: number[]): boolean {
    if (prices.length < 7) return false;

    const recentPrices = prices.slice(-7);
    let changeCount = 0;
    let significantChanges = 0;

    for (let i = 1; i < recentPrices.length; i++) {
      const change = Math.abs(recentPrices[i] - recentPrices[i - 1]);
      if (change > 0.01) {
        changeCount++;
        if (change / recentPrices[i - 1] > 0.05) {
          significantChanges++;
        }
      }
    }

    // More than 4 significant changes in a week is suspicious
    return significantChanges >= 4;
  }

  /**
   * Check if the product was never actually sold at the "original" MRP
   * (i.e., the high price was set just to show a discount)
   */
  private detectNeverSoldAtMRP(history: PriceHistoryEntry[]): boolean {
    const prices = history.map(h => h.price);
    const maxPrice = Math.max(...prices);
    const avgPrice = this.mean(prices);

    // If the max price appeared very rarely (less than 5% of the time)
    const maxPriceOccurrences = prices.filter(
      p => Math.abs(p - maxPrice) < maxPrice * 0.02
    ).length;

    const maxPriceRatio = maxPriceOccurrences / prices.length;

    // And the average is significantly lower than max
    if (maxPriceRatio < 0.05 && (maxPrice - avgPrice) / maxPrice > 0.30) {
      return true;
    }

    return false;
  }

  // ─── Utility Methods ──────────────────────────────────────────

  private calculateMovingAverage(prices: number[], window: number): number {
    const slice = prices.slice(-window);
    return Math.round(this.mean(slice) * 100) / 100;
  }

  private findPriceBeforeDiscount(prices: number[]): number {
    // Look at prices 7-14 days ago
    const windowStart = Math.max(0, prices.length - 14);
    const windowEnd = Math.max(0, prices.length - 7);
    const window = prices.slice(windowStart, windowEnd);

    return window.length > 0
      ? Math.round(this.mean(window) * 100) / 100
      : prices[prices.length - 1];
  }

  private calculateConfidence(dataPoints: number, flagCount: number): number {
    // More data = higher confidence, more flags = higher confidence in manipulation
    const dataConfidence = Math.min(1, dataPoints / 60);
    return Math.round(dataConfidence * 100) / 100;
  }

  private mean(data: number[]): number {
    return data.length > 0 ? data.reduce((s, v) => s + v, 0) / data.length : 0;
  }

  private async getRecentHistory(
    productId: string,
    platform?: Platform
  ): Promise<PriceHistoryEntry[]> {
    let sql = `
      SELECT * FROM price_history
      WHERE product_id = $1
        AND recorded_at >= NOW() - INTERVAL '90 days'
    `;
    const params: unknown[] = [productId];

    if (platform) {
      sql += ' AND platform = $2';
      params.push(platform);
    }

    sql += ' ORDER BY recorded_at ASC';

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

  private createInsufficientDataResult(): AntiManipulationResult {
    return {
      isGenuineDiscount: true,
      confidence: 0.2,
      flags: [],
      movingAverage30d: 0,
      priceBeforeDiscount: 0,
    };
  }
}

export const antiManipulationService = new AntiManipulationService();
