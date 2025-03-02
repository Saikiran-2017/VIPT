import axios from 'axios';
import type { PricePoint } from '@shared/types';
import { query } from '../models/database';
import { logger } from '../utils/logger';

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1/latest';
const FX_CACHE_TTL_SEC = 24 * 60 * 60;
const DUPLICATE_WINDOW_HOURS = 4;
const HIGH_USD_THRESHOLD = 100_000;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const CROSS_PLATFORM_DEVIATION = 0.4;
const IQR_RECENT_DAYS = 90;
const IQR_MAX_POINTS = 200;

export type ValidationQuality = 'validated' | 'suspicious' | 'rejected';

export interface ValidationResult {
  quality: ValidationQuality;
  reasons: string[];
  /** Normalized observation value in USD (for analytics; not persisted unless schema adds a column). */
  normalizedPriceUSD: number;
}

function fxCacheKey(from: string): string {
  return `fx:${from.toUpperCase()}:USD`;
}

async function safeCacheGet<T>(key: string): Promise<T | null> {
  try {
    const { cacheGet } = await import('../models/cache');
    return await cacheGet<T>(key);
  } catch {
    return null;
  }
}

async function safeCacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    const { cacheSet } = await import('../models/cache');
    await cacheSet(key, value, ttl);
  } catch {
    /* Redis optional */
  }
}

/**
 * Validates a price observation before persisting to `price_history`.
 */
export class DataValidator {
  /**
   * Convert an amount in `fromCurrency` to USD using Frankfurter (cached in Redis when available).
   */
  async normalizeToUsd(amount: number, fromCurrency: string, reasons: string[]): Promise<number> {
    const from = (fromCurrency || 'USD').toUpperCase();
    if (from === 'USD') {
      return Math.round(amount * 100) / 100;
    }

    const cached = await safeCacheGet<number>(fxCacheKey(from));
    if (cached !== null && cached !== undefined && typeof cached === 'number') {
      return Math.round(amount * cached * 100) / 100;
    }

    try {
      const url = `${FRANKFURTER_BASE}?from=${encodeURIComponent(from)}&to=USD`;
      const { data } = await axios.get<{ rates?: { USD?: number } }>(url, { timeout: 8000 });
      const rate = data?.rates?.USD;
      if (typeof rate === 'number' && rate > 0) {
        await safeCacheSet(fxCacheKey(from), rate, FX_CACHE_TTL_SEC);
        return Math.round(amount * rate * 100) / 100;
      }
      logger.warn(`Frankfurter returned no USD rate for ${from}; using raw amount`);
      reasons.push('FX rate unavailable; amount treated as USD fallback');
      return Math.round(amount * 100) / 100;
    } catch (err) {
      logger.warn(`FX fetch failed for ${from}, using raw amount as USD fallback: ${err instanceof Error ? err.message : err}`);
      reasons.push('FX fetch failed; amount treated as USD fallback');
      return Math.round(amount * 100) / 100;
    }
  }

  private async checkDuplicate(
    productId: string,
    platform: string,
    price: number,
    currency: string
  ): Promise<boolean> {
    const res = await query(
      `SELECT 1 FROM price_history
       WHERE product_id = $1
         AND platform = $2
         AND currency = $3
         AND ABS(price::numeric - $4::numeric) < 0.005
         AND recorded_at > NOW() - $5::interval
       LIMIT 1`,
      [productId, platform, currency, price, `${DUPLICATE_WINDOW_HOURS} hours`]
    );
    return res.rows.length > 0;
  }

  private async loadRecentUsdPrices(productId: string): Promise<number[]> {
    const res = await query(
      `SELECT price, currency FROM price_history
       WHERE product_id = $1
         AND recorded_at >= NOW() - $2::interval
       ORDER BY recorded_at DESC
       LIMIT $3`,
      [productId, `${IQR_RECENT_DAYS} days`, IQR_MAX_POINTS]
    );
    const usd: number[] = [];
    for (const row of res.rows) {
      const p = parseFloat(String(row.price));
      const c = String(row.currency || 'USD');
      const scratch: string[] = [];
      usd.push(await this.normalizeToUsd(p, c, scratch));
    }
    return usd;
  }

  private iqrOutlier(historicalUsd: number[], candidateUsd: number): boolean {
    if (historicalUsd.length < 4) return false;
    const sorted = [...historicalUsd].sort((a, b) => a - b);
    const q = (p: number) => {
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (sorted[base + 1] === undefined) return sorted[base];
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    };
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    if (iqr <= 0) return false;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    return candidateUsd < low || candidateUsd > high;
  }

  private async checkCrossPlatformSuspicious(
    productId: string,
    platform: string,
    candidateUsd: number
  ): Promise<boolean> {
    const res = await query(
      `SELECT platform, current_price, currency, total_effective_price
       FROM platform_listings
       WHERE product_id = $1`,
      [productId]
    );
    if (res.rows.length < 2) return false;

    const peerUsd: number[] = [];
    for (const row of res.rows) {
      if (String(row.platform) === platform) continue;
      const price = parseFloat(String(row.total_effective_price ?? row.current_price));
      const cur = String(row.currency || 'USD');
      const scratch: string[] = [];
      peerUsd.push(await this.normalizeToUsd(price, cur, scratch));
    }
    if (peerUsd.length === 0) return false;

    peerUsd.sort((a, b) => a - b);
    const mid = Math.floor(peerUsd.length / 2);
    const median =
      peerUsd.length % 2 === 1
        ? peerUsd[mid]
        : (peerUsd[mid - 1] + peerUsd[mid]) / 2;

    if (median <= 0) return false;
    const rel = Math.abs(candidateUsd - median) / median;
    return rel > CROSS_PLATFORM_DEVIATION;
  }

  async validate(pricePoint: PricePoint, productId: string): Promise<ValidationResult> {
    const reasons: string[] = [];

    if (pricePoint.price <= 0) {
      return {
        quality: 'rejected',
        reasons: ['non-positive price'],
        normalizedPriceUSD: 0,
      };
    }

    const normalizedPriceUSD = await this.normalizeToUsd(
      pricePoint.price,
      pricePoint.currency,
      reasons
    );

    if (normalizedPriceUSD > HIGH_USD_THRESHOLD) {
      reasons.push(`normalized price exceeds ${HIGH_USD_THRESHOLD} USD`);
    }

    const dup = await this.checkDuplicate(
      productId,
      pricePoint.platform,
      pricePoint.price,
      pricePoint.currency
    );
    if (dup) {
      return {
        quality: 'rejected',
        reasons: ['duplicate same platform and price within 4 hours', ...reasons],
        normalizedPriceUSD,
      };
    }

    const recentUsd = await this.loadRecentUsdPrices(productId);
    const iqrFlag = recentUsd.length >= 4 && this.iqrOutlier(recentUsd, normalizedPriceUSD);
    if (iqrFlag) {
      reasons.push('IQR outlier vs recent history (USD-normalized)');
    }

    const cross = await this.checkCrossPlatformSuspicious(
      productId,
      pricePoint.platform,
      normalizedPriceUSD
    );
    if (cross) {
      reasons.push('cross-platform deviation vs peer listings');
    }

    if (pricePoint.confidence !== undefined && pricePoint.confidence < LOW_CONFIDENCE_THRESHOLD) {
      reasons.push(`low confidence scrape (< ${LOW_CONFIDENCE_THRESHOLD})`);
    }

    let quality: ValidationQuality = 'validated';
    if (normalizedPriceUSD > HIGH_USD_THRESHOLD) {
      quality = 'suspicious';
    }
    if (iqrFlag) {
      quality = 'suspicious';
    }
    if (cross) {
      quality = 'suspicious';
    }
    if (pricePoint.confidence !== undefined && pricePoint.confidence < LOW_CONFIDENCE_THRESHOLD) {
      quality = 'suspicious';
    }

    return { quality, reasons, normalizedPriceUSD };
  }
}

export const dataValidator = new DataValidator();
