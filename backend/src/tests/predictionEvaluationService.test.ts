import {
  walkForwardMaeBaseline,
  volatilityScoreFromPrices,
  freshnessScoreFromHours,
  PredictionEvaluationService,
} from '../services/predictionEvaluationService';
import { query } from '../models/database';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('prediction evaluation helpers', () => {
  it('walkForwardMaeBaseline returns null for short series', () => {
    expect(walkForwardMaeBaseline([1, 2, 3])).toBeNull();
  });

  it('walkForwardMaeBaseline is zero for flat series', () => {
    const p = Array.from({ length: 10 }, () => 100);
    expect(walkForwardMaeBaseline(p)).toBe(0);
  });

  it('volatilityScoreFromPrices is 0 for flat series', () => {
    expect(volatilityScoreFromPrices([10, 10, 10, 10])).toBe(0);
  });

  it('freshnessScoreFromHours degrades over time', () => {
    expect(freshnessScoreFromHours(2)).toBeGreaterThan(freshnessScoreFromHours(200));
  });
});

describe('PredictionEvaluationService.summarize', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('returns zero readiness when no history', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ total: 0, validated: 0, last_at: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const svc = new PredictionEvaluationService();
    const s = await svc.summarize('p1');
    expect(s.usableDataPoints).toBe(0);
    expect(s.readinessScore).toBe(0);
    expect(s.meanAbsoluteErrorBaseline).toBeNull();
  });

  it('computes summary with enough points for MAE', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            total: 10,
            validated: 8,
            last_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 10 }, (_, i) => ({ price: String(100 + i * 0.1) })),
      });

    const svc = new PredictionEvaluationService();
    const s = await svc.summarize('p1');
    expect(s.usableDataPoints).toBe(10);
    expect(s.validatedCount).toBe(8);
    expect(s.suspiciousOrOtherCount).toBe(2);
    expect(s.readinessScore).toBeGreaterThan(0);
    expect(s.meanAbsoluteErrorBaseline).not.toBeNull();
  });
});
