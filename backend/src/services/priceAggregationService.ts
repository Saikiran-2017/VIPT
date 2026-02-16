import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import {
  PlatformListing,
  PriceComparison,
  PriceHistoryEntry,
  PriceHistoryStats,
  Platform,
  VolatilityCategory,
} from '@shared/types';
import { API_CONFIG, PREDICTION_CONFIG } from '@shared/constants';
import { v4 as uuidv4 } from 'uuid';
import { antiManipulationService } from './antiManipulationService';
import { recommendationService } from './recommendationService';

/**
 * Price Aggregation Service
 * 
 * Handles:
 * - Cross-platform price comparison
 * - Price history tracking
 * - Price volatility calculation
 * - Recording new price observations
 */
export class PriceAggregationService {

  /**
   * Get cross-platform price comparison for a product
   */
  async getComparison(productId: string): Promise<PriceComparison> {
    const cacheKey = `comparison:${productId}`;
    const cached = await cacheGet<PriceComparison>(cacheKey);
    if (cached) return cached;

    // Get all listings for this product
    const listingsResult = await query(
      `SELECT * FROM platform_listings
       WHERE product_id = $1
       ORDER BY total_effective_price ASC`,
      [productId]
    );

    const listings: PlatformListing[] = listingsResult.rows.map(this.mapRowToListing);

    // Get product info
    const productResult = await query('SELECT name FROM products WHERE id = $1', [productId]);
    const productName = productResult.rows[0]?.name || 'Unknown Product';

    // Find lowest price
    const lowestPrice = listings.length > 0
      ? listings[0]
      : this.createEmptyListing(productId);

    // Get anti-manipulation results
    const antiManipulation = await antiManipulationService.analyze(productId);

    // Get recommendation
    const recommendation = await recommendationService.getRecommendation(productId);

    const comparison: PriceComparison = {
      productId,
      productName,
      listings,
      lowestPrice,
      recommendation,
      antiManipulation,
      lastUpdated: new Date(),
    };

    await cacheSet(cacheKey, comparison, API_CONFIG.CACHE_TTL.PRICE_COMPARISON);
    return comparison;
  }

  /**
   * Record a new price observation
   */
  async recordPrice(
    productId: string,
    platform: Platform,
    price: number,
    shippingCost: number = 0,
    discount?: number,
    inStock: boolean = true,
    url: string = '',
    platformProductId: string = '',
    deliveryEstimate?: string
  ): Promise<void> {
    const totalEffectivePrice = price + shippingCost;

    // Upsert platform listing
    await query(
      `INSERT INTO platform_listings
       (id, product_id, platform, platform_product_id, url, current_price, shipping_cost, total_effective_price, currency, discount_percent, delivery_estimate, in_stock, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', $9, $10, $11, NOW())
       ON CONFLICT (platform, platform_product_id) DO UPDATE SET
         current_price = $6,
         shipping_cost = $7,
         total_effective_price = $8,
         discount_percent = $9,
         delivery_estimate = $10,
         in_stock = $11,
         last_updated = NOW()`,
      [
        uuidv4(), productId, platform, platformProductId || `${platform}-${productId}`,
        url, price, shippingCost, totalEffectivePrice,
        discount ?? null, deliveryEstimate ?? null, inStock,
      ]
    );

    // Record in price history
    await query(
      `INSERT INTO price_history (id, product_id, platform, price, discount, in_stock, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [uuidv4(), productId, platform, price, discount ?? null, inStock]
    );

    logger.info(`Price recorded: ${platform} - $${price} for product ${productId}`);
  }

  /**
   * Get price history for a product
   */
  async getHistory(
    productId: string,
    platform?: Platform,
    days: number = 90
  ): Promise<PriceHistoryStats> {
    const cacheKey = `history:${productId}:${platform || 'all'}:${days}`;
    const cached = await cacheGet<PriceHistoryStats>(cacheKey);
    if (cached) return cached;

    let sql = `
      SELECT * FROM price_history
      WHERE product_id = $1
        AND recorded_at >= NOW() - $2 * INTERVAL '1 day'
    `;
    const params: unknown[] = [productId, days];

    if (platform) {
      sql += ' AND platform = $3';
      params.push(platform);
    }

    sql += ' ORDER BY recorded_at ASC';

    const result = await query(sql, params);
    const history: PriceHistoryEntry[] = result.rows.map(this.mapRowToHistory);

    const prices = history.map(h => h.price);
    const stats = this.calculateStats(prices, history);

    await cacheSet(cacheKey, stats, API_CONFIG.CACHE_TTL.PRICE_HISTORY);
    return stats;
  }

  /**
   * Calculate price statistics
   */
  private calculateStats(prices: number[], history: PriceHistoryEntry[]): PriceHistoryStats {
    if (prices.length === 0) {
      return {
        allTimeLow: 0,
        allTimeHigh: 0,
        averagePrice: 0,
        volatilityIndex: VolatilityCategory.STABLE,
        standardDeviation: 0,
        changeFrequency: 0,
        priceHistory: history,
      };
    }

    const allTimeLow = Math.min(...prices);
    const allTimeHigh = Math.max(...prices);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // Standard deviation
    const squaredDiffs = prices.map(p => Math.pow(p - averagePrice, 2));
    const standardDeviation = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / prices.length);

    // Coefficient of variation (normalized std dev)
    const cv = averagePrice > 0 ? standardDeviation / averagePrice : 0;

    // Change frequency (how often price changes)
    let changes = 0;
    for (let i = 1; i < prices.length; i++) {
      if (Math.abs(prices[i] - prices[i - 1]) > 0.01) {
        changes++;
      }
    }
    const changeFrequency = prices.length > 1 ? changes / (prices.length - 1) : 0;

    // Volatility category
    let volatilityIndex: VolatilityCategory;
    if (cv < PREDICTION_CONFIG.VOLATILITY_THRESHOLDS.STABLE) {
      volatilityIndex = VolatilityCategory.STABLE;
    } else if (cv < PREDICTION_CONFIG.VOLATILITY_THRESHOLDS.MODERATE) {
      volatilityIndex = VolatilityCategory.MODERATE;
    } else {
      volatilityIndex = VolatilityCategory.HIGHLY_VOLATILE;
    }

    return {
      allTimeLow,
      allTimeHigh,
      averagePrice: Math.round(averagePrice * 100) / 100,
      volatilityIndex,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      changeFrequency: Math.round(changeFrequency * 100) / 100,
      priceHistory: history,
    };
  }

  // ─── Mapping Helpers ─────────────────────────────────────────

  private mapRowToListing(row: Record<string, unknown>): PlatformListing {
    return {
      id: row.id as string,
      productId: row.product_id as string,
      platform: row.platform as Platform,
      platformProductId: row.platform_product_id as string,
      url: row.url as string,
      currentPrice: parseFloat(row.current_price as string),
      shippingCost: parseFloat(row.shipping_cost as string) || 0,
      totalEffectivePrice: parseFloat(row.total_effective_price as string),
      currency: row.currency as string,
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent as string) : undefined,
      deliveryEstimate: row.delivery_estimate as string | undefined,
      inStock: row.in_stock as boolean,
      lastUpdated: new Date(row.last_updated as string),
    };
  }

  private mapRowToHistory(row: Record<string, unknown>): PriceHistoryEntry {
    return {
      id: row.id as string,
      productId: row.product_id as string,
      platform: row.platform as Platform,
      price: parseFloat(row.price as string),
      discount: row.discount ? parseFloat(row.discount as string) : undefined,
      inStock: row.in_stock as boolean,
      timestamp: new Date(row.recorded_at as string),
    };
  }

  private createEmptyListing(productId: string): PlatformListing {
    return {
      id: '',
      productId,
      platform: Platform.AMAZON,
      platformProductId: '',
      url: '',
      currentPrice: 0,
      shippingCost: 0,
      totalEffectivePrice: 0,
      currency: 'USD',
      inStock: false,
      lastUpdated: new Date(),
    };
  }
}

export const priceAggregationService = new PriceAggregationService();
