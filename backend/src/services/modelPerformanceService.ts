import { query } from '../models/database';
import { logger } from '../utils/logger';

/** Canonical tag for baseline predictions in rollups (Prompt 11). */
export const BASELINE_ROLLUP_MODEL = 'baseline_v1';

/** Sentinel `window_start` values for rolling windows (not real calendar bounds). */
const ROLLING_WINDOW_7D = new Date('2000-01-07T00:00:00.000Z');
const ROLLING_WINDOW_30D = new Date('2000-01-30T00:00:00.000Z');

export type RefreshPerformanceRollupsOptions = {
  /** Only refresh this model; default includes all models seen in evaluated outcomes. */
  modelName?: string;
  /** Max distinct models to refresh when modelName is omitted (default 50). */
  limit?: number;
  /** Reserved for future use; 7d/30d windows are always recomputed. */
  lookbackDays?: number;
};

export type RefreshPerformanceRollupsResult = {
  modelsProcessed: string[];
  metricsUpserted: number;
};

/** Single-model rollup for read APIs (Prompt 12). */
export type ModelPerformanceSnapshot = {
  model_name: string;
  mape_7d: number;
  mape_30d: number;
  directional_accuracy_7d: number;
  directional_accuracy_30d: number;
  sample_count: number;
  updated_at: Date | null;
  driftFlag: boolean;
  driftReason: string;
};

type MetricRow = {
  model_name: string;
  metric_name: string;
  metric_value: string | number;
  updated_at: Date | string;
};

/**
 * Drift from stored rollups only (no ML). Rules:
 * - MAPE: short window worse than long by >20% → drift
 * - Direction: 7d rate < 85% of 30d rate (when 30d is meaningful) → drift
 */
export function computeDriftFromMetrics(m: {
  mape_7d: number;
  mape_30d: number;
  directional_accuracy_7d: number;
  directional_accuracy_30d: number;
}): { driftFlag: boolean; driftReason: string } {
  const reasons: string[] = [];

  if (
    Number.isFinite(m.mape_7d) &&
    Number.isFinite(m.mape_30d) &&
    m.mape_30d >= 0 &&
    m.mape_7d > m.mape_30d * 1.2
  ) {
    reasons.push('short MAPE (7d) exceeds 30d baseline by more than 20%');
  }

  if (
    Number.isFinite(m.directional_accuracy_7d) &&
    Number.isFinite(m.directional_accuracy_30d) &&
    m.directional_accuracy_30d > 0.01 &&
    m.directional_accuracy_7d < m.directional_accuracy_30d * 0.85
  ) {
    reasons.push('short directional accuracy materially below 30d rate');
  }

  return {
    driftFlag: reasons.length > 0,
    driftReason: reasons.join('; '),
  };
}

/**
 * Normalize `outcome_metadata.modelUsed` to a stable rollup key (matches SQL filter).
 */
export function normalizeModelNameFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return BASELINE_ROLLUP_MODEL;
  const raw = (meta as { modelUsed?: unknown }).modelUsed;
  if (raw === null || raw === undefined) return BASELINE_ROLLUP_MODEL;
  const s = String(raw).trim();
  if (s === '' || s === 'baseline') return BASELINE_ROLLUP_MODEL;
  return s;
}

function modelFilterSql(): string {
  return `(
    CASE
      WHEN COALESCE(TRIM(outcome_metadata->>'modelUsed'), '') IN ('', 'baseline') THEN '${BASELINE_ROLLUP_MODEL}'
      ELSE TRIM(outcome_metadata->>'modelUsed')
    END
  )`;
}

/**
 * Rolling aggregates from evaluated `prediction_outcomes` into `model_performance`.
 */
export class ModelPerformanceService {
  /**
   * Recompute rollups for the model on this outcome after a successful evaluation.
   * Failures are logged only; callers should not await in hot paths.
   */
  async updateForEvaluatedOutcome(outcomeId: string): Promise<void> {
    try {
      const r = await query(
        `SELECT outcome_metadata, evaluated_at FROM prediction_outcomes WHERE id = $1`,
        [outcomeId]
      );
      if (r.rows.length === 0) return;
      const evaluatedAt = r.rows[0].evaluated_at;
      if (evaluatedAt == null) return;
      const model = normalizeModelNameFromMetadata(r.rows[0].outcome_metadata);
      await this.refreshRollupsForModel(model);
    } catch (error) {
      logger.warn('ModelPerformanceService.updateForEvaluatedOutcome failed (evaluation unaffected)', {
        outcomeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Recompute rolling 7d / 30d MAPE and directional accuracy for one model.
   * @param lookbackDays30 — days for the “30d” bucket (default 30, clamped 7–90).
   */
  async refreshRollupsForModel(modelName: string, lookbackDays30 = 30): Promise<number> {
    const m = modelName.trim() || BASELINE_ROLLUP_MODEL;
    const days30 = Math.min(90, Math.max(7, Math.floor(lookbackDays30)));
    let upserts = 0;

    const mape7 = await query(
      `SELECT COALESCE(AVG(mape::double precision), 0)::numeric AS v,
              COUNT(*)::int AS n
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
         AND mape IS NOT NULL
         AND evaluated_at >= NOW() - INTERVAL '7 days'
         AND ${modelFilterSql()} = $1`,
      [m]
    );
    const mape30 = await query(
      `SELECT COALESCE(AVG(mape::double precision), 0)::numeric AS v,
              COUNT(*)::int AS n
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
         AND mape IS NOT NULL
         AND evaluated_at >= NOW() - ($2::double precision * INTERVAL '1 day')
         AND ${modelFilterSql()} = $1`,
      [m, days30]
    );

    const dir7 = await query(
      `SELECT COALESCE(AVG(CASE WHEN direction_correct IS TRUE THEN 1.0 WHEN direction_correct IS FALSE THEN 0.0 ELSE NULL END), 0)::numeric AS v,
              COUNT(*) FILTER (WHERE direction_correct IS NOT NULL)::int AS n
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
         AND evaluated_at >= NOW() - INTERVAL '7 days'
         AND ${modelFilterSql()} = $1`,
      [m]
    );
    const dir30 = await query(
      `SELECT COALESCE(AVG(CASE WHEN direction_correct IS TRUE THEN 1.0 WHEN direction_correct IS FALSE THEN 0.0 ELSE NULL END), 0)::numeric AS v,
              COUNT(*) FILTER (WHERE direction_correct IS NOT NULL)::int AS n
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
         AND evaluated_at >= NOW() - ($2::double precision * INTERVAL '1 day')
         AND ${modelFilterSql()} = $1`,
      [m, days30]
    );

    const sample30 = await query(
      `SELECT COUNT(*)::int AS n
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
         AND evaluated_at >= NOW() - ($2::double precision * INTERVAL '1 day')
         AND ${modelFilterSql()} = $1`,
      [m, days30]
    );

    const now = new Date();

    const upsert = async (
      metricName: string,
      windowStart: Date,
      metricValue: number,
      sampleSize: number
    ) => {
      await query(
        `INSERT INTO model_performance (
          model_name, metric_name, metric_value, sample_size, window_start, window_end, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (model_name, metric_name, window_start)
        DO UPDATE SET
          metric_value = EXCLUDED.metric_value,
          sample_size = EXCLUDED.sample_size,
          window_end = EXCLUDED.window_end,
          updated_at = EXCLUDED.updated_at`,
        [m, metricName, metricValue, sampleSize, windowStart, now, now]
      );
      upserts += 1;
    };

    const row7 = mape7.rows[0] as { v: string | number; n: number };
    const row30 = mape30.rows[0] as { v: string | number; n: number };
    const d7 = dir7.rows[0] as { v: string | number; n: number };
    const d30 = dir30.rows[0] as { v: string | number; n: number };
    const sc = sample30.rows[0] as { n: number };

    await upsert('mape_7d', ROLLING_WINDOW_7D, parseFloat(String(row7.v)), row7.n);
    await upsert('mape_30d', ROLLING_WINDOW_30D, parseFloat(String(row30.v)), row30.n);
    await upsert('directional_accuracy_7d', ROLLING_WINDOW_7D, parseFloat(String(d7.v)), d7.n);
    await upsert('directional_accuracy_30d', ROLLING_WINDOW_30D, parseFloat(String(d30.v)), d30.n);

    await query(
      `INSERT INTO model_performance (
        model_name, metric_name, metric_value, sample_size, window_start, window_end, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (model_name, metric_name, window_start)
      DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        sample_size = EXCLUDED.sample_size,
        window_end = EXCLUDED.window_end,
        updated_at = EXCLUDED.updated_at`,
      [m, 'sample_count', sc.n, sc.n, ROLLING_WINDOW_30D, now, now]
    );
    upserts += 1;

    return upserts;
  }

  /**
   * Refresh rollups for one model or all models (bounded).
   */
  async refreshPerformanceRollups(
    options?: RefreshPerformanceRollupsOptions
  ): Promise<RefreshPerformanceRollupsResult> {
    const limit = Math.min(200, Math.max(1, Math.floor(options?.limit ?? 50)));
    const lookback30 =
      options?.lookbackDays !== undefined && Number.isFinite(options.lookbackDays)
        ? options.lookbackDays
        : 30;
    let metricsUpserted = 0;
    const modelsProcessed: string[] = [];

    if (options?.modelName !== undefined && options.modelName.trim() !== '') {
      const m = normalizeModelNameFromMetadata({ modelUsed: options.modelName.trim() });
      metricsUpserted += await this.refreshRollupsForModel(m, lookback30);
      modelsProcessed.push(m);
      return { modelsProcessed, metricsUpserted };
    }

    const distinct = await query(
      `SELECT DISTINCT ${modelFilterSql()} AS model
       FROM prediction_outcomes
       WHERE evaluated_at IS NOT NULL
       ORDER BY 1 ASC
       LIMIT $1`,
      [limit]
    );

    for (const row of distinct.rows) {
      const name = String((row as { model: string }).model);
      metricsUpserted += await this.refreshRollupsForModel(name, lookback30);
      modelsProcessed.push(name);
    }

    return { modelsProcessed, metricsUpserted };
  }

  /**
   * Read latest stored rollups for all models that have metrics (Prompt 12).
   */
  async listModelPerformanceSnapshots(): Promise<ModelPerformanceSnapshot[]> {
    const r = await query(
      `SELECT model_name, metric_name, metric_value, updated_at
       FROM model_performance
       WHERE metric_name IN (
         'mape_7d', 'mape_30d', 'directional_accuracy_7d', 'directional_accuracy_30d', 'sample_count'
       )
       ORDER BY model_name, metric_name`
    );
    return this.rowsToSnapshots(r.rows as MetricRow[]);
  }

  /**
   * Read latest stored rollups for one model (normalized name). Returns null if none.
   */
  async getModelPerformanceSnapshot(modelName: string): Promise<ModelPerformanceSnapshot | null> {
    const m = normalizeModelNameFromMetadata({ modelUsed: modelName.trim() });
    const r = await query(
      `SELECT model_name, metric_name, metric_value, updated_at
       FROM model_performance
       WHERE model_name = $1
         AND metric_name IN (
           'mape_7d', 'mape_30d', 'directional_accuracy_7d', 'directional_accuracy_30d', 'sample_count'
         )
       ORDER BY metric_name`,
      [m]
    );
    const snaps = this.rowsToSnapshots(r.rows as MetricRow[]);
    return snaps.find((s) => s.model_name === m) ?? null;
  }

  private rowsToSnapshots(rows: MetricRow[]): ModelPerformanceSnapshot[] {
    const byModel = new Map<
      string,
      {
        model_name: string;
        mape_7d?: number;
        mape_30d?: number;
        directional_accuracy_7d?: number;
        directional_accuracy_30d?: number;
        sample_count?: number;
        updated_at: Date | null;
      }
    >();

    for (const row of rows) {
      const mn = String(row.model_name);
      if (!byModel.has(mn)) {
        byModel.set(mn, { model_name: mn, updated_at: null });
      }
      const agg = byModel.get(mn)!;
      const mv = parseFloat(String(row.metric_value));
      const val = Number.isFinite(mv) ? mv : 0;
      const u = new Date(row.updated_at as string);
      if (!agg.updated_at || u.getTime() > agg.updated_at.getTime()) {
        agg.updated_at = u;
      }
      switch (row.metric_name) {
        case 'mape_7d':
          agg.mape_7d = val;
          break;
        case 'mape_30d':
          agg.mape_30d = val;
          break;
        case 'directional_accuracy_7d':
          agg.directional_accuracy_7d = val;
          break;
        case 'directional_accuracy_30d':
          agg.directional_accuracy_30d = val;
          break;
        case 'sample_count':
          agg.sample_count = val;
          break;
        default:
          break;
      }
    }

    return Array.from(byModel.values()).map((agg) => {
      const mape7 = agg.mape_7d ?? 0;
      const mape30 = agg.mape_30d ?? 0;
      const dir7 = agg.directional_accuracy_7d ?? 0;
      const dir30 = agg.directional_accuracy_30d ?? 0;
      const sc = Math.round(agg.sample_count ?? 0);
      const drift = computeDriftFromMetrics({
        mape_7d: mape7,
        mape_30d: mape30,
        directional_accuracy_7d: dir7,
        directional_accuracy_30d: dir30,
      });
      return {
        model_name: agg.model_name,
        mape_7d: mape7,
        mape_30d: mape30,
        directional_accuracy_7d: dir7,
        directional_accuracy_30d: dir30,
        sample_count: sc,
        updated_at: agg.updated_at,
        driftFlag: drift.driftFlag,
        driftReason: drift.driftReason,
      };
    });
  }
}

export const modelPerformanceService = new ModelPerformanceService();
