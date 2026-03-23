import { PredictionModel } from '@shared/types';
import {
  PredictionService,
  baselineConfidenceFromPrices,
  rollingMeanLast,
} from '../services/predictionService';
import { loadValidatedFeatureContext } from '../services/priceHistoryForPrediction';
import { predictionOutcomeService } from '../services/predictionOutcomeService';

jest.mock('../services/priceHistoryForPrediction');
jest.mock('../services/predictionOutcomeService', () => ({
  predictionOutcomeService: {
    recordPrediction: jest.fn().mockResolvedValue('outcome-test-id'),
  },
}));
jest.mock('../models/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const mockedLoad = loadValidatedFeatureContext as jest.Mock;
const mockedRecordOutcome = predictionOutcomeService.recordPrediction as jest.Mock;

describe('baseline helpers', () => {
  it('rollingMeanLast uses up to 7 trailing points', () => {
    expect(rollingMeanLast([100, 95, 90, 85, 80, 75, 70], 7)).toBeCloseTo(85, 5);
    expect(rollingMeanLast([50, 60], 7)).toBe(55);
  });

  it('baselineConfidenceFromPrices increases when series is stable', () => {
    const stable = baselineConfidenceFromPrices([100, 101, 100, 99, 100]);
    const noisy = baselineConfidenceFromPrices([100, 120, 80, 110, 70]);
    expect(stable).toBeGreaterThan(noisy);
  });
});

describe('PredictionService (baseline + FeatureEngineer)', () => {
  let svc: PredictionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRecordOutcome.mockReset();
    mockedRecordOutcome.mockResolvedValue('outcome-test-id');
    svc = new PredictionService();
  });

  it('predict uses 7d rolling mean and BASELINE model', async () => {
    const prices = [100, 95, 90, 85, 80, 75, 70];
    mockedLoad.mockResolvedValue({
      prices,
      dates: prices.map((_, i) => new Date(Date.UTC(2024, 0, i + 1))),
      featureVector: {
        values: new Array(19).fill(0.1),
        dimension: 19,
        sourceModel: 'feature-engineer-v1',
      },
    });

    const r = await svc.predict('prod-1');
    expect(r.modelUsed).toBe(PredictionModel.BASELINE);
    expect(r.predictedPrice).toBeCloseTo(rollingMeanLast(prices, 7), 2);
    expect(r.featureVector?.dimension).toBe(19);
    expect(r.confidenceScore).toBeGreaterThan(0);
    expect(r.predictionOutcomeId).toBe('outcome-test-id');
  });

  it('predict handles empty history', async () => {
    mockedLoad.mockResolvedValue(null);
    const r = await svc.predict('none');
    expect(r.currentPrice).toBe(0);
    expect(r.predictedPrice).toBe(0);
    expect(r.modelUsed).toBe(PredictionModel.BASELINE);
    expect(r.predictionOutcomeId).toBe('outcome-test-id');
  });

  it('predict works with a single validated point (no feature vector)', async () => {
    mockedLoad.mockResolvedValue({
      prices: [42.5],
      dates: [new Date()],
    });
    const r = await svc.predict('one');
    expect(r.predictedPrice).toBe(42.5);
    expect(r.featureVector).toBeUndefined();
    expect(r.predictionOutcomeId).toBe('outcome-test-id');
  });

  it('still returns prediction when outcome skeleton returns null', async () => {
    mockedLoad.mockResolvedValue({
      prices: [10, 11, 12, 13, 14, 15, 16, 17],
      dates: Array.from({ length: 8 }, () => new Date()),
      featureVector: {
        values: new Array(19).fill(0.1),
        dimension: 19,
        sourceModel: 'feature-engineer-v1',
      },
    });
    mockedRecordOutcome.mockResolvedValueOnce(null);

    const r = await svc.predict('prod-null-outcome');
    expect(r.modelUsed).toBe(PredictionModel.BASELINE);
    expect(r.predictionOutcomeId).toBeUndefined();
  });
});
