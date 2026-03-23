import { query } from '../models/database';
import type { Platform, PredictionEvaluationSummary } from '@shared/types';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Walk-forward MAE: at each step k≥7, predict next price as mean of previous 7 prices vs actual at k.
 */
export function walkForwardMaeBaseline(prices: number[]): number | null {
  if (prices.length < 8) return null;
  const errors: number[] = [];
  for (let k = 7; k < prices.length; k++) {
    const window = prices.slice(k - 7, k);
    const pred = window.reduce((a, b) => a + b, 0) / 7;
    const actual = prices[k];
    errors.push(Math.abs(pred - actual));
  }
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}

/** 0–1, higher = more volatile recent prices (coefficient of variation). */
export function volatilityScoreFromPrices(prices: number[]): number {
  const slice = prices.slice(-Math.min(30, prices.length));
  if (slice.length < 2) return 0;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (mean <= 0) return 0;
  const variance =
    slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length;
  const cv = Math.sqrt(variance) / mean;
  return clamp01(cv * 2.5);
}

/** 0–1, higher = fresher history. */
export function freshnessScoreFromHours(hours: number | null): number {
  if (hours === null || hours < 0) return 0;
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.9;
  if (hours <= 72) return 0.75;
  if (hours <= 168) return 0.55;
  if (hours <= 720) return 0.35;
  return 0.15;
}

/**
 * Observability for baseline predictions: data quality, volatility, simple backtest MAE, readiness.
 * Uses only `price_history` (non-rejected rows). No external APIs.
 */
export class PredictionEvaluationService {
  async summarize(productId: string, platform?: Platform): Promise<PredictionEvaluationSummary> {
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
    const usable = parseInt(String(row?.total ?? 0), 10);
    const validated = parseInt(String(row?.validated ?? 0), 10);
    const lastAt = row?.last_at ? new Date(row.last_at as string) : null;

    const pricesRes = await query(
      `SELECT price FROM price_history
       ${whereSql}
       ORDER BY recorded_at ASC`,
      params
    );
    const prices = pricesRes.rows.map((r) => parseFloat(String(r.price)));

    const suspiciousOrOther = Math.max(0, usable - validated);
    const validatedFraction = usable > 0 ? validated / usable : 0;

    let freshnessHours: number | null = null;
    let freshnessScore = 0;
    if (lastAt) {
      freshnessHours = (Date.now() - lastAt.getTime()) / 3600000;
      freshnessScore = freshnessScoreFromHours(freshnessHours);
    }

    const volatilityScore = volatilityScoreFromPrices(prices);
    const meanAbsoluteErrorBaseline = walkForwardMaeBaseline(prices);

    const dataScore = Math.min(1, usable / 14);
    const readinessCore = clamp01(
      0.35 * dataScore + 0.35 * validatedFraction + 0.3 * freshnessScore
    );
    const readinessScore = clamp01(readinessCore * (1 - 0.15 * volatilityScore));

    return {
      usableDataPoints: usable,
      validatedCount: validated,
      suspiciousOrOtherCount: suspiciousOrOther,
      validatedFraction: Math.round(validatedFraction * 1000) / 1000,
      lastRecordedAt: lastAt ? lastAt.toISOString() : null,
      freshnessHours: freshnessHours !== null ? Math.round(freshnessHours * 100) / 100 : null,
      freshnessScore: Math.round(freshnessScore * 100) / 100,
      volatilityScore: Math.round(volatilityScore * 100) / 100,
      meanAbsoluteErrorBaseline:
        meanAbsoluteErrorBaseline !== null
          ? Math.round(meanAbsoluteErrorBaseline * 10000) / 10000
          : null,
      readinessScore: Math.round(readinessScore * 1000) / 1000,
    };
  }
}

export const predictionEvaluationService = new PredictionEvaluationService();
