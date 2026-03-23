import { query } from '../models/database';
import { featureEngineer } from './FeatureEngineer';
import type { FeatureVector, Platform, RetailEvent } from '@shared/types';

export type ValidatedFeatureContext = {
  prices: number[];
  dates: Date[];
  /** Present only when there are at least 2 non-rejected history rows. */
  featureVector?: FeatureVector;
};

/**
 * Loads price_history excluding rejected rows, ordered by time, and builds FeatureEngineer output when possible.
 */
export async function loadValidatedFeatureContext(
  productId: string,
  platform?: Platform
): Promise<ValidatedFeatureContext | null> {
  const params: unknown[] = [productId];
  let sql = `
    SELECT price, currency, recorded_at FROM price_history
    WHERE product_id = $1 AND quality <> 'rejected'
  `;
  if (platform) {
    sql += ` AND platform = $2`;
    params.push(platform);
  }
  sql += ` ORDER BY recorded_at ASC`;

  const ph = await query(sql, params);
  if (ph.rows.length === 0) {
    return null;
  }

  const prices = ph.rows.map((r) => parseFloat(String(r.price)));
  const dates = ph.rows.map((r) => new Date(r.recorded_at as string));

  if (prices.length === 1) {
    return { prices, dates };
  }

  const evRes = await query(
    `SELECT id, name, platform, start_date, end_date, region, expected_discount_min, expected_discount_max, categories, is_active
     FROM retail_events WHERE is_active = true`
  );
  const retailEvents: RetailEvent[] = evRes.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    platform: row.platform ? (row.platform as Platform) : undefined,
    startDate: new Date(row.start_date as string),
    endDate: new Date(row.end_date as string),
    region: String(row.region ?? 'global'),
    expectedDiscountRange: {
      min: parseFloat(String(row.expected_discount_min ?? 0)),
      max: parseFloat(String(row.expected_discount_max ?? 0)),
    },
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    isActive: Boolean(row.is_active),
  }));

  const pl = await query(
    `SELECT total_effective_price FROM platform_listings WHERE product_id = $1`,
    [productId]
  );
  const crossPlatformPrices = pl.rows.map((r) => parseFloat(String(r.total_effective_price)));

  const featureVector = featureEngineer.buildFeatureVector(
    prices,
    dates,
    retailEvents,
    crossPlatformPrices.length >= 2 ? crossPlatformPrices : undefined
  );

  return { prices, dates, featureVector };
}
