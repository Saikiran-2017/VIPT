import { query } from '../models/database';
import { logger } from '../utils/logger';
import type { Platform } from '@shared/types';
import { modelPerformanceService } from './modelPerformanceService';

const NEAR_ZERO = 1e-12;

export type EvaluateOutcomeOptions = {
  /** MAPE at or below this counts as `was_accurate` (default 5). */
  accurateMapeThreshold?: number;
};

export type EvaluatePendingOutcomesOptions = EvaluateOutcomeOptions & {
  /** Max rows to process (default 50, capped at 500). */
  limit?: number;
  /**
   * Only include outcomes whose `predicted_at` is at least this many hours in the past
   * (default 0 = any past prediction).
   */
  olderThanHours?: number;
};

export type EvaluatePendingOutcomesResult = {
  processed: number;
  evaluated: number;
  alreadyEvaluated: number;
  noActualPrice: number;
  skipped: number;
  errors: number;
};

type OutcomeRow = {
  id: string;
  product_id: string;
  predicted_price: string | number | null;
  predicted_at: Date | string;
  outcome_metadata: Record<string, unknown> | null;
  actual_price_amount: string | number | null;
  mape: string | number | null;
  direction_correct: boolean | null;
  check_date: Date | string | null;
  evaluated_at: Date | string | null;
  was_accurate: boolean | null;
};

export type PredictionOutcomeEvaluationResult =
  | {
      status: 'already_evaluated';
      outcomeId: string;
      productId: string;
      predictedPrice: number;
      predictedAt: Date;
      actualPrice: number;
      mape: number | null;
      directionCorrect: boolean | null;
      checkDate: Date;
      evaluatedAt: Date;
      wasAccurate: boolean | null;
    }
  | {
      status: 'evaluated';
      outcomeId: string;
      productId: string;
      predictedPrice: number;
      predictedAt: Date;
      actualPrice: number;
      mape: number | null;
      directionCorrect: boolean | null;
      checkDate: Date;
      evaluatedAt: Date;
      wasAccurate: boolean | null;
    }
  | {
      status: 'no_actual_price';
      outcomeId: string;
      productId: string;
      predictedAt: Date;
    }
  | { status: 'invalid_outcome'; outcomeId: string; reason: 'missing_predicted_price' }
  | { status: 'not_found'; outcomeId: string };

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function directionMatches(predicted: number, actual: number, ref: number): boolean {
  const eps = 1e-9;
  const predMove = predicted - ref;
  const actualMove = actual - ref;
  const sP = predMove > eps ? 1 : predMove < -eps ? -1 : 0;
  const sA = actualMove > eps ? 1 : actualMove < -eps ? -1 : 0;
  return sP === sA;
}

function singlePointMape(predicted: number, actual: number): number | null {
  if (!Number.isFinite(predicted) || !Number.isFinite(actual)) return null;
  const a = Math.abs(actual);
  if (a < NEAR_ZERO) return null;
  return Math.round((Math.abs(predicted - actual) / a) * 1e8) / 1e6;
}

/**
 * Fills skeleton `prediction_outcomes` rows using validated `price_history` after `predicted_at`.
 * Idempotent: rows with `evaluated_at` set are returned without recompute.
 */
export class PredictionOutcomeEvaluationService {
  async evaluateOutcome(
    outcomeId: string,
    options?: EvaluateOutcomeOptions
  ): Promise<PredictionOutcomeEvaluationResult> {
    const threshold = options?.accurateMapeThreshold ?? 5;

    const loaded = await query(
      `SELECT id, product_id, predicted_price, predicted_at, outcome_metadata,
              actual_price_amount, mape, direction_correct, check_date, evaluated_at, was_accurate
       FROM prediction_outcomes WHERE id = $1`,
      [outcomeId]
    );

    if (loaded.rows.length === 0) {
      return { status: 'not_found', outcomeId };
    }

    const row = loaded.rows[0] as OutcomeRow;
    const predictedAt = new Date(row.predicted_at as string);
    const predictedPrice = num(row.predicted_price);
    if (predictedPrice === null) {
      logger.warn('prediction_outcomes row missing predicted_price; cannot evaluate', { outcomeId });
      return { status: 'invalid_outcome', outcomeId, reason: 'missing_predicted_price' };
    }

    if (row.evaluated_at != null && num(row.actual_price_amount) != null) {
      return this.mapEvaluatedRow(row, predictedPrice, predictedAt);
    }

    const platform = this.platformFromMetadata(row.outcome_metadata);
    const productId = row.product_id;

    const refRes = await this.fetchReferencePrice(productId, predictedAt, platform);
    const referencePrice = refRes.rows[0] ? num(refRes.rows[0].price as string | number) : null;

    const actualRes = await this.fetchFirstActualAfter(productId, predictedAt, platform);
    if (actualRes.rows.length === 0) {
      return {
        status: 'no_actual_price',
        outcomeId,
        productId,
        predictedAt,
      };
    }

    const actualRow = actualRes.rows[0] as { price: string | number; recorded_at: Date | string };
    const actualPrice = num(actualRow.price);
    const checkDate = new Date(actualRow.recorded_at as string);
    if (actualPrice === null) {
      return {
        status: 'no_actual_price',
        outcomeId,
        productId,
        predictedAt,
      };
    }

    const mapeVal = singlePointMape(predictedPrice, actualPrice);
    const mapeForDb = mapeVal ?? null;
    const errorMargin = Math.abs(predictedPrice - actualPrice);

    let directionCorrect: boolean | null = null;
    if (referencePrice !== null) {
      directionCorrect = directionMatches(predictedPrice, actualPrice, referencePrice);
    }

    const wasAccurate = mapeVal !== null ? mapeVal <= threshold : null;

    const evaluatedAt = new Date();

    const updated = await query(
      `UPDATE prediction_outcomes
       SET actual_price_amount = $1,
           actual_price_currency = 'USD',
           mape = $2,
           direction_correct = $3,
           check_date = $4,
           evaluated_at = $5,
           was_accurate = $6,
           error_margin = $7
       WHERE id = $8 AND evaluated_at IS NULL
       RETURNING id, product_id, predicted_price, predicted_at, actual_price_amount, mape,
                 direction_correct, check_date, evaluated_at, was_accurate`,
      [
        actualPrice,
        mapeForDb,
        directionCorrect,
        checkDate,
        evaluatedAt,
        wasAccurate,
        errorMargin,
        outcomeId,
      ]
    );

    if (updated.rows.length === 0) {
      const again = await query(
        `SELECT id, product_id, predicted_price, predicted_at, outcome_metadata,
                actual_price_amount, mape, direction_correct, check_date, evaluated_at, was_accurate
         FROM prediction_outcomes WHERE id = $1`,
        [outcomeId]
      );
      if (again.rows.length === 0) {
        return { status: 'not_found', outcomeId };
      }
      const r = again.rows[0] as OutcomeRow;
      const pp = num(r.predicted_price);
      const pa = new Date(r.predicted_at as string);
      if (pp === null || r.evaluated_at == null) {
        return { status: 'no_actual_price', outcomeId, productId: r.product_id, predictedAt: pa };
      }
      return this.mapEvaluatedRow(r, pp, pa);
    }

    const u = updated.rows[0] as OutcomeRow;

    void modelPerformanceService.updateForEvaluatedOutcome(u.id).catch((err) =>
      logger.warn('Model performance rollup failed (outcome evaluation already succeeded)', {
        outcomeId: u.id,
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return {
      status: 'evaluated',
      outcomeId: u.id,
      productId: u.product_id,
      predictedPrice,
      predictedAt,
      actualPrice: num(u.actual_price_amount) ?? actualPrice,
      mape: num(u.mape) ?? mapeVal ?? null,
      directionCorrect: u.direction_correct,
      checkDate: new Date(u.check_date as string),
      evaluatedAt: new Date(u.evaluated_at as string),
      wasAccurate: u.was_accurate,
    };
  }

  private mapEvaluatedRow(
    row: OutcomeRow,
    predictedPrice: number,
    predictedAt: Date
  ): PredictionOutcomeEvaluationResult {
    return {
      status: 'already_evaluated',
      outcomeId: row.id,
      productId: row.product_id,
      predictedPrice,
      predictedAt,
      actualPrice: num(row.actual_price_amount) ?? 0,
      mape: num(row.mape),
      directionCorrect: row.direction_correct,
      checkDate: row.check_date ? new Date(row.check_date as string) : predictedAt,
      evaluatedAt: new Date(row.evaluated_at as string),
      wasAccurate: row.was_accurate,
    };
  }

  private platformFromMetadata(meta: Record<string, unknown> | null): Platform | undefined {
    if (!meta || typeof meta !== 'object') return undefined;
    const p = meta.platform;
    if (p === null || p === undefined) return undefined;
    if (typeof p === 'string' && p.length > 0) return p as Platform;
    return undefined;
  }

  private fetchReferencePrice(
    productId: string,
    predictedAt: Date,
    platform?: Platform
  ) {
    const params: unknown[] = [productId, predictedAt];
    let sql = `
      SELECT price, recorded_at FROM price_history
      WHERE product_id = $1 AND quality <> 'rejected' AND recorded_at <= $2`;
    if (platform) {
      sql += ` AND platform = $3`;
      params.push(platform);
    }
    sql += ` ORDER BY recorded_at DESC LIMIT 1`;
    return query(sql, params);
  }

  private fetchFirstActualAfter(productId: string, predictedAt: Date, platform?: Platform) {
    const params: unknown[] = [productId, predictedAt];
    let sql = `
      SELECT price, recorded_at FROM price_history
      WHERE product_id = $1 AND quality <> 'rejected' AND recorded_at > $2`;
    if (platform) {
      sql += ` AND platform = $3`;
      params.push(platform);
    }
    sql += ` ORDER BY recorded_at ASC LIMIT 1`;
    return query(sql, params);
  }

  /**
   * Batch: load pending skeleton rows (optionally age-gated), then run `evaluateOutcome` per id.
   * Deterministic order: oldest `predicted_at` first.
   */
  async evaluatePendingOutcomes(
    options?: EvaluatePendingOutcomesOptions
  ): Promise<EvaluatePendingOutcomesResult> {
    const rawLimit = options?.limit ?? 50;
    const limit = Math.min(500, Math.max(1, Math.floor(Number.isFinite(rawLimit) ? rawLimit : 50)));
    const rawHours = options?.olderThanHours ?? 0;
    const olderThanHours = Math.min(8760, Math.max(0, Number.isFinite(rawHours) ? rawHours : 0));

    const evalOpts: EvaluateOutcomeOptions | undefined =
      options?.accurateMapeThreshold !== undefined
        ? { accurateMapeThreshold: options.accurateMapeThreshold }
        : undefined;

    const list = await query(
      `SELECT id FROM prediction_outcomes
       WHERE evaluated_at IS NULL
         AND predicted_price IS NOT NULL
         AND predicted_at <= NOW() - (INTERVAL '1 hour' * $1::double precision)
       ORDER BY predicted_at ASC
       LIMIT $2`,
      [olderThanHours, limit]
    );

    const result: EvaluatePendingOutcomesResult = {
      processed: 0,
      evaluated: 0,
      alreadyEvaluated: 0,
      noActualPrice: 0,
      skipped: 0,
      errors: 0,
    };

    for (const row of list.rows) {
      const outcomeId = String(row.id);
      result.processed += 1;
      try {
        const r = await this.evaluateOutcome(outcomeId, evalOpts);
        switch (r.status) {
          case 'evaluated':
            result.evaluated += 1;
            break;
          case 'already_evaluated':
            result.alreadyEvaluated += 1;
            break;
          case 'no_actual_price':
            result.noActualPrice += 1;
            break;
          case 'invalid_outcome':
            result.skipped += 1;
            break;
          case 'not_found':
            result.errors += 1;
            break;
        }
      } catch (err) {
        result.errors += 1;
        logger.warn('evaluatePendingOutcomes: evaluateOutcome threw', {
          outcomeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }
}

export const predictionOutcomeEvaluationService = new PredictionOutcomeEvaluationService();
