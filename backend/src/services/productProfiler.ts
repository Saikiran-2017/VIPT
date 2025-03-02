import { query } from '../models/database';
import type { Platform, ProductProfile } from '@shared/types';

const COLD_START_MAX_POINTS = 13; // < 14 => cold start

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Coefficient of variation on recent prices (last up to 30 points). */
export function coefficientOfVariation(prices: number[]): number {
  const slice = prices.slice(-Math.min(30, prices.length));
  if (slice.length < 2) return 0;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (mean <= 0) return 0;
  const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance) / mean;
}

export function volatilityClassFromCv(cv: number): ProductProfile['volatilityClass'] {
  if (cv < 0.035) return 'stable';
  if (cv < 0.12) return 'moderate';
  return 'volatile';
}

/** Pearson correlation between prices[i] and prices[i-7] (aligned pairs). */
export function lag7Correlation(prices: number[]): number {
  if (prices.length < 21) return 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 7; i < prices.length; i++) {
    xs.push(prices[i]);
    ys.push(prices[i - 7]);
  }
  return pearsonCorrelation(xs, ys);
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 1e-12 ? num / den : 0;
}

/** Simple head-vs-tail trend on the last ≤14 points. */
export function trendDirectionFromPrices(prices: number[]): ProductProfile['trendDirection'] {
  if (prices.length < 4) return 'flat';
  const s = prices.slice(-Math.min(14, prices.length));
  const k = Math.max(2, Math.min(4, Math.floor(s.length / 3)));
  const head = s.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const tail = s.slice(-k).reduce((a, b) => a + b, 0) / k;
  const mid = Math.abs(head + tail) / 2 || 1;
  const rel = (tail - head) / mid;
  if (Math.abs(rel) < 0.012) return 'flat';
  return rel > 0 ? 'up' : 'down';
}

export function isSeasonalPattern(prices: number[]): boolean {
  if (prices.length < 28) return false;
  const r = lag7Correlation(prices);
  return Math.abs(r) > 0.38;
}

export function profileConfidenceFromSignals(
  usableDataPoints: number,
  validatedFraction: number,
  freshnessMinutes: number | null
): number {
  const dataScore = Math.min(1, usableDataPoints / 24);
  const freshScore =
    freshnessMinutes === null
      ? 0
      : clamp01(1 - Math.min(freshnessMinutes, 10080) / 10080);
  const vf = clamp01(validatedFraction);
  return Math.round(clamp01(0.38 * dataScore + 0.35 * vf + 0.27 * freshScore) * 1000) / 1000;
}

export function recommendedBaselineMode(p: {
  isColdStart: boolean;
  volatilityClass: ProductProfile['volatilityClass'];
}): string {
  if (p.isColdStart) return 'conservative_baseline';
  if (p.volatilityClass === 'volatile') return 'rolling_mean_7d_wide';
  if (p.volatilityClass === 'moderate') return 'rolling_mean_7d';
  return 'rolling_mean_7d';
}

/**
 * Phase 2: product classification from validated `price_history` only (no ML, no external APIs).
 */
export class ProductProfiler {
  async getProductProfile(productId: string, platform?: Platform): Promise<ProductProfile> {
    const params: unknown[] = [productId];
    let whereSql = `WHERE product_id = $1 AND quality <> 'rejected'`;
    if (platform) {
      whereSql += ` AND platform = $2`;
      params.push(platform);
    }

    const statsRes = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE quality = 'validated')::int AS validated,
         MAX(recorded_at) AS last_at
       FROM price_history
       ${whereSql}`,
      params
    );

    const row = statsRes.rows[0];
    const usableDataPoints = parseInt(String(row?.total ?? 0), 10);
    const validated = parseInt(String(row?.validated ?? 0), 10);
    const lastAt = row?.last_at ? new Date(row.last_at as string) : null;

    const pricesRes = await query(
      `SELECT price FROM price_history
       ${whereSql}
       ORDER BY recorded_at ASC`,
      params
    );
    const prices = pricesRes.rows.map((r) => parseFloat(String(r.price)));

    const validatedFraction = usableDataPoints > 0 ? validated / usableDataPoints : 0;

    let freshnessMinutes: number | null = null;
    if (lastAt) {
      freshnessMinutes = Math.round((Date.now() - lastAt.getTime()) / 60000);
    }

    const cv = coefficientOfVariation(prices);
    const volatilityClass = volatilityClassFromCv(cv);
    const isColdStart = usableDataPoints <= COLD_START_MAX_POINTS;
    const isSeasonal = isSeasonalPattern(prices);
    const trendDirection = trendDirectionFromPrices(prices);
    const profileConfidence = profileConfidenceFromSignals(
      usableDataPoints,
      validatedFraction,
      freshnessMinutes
    );

    const profile: ProductProfile = {
      productId,
      usableDataPoints,
      validatedFraction: Math.round(validatedFraction * 1000) / 1000,
      freshnessMinutes,
      volatilityClass,
      isSeasonal,
      isColdStart,
      trendDirection,
      profileConfidence,
      recommendedBaselineMode: recommendedBaselineMode({ isColdStart, volatilityClass }),
    };

    return profile;
  }

  async getProfiles(productIds: string[], platform?: Platform): Promise<ProductProfile[]> {
    const unique = [...new Set(productIds.filter((id) => id && String(id).trim() !== ''))];
    return Promise.all(unique.map((id) => this.getProductProfile(id, platform)));
  }
}

export const productProfiler = new ProductProfiler();
