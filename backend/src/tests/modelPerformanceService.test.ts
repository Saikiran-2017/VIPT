import {
  BASELINE_ROLLUP_MODEL,
  computeDriftFromMetrics,
  ModelPerformanceService,
  normalizeModelNameFromMetadata,
} from '../services/modelPerformanceService';
import { query } from '../models/database';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('normalizeModelNameFromMetadata', () => {
  it('maps baseline and empty to baseline_v1', () => {
    expect(normalizeModelNameFromMetadata(null)).toBe(BASELINE_ROLLUP_MODEL);
    expect(normalizeModelNameFromMetadata({})).toBe(BASELINE_ROLLUP_MODEL);
    expect(normalizeModelNameFromMetadata({ modelUsed: 'baseline' })).toBe(BASELINE_ROLLUP_MODEL);
  });

  it('preserves other model tags', () => {
    expect(normalizeModelNameFromMetadata({ modelUsed: 'ensemble' })).toBe('ensemble');
  });
});

describe('computeDriftFromMetrics', () => {
  it('flags when 7d MAPE exceeds 30d by more than 20%', () => {
    const r = computeDriftFromMetrics({
      mape_7d: 10,
      mape_30d: 4,
      directional_accuracy_7d: 0.8,
      directional_accuracy_30d: 0.8,
    });
    expect(r.driftFlag).toBe(true);
    expect(r.driftReason).toContain('MAPE');
  });

  it('flags when directional 7d is materially below 30d', () => {
    const r = computeDriftFromMetrics({
      mape_7d: 1,
      mape_30d: 1,
      directional_accuracy_7d: 0.5,
      directional_accuracy_30d: 0.7,
    });
    expect(r.driftFlag).toBe(true);
    expect(r.driftReason).toContain('directional');
  });

  it('returns no drift when metrics are stable', () => {
    const r = computeDriftFromMetrics({
      mape_7d: 4,
      mape_30d: 4,
      directional_accuracy_7d: 0.7,
      directional_accuracy_30d: 0.7,
    });
    expect(r.driftFlag).toBe(false);
    expect(r.driftReason).toBe('');
  });
});

describe('ModelPerformanceService', () => {
  const svc = new ModelPerformanceService();

  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('refreshRollupsForModel upserts metrics from aggregates', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ v: 4.5, n: 3 }] })
      .mockResolvedValueOnce({ rows: [{ v: 5.1, n: 10 }] })
      .mockResolvedValueOnce({ rows: [{ v: 0.66, n: 2 }] })
      .mockResolvedValueOnce({ rows: [{ v: 0.7, n: 8 }] })
      .mockResolvedValueOnce({ rows: [{ n: 12 }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const n = await svc.refreshRollupsForModel(BASELINE_ROLLUP_MODEL);

    expect(n).toBe(5);
    expect(mockedQuery.mock.calls.length).toBeGreaterThanOrEqual(10);
    const inserts = mockedQuery.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO model_performance')
    );
    expect(inserts.length).toBe(5);
  });

  it('updateForEvaluatedOutcome no-ops when row missing', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });

    await svc.updateForEvaluatedOutcome('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('updateForEvaluatedOutcome refreshes when evaluated', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ evaluated_at: new Date().toISOString(), outcome_metadata: { modelUsed: 'baseline' } }],
      })
      .mockResolvedValueOnce({ rows: [{ v: 0, n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ v: 0, n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ v: 0, n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ v: 0, n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await svc.updateForEvaluatedOutcome('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(mockedQuery.mock.calls[0][0]).toContain('FROM prediction_outcomes WHERE id');
    expect(mockedQuery.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('refreshPerformanceRollups is idempotent for a single model', async () => {
    const setupMocks = () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [{ v: 1, n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ v: 2, n: 2 }] })
        .mockResolvedValueOnce({ rows: [{ v: 1, n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ v: 1, n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ n: 2 }] })
        .mockResolvedValue({ rows: [], rowCount: 1 });
    };

    mockedQuery.mockReset();
    setupMocks();
    const a = await svc.refreshPerformanceRollups({ modelName: BASELINE_ROLLUP_MODEL });

    mockedQuery.mockReset();
    setupMocks();
    const b = await svc.refreshPerformanceRollups({ modelName: BASELINE_ROLLUP_MODEL });

    expect(a.modelsProcessed).toEqual([BASELINE_ROLLUP_MODEL]);
    expect(b.modelsProcessed).toEqual([BASELINE_ROLLUP_MODEL]);
    expect(a.metricsUpserted).toBe(b.metricsUpserted);
  });

  it('refreshPerformanceRollups discovers distinct models when modelName omitted', async () => {
    mockedQuery.mockImplementation((sql: string) => {
      const s = String(sql);
      if (s.includes('DISTINCT') && s.includes('AS model')) {
        return Promise.resolve({
          rows: [{ model: BASELINE_ROLLUP_MODEL }, { model: 'ensemble' }],
        });
      }
      if (s.includes('INSERT INTO model_performance')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (s.includes('COUNT(*)::int AS n') && !s.includes('FILTER')) {
        return Promise.resolve({ rows: [{ n: 4 }] });
      }
      return Promise.resolve({ rows: [{ v: 2.5, n: 3 }] });
    });

    const r = await svc.refreshPerformanceRollups({ limit: 10 });

    expect(r.modelsProcessed).toEqual([BASELINE_ROLLUP_MODEL, 'ensemble']);
    expect(r.metricsUpserted).toBe(10);
    expect(mockedQuery.mock.calls[0][0]).toContain('DISTINCT');
  });

  it('listModelPerformanceSnapshots builds snapshots and drift from rows', async () => {
    const t = new Date('2025-06-15T12:00:00.000Z');
    mockedQuery.mockResolvedValueOnce({
      rows: [
        { model_name: 'baseline_v1', metric_name: 'mape_7d', metric_value: 6, updated_at: t },
        { model_name: 'baseline_v1', metric_name: 'mape_30d', metric_value: 4, updated_at: t },
        { model_name: 'baseline_v1', metric_name: 'directional_accuracy_7d', metric_value: 0.7, updated_at: t },
        { model_name: 'baseline_v1', metric_name: 'directional_accuracy_30d', metric_value: 0.7, updated_at: t },
        { model_name: 'baseline_v1', metric_name: 'sample_count', metric_value: 8, updated_at: t },
      ],
    });

    const list = await svc.listModelPerformanceSnapshots();

    expect(list).toHaveLength(1);
    expect(list[0].mape_7d).toBe(6);
    expect(list[0].mape_30d).toBe(4);
    expect(list[0].driftFlag).toBe(true);
    expect(list[0].driftReason).toContain('MAPE');
  });

  it('getModelPerformanceSnapshot returns null when no rows', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });

    const one = await svc.getModelPerformanceSnapshot('baseline_v1');

    expect(one).toBeNull();
  });
});
