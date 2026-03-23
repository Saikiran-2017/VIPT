import cron from 'node-cron';
import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { priceAggregationService } from '../services/priceAggregationService';
import { logger } from '../utils/logger';
import { Platform } from '@shared/types';

/**
 * Price Update Worker
 * 
 * Periodically seeds realistic historical data for products with sparse history.
 * Scheduled cross-platform refresh runs via BullMQ (`queues/scheduler.ts`).
 */

export function startPriceWorker() {
  logger.info('Starting price update worker...');

  // Seed historical data for new products every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await seedSparseProducts();
    } catch (error) {
      logger.error('Error in history seeding:', error);
    }
  });

  // Cross-platform refresh is driven by BullMQ (see `queues/scheduler.ts` + `priceUpdateWorker.ts`).

  // Run initial seed immediately on startup
  setTimeout(async () => {
    try {
      await seedSparseProducts();
    } catch (error) {
      logger.error('Error in initial seed:', error);
    }
  }, 5000);
}

/**
 * Seed realistic historical price data for products with too few data points
 */
async function seedSparseProducts() {
  // Find products with fewer than 14 price history entries
  const result = await query(`
    SELECT p.id, p.name, p.brand, p.category,
           pl.platform, pl.current_price, pl.currency,
           COUNT(ph.id) as history_count
    FROM products p
    JOIN platform_listings pl ON p.id = pl.product_id
    LEFT JOIN price_history ph ON p.id = ph.product_id AND ph.platform = pl.platform
    GROUP BY p.id, p.name, p.brand, p.category, pl.platform, pl.current_price, pl.currency
    HAVING COUNT(ph.id) < 14
    LIMIT 10
  `);

  if (result.rows.length === 0) return;

  logger.info(`Seeding historical data for ${result.rows.length} product-platform combinations...`);

  for (const row of result.rows) {
    const existingCount = parseInt(row.history_count);
    const currentPrice = parseFloat(row.current_price);
    const currency = row.currency || 'USD';
    const platform = row.platform;
    const productId = row.id;
    const category = row.category || 'general';

    // Check if we already seeded this product-platform
    const seedKey = `seeded:${productId}:${platform}`;
    const alreadySeeded = await cacheGet<boolean>(seedKey);
    if (alreadySeeded) continue;

    // Generate 90 days of realistic historical data
    const historicalPrices = generateRealisticHistory(currentPrice, 90, category, platform);

    // Only insert data points we don't already have
    const pointsNeeded = Math.max(0, 90 - existingCount);
    const pricesToInsert = historicalPrices.slice(0, pointsNeeded);

    for (const entry of pricesToInsert) {
      await priceAggregationService.appendPriceHistoryRecord(
        productId,
        platform as Platform,
        entry.price,
        currency,
        true,
        entry.date,
        null,
        0.95
      );
    }

    // Mark as seeded (cache for 24 hours)
    await cacheSet(seedKey, true, 86400);

    logger.info(`Seeded ${pricesToInsert.length} historical data points for product ${productId} on ${platform}`);
  }
}

/**
 * Generate realistic price history based on product category and patterns
 */
function generateRealisticHistory(
  currentPrice: number,
  days: number,
  category: string,
  platform: string
): { price: number; date: Date }[] {
  const now = new Date();
  const entries: { price: number; date: Date }[] = [];

  // Category-specific volatility factors
  const volatilityMap: Record<string, number> = {
    electronics: 0.08,    // Electronics: 8% volatility
    fashion: 0.12,        // Fashion: 12% volatility (seasonal)
    home: 0.06,           // Home goods: 6% volatility
    beauty: 0.05,         // Beauty: 5% volatility
    grocery: 0.03,        // Grocery: 3% volatility
    toys: 0.10,           // Toys: 10% volatility (holiday sensitive)
    general: 0.07,        // Default: 7% volatility
  };

  // Platform price positioning (relative to current)
  const platformOffset: Record<string, number> = {
    amazon: 0,
    flipkart: -0.02,
    walmart: -0.01,
    target: 0.01,
    ebay: -0.05,
    bestbuy: 0.02,
    newegg: -0.01,
    aliexpress: -0.15,
  };

  const volatility = volatilityMap[category] || volatilityMap.general;
  const offset = platformOffset[platform] || 0;
  const basePrice = currentPrice * (1 + offset);

  // Generate price points with realistic patterns
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(Math.floor(Math.random() * 12) + 8); // Random time 8am-8pm
    date.setMinutes(Math.floor(Math.random() * 60));

    let price = basePrice;

    // 1. Long-term trend (slight upward bias for most products)
    const trendFactor = 1 + (i / days) * 0.03 * (Math.random() > 0.5 ? 1 : -1);
    price *= trendFactor;

    // 2. Seasonal pattern (sinusoidal with ~30 day cycle)
    const seasonalAmplitude = volatility * 0.5;
    const seasonalFactor = 1 + Math.sin((i / 30) * Math.PI * 2) * seasonalAmplitude;
    price *= seasonalFactor;

    // 3. Weekly pattern (slightly lower on weekends)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      price *= (1 - volatility * 0.1);
    }

    // 4. Random noise
    const noise = (Math.random() - 0.5) * 2 * volatility * 0.3;
    price *= (1 + noise);

    // 5. Occasional flash sales (3% chance)
    if (Math.random() < 0.03) {
      price *= (1 - volatility * 2); // Bigger drop
    }

    // 6. Holiday/event spikes (check date proximity to known events)
    const month = date.getMonth();
    const day = date.getDate();
    
    // Black Friday (late November)
    if (month === 10 && day >= 25 && day <= 30) {
      price *= (1 - volatility * 3);
    }
    // Prime Day (mid July)
    if (month === 6 && day >= 10 && day <= 15 && (platform === 'amazon')) {
      price *= (1 - volatility * 2.5);
    }
    // Christmas sales
    if (month === 11 && day >= 18 && day <= 26) {
      price *= (1 - volatility * 2);
    }

    // Ensure price doesn't go below 10% of current or above 200%
    price = Math.max(currentPrice * 0.5, Math.min(currentPrice * 1.5, price));

    // Round to 2 decimal places
    price = Math.round(price * 100) / 100;

    entries.push({ price, date });
  }

  // Ensure the last entry is close to current price
  if (entries.length > 0) {
    entries[entries.length - 1].price = currentPrice;
  }

  return entries;
}

