import { buildModelHealth, ModelHealthService } from '../services/modelHealthService';
import type { ModelPerformanceSnapshot } from '../services/modelPerformanceService';
import { modelPerformanceService } from '../services/modelPerformanceService';

jest.mock('../services/modelPerformanceService', () => ({
  modelPerformanceService: {
    listModelPerformanceSnapshots: jest.fn(),
    getModelPerformanceSnapshot: jest.fn(),
  },
}));

const baseSnap = (over: Partial<ModelPerformanceSnapshot> = {}): ModelPerformanceSnapshot => ({
  model_name: 'baseline_v1',
  mape_7d: 4,
  mape_30d: 4,
  directional_accuracy_7d: 0.7,
  directional_accuracy_30d: 0.7,
  sample_count: 10,
  updated_at: new Date(),
  driftFlag: false,
  driftReason: '',
  ...over,
});

describe('buildModelHealth', () => {
  it('marks healthy when no drift, stable MAPE, enough samples', () => {
    const h = buildModelHealth(baseSnap());
    expect(h.healthStatus).toBe('healthy');
    expect(h.driftSeverity).toBe('low');
    expect(h.recommendedAction).toBe('monitor');
  });

  it('marks degraded when MAPE 7d far above 30d', () => {
    const h = buildModelHealth(
      baseSnap({
        mape_7d: 10,
        mape_30d: 4,
        driftFlag: true,
        driftReason: 'short MAPE (7d) exceeds 30d baseline by more than 20%',
      })
    );
    expect(h.healthStatus).toBe('degraded');
    expect(h.driftSeverity).toBe('high');
    expect(h.recommendedAction).toBe('investigate data quality');
  });

  it('marks warning when sample count is low', () => {
    const h = buildModelHealth(baseSnap({ sample_count: 2, driftFlag: false }));
    expect(h.healthStatus).toBe('warning');
    expect(h.recommendedAction).toBe('collect more outcomes');
  });
});

describe('ModelHealthService', () => {
  const listMock = modelPerformanceService.listModelPerformanceSnapshots as jest.Mock;
  const getMock = modelPerformanceService.getModelPerformanceSnapshot as jest.Mock;

  beforeEach(() => {
    listMock.mockReset();
    getMock.mockReset();
  });

  it('getHealthSummary aggregates counts', async () => {
    listMock.mockResolvedValueOnce([
      baseSnap({ model_name: 'm1' }),
      baseSnap({
        model_name: 'm2',
        mape_7d: 20,
        mape_30d: 5,
        driftFlag: true,
        driftReason: 'x',
      }),
    ]);

    const svc = new ModelHealthService();
    const s = await svc.getHealthSummary();

    expect(s.totalModels).toBe(2);
    expect(s.healthyCount).toBe(1);
    expect(s.degradedCount).toBe(1);
    expect(s.warningCount).toBe(0);
    expect(s.driftObservedCount).toBe(1);
    expect(s.highestMape7dModel).toBe('m2');
  });
});
