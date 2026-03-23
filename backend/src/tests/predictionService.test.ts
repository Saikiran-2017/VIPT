import { PredictionModel } from '@shared/types';
import {
  PredictionService,
  baselineConfidenceFromPrices,
  rollingMeanLast,
} from '../services/predictionService';
import { loadValidatedFeatureContext } from '../services/priceHistoryForPrediction';
import { predictionOutcomeService } from '../services/predictionOutcomeService';
import { productProfiler } from '../services/productProfiler';
import { modelHealthService } from '../services/modelHealthService';

jest.mock('../services/priceHistoryForPrediction');
jest.mock('../services/productProfiler', () => ({
  productProfiler: {
    getProductProfile: jest.fn(),
  },
}));
jest.mock('../services/modelHealthService', () => ({
  modelHealthService: {
    getModelHealth: jest.fn().mockResolvedValue({
      modelName: 'baseline_v1',
      latestMape7d: 4,
      latestMape30d: 4,
      latestDirectionalAccuracy7d: 0.7,
      latestDirectionalAccuracy30d: 0.7,
      sampleCount: 10,
      updatedAt: new Date(),
      driftFlag: false,
      driftReason: '',
      driftSeverity: 'low',
      healthStatus: 'healthy',
      recommendedAction: 'monitor',
    }),
  },
}));
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
const mockedGetProfile = productProfiler.getProductProfile as jest.Mock;
const mockedGetModelHealth = modelHealthService.getModelHealth as jest.Mock;

const coldStartProfile = {
  productId: 'prod-1',
  usableDataPoints: 7,
  validatedFraction: 1,
  freshnessMinutes: 1,
  volatilityClass: 'moderate' as const,
  isSeasonal: false,
  isColdStart: true,
  trendDirection: 'flat' as const,
  profileConfidence: 0.35,
  recommendedBaselineMode: 'conservative_baseline',
};

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
    mockedGetProfile.mockResolvedValue(coldStartProfile);
    mockedGetModelHealth.mockResolvedValue({
      modelName: 'baseline_v1',
      latestMape7d: 4,
      latestMape30d: 4,
      latestDirectionalAccuracy7d: 0.7,
      latestDirectionalAccuracy30d: 0.7,
      sampleCount: 10,
      updatedAt: new Date(),
      driftFlag: false,
      driftReason: '',
      driftSeverity: 'low',
      healthStatus: 'healthy',
      recommendedAction: 'monitor',
    });
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
    expect(r.enrichedSignals?.selectedPredictionMode).toBe('baseline_only');
    expect(r.enrichedSignals?.usableDataPoints).toBe(7);
    expect(r.enrichedSignals?.signalFactors).toContain('cold start fallback');
  });

  it('predict handles empty history', async () => {
    mockedLoad.mockResolvedValue(null);
    const r = await svc.predict('none');
    expect(r.currentPrice).toBe(0);
    expect(r.predictedPrice).toBe(0);
    expect(r.modelUsed).toBe(PredictionModel.BASELINE);
    expect(r.predictionOutcomeId).toBe('outcome-test-id');
    expect(r.enrichedSignals?.usableDataPoints).toBe(0);
    expect(r.trustContext?.recommendedAction).toBe('collect_more_data');
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

  it('uses smoothed blend when profiler reports volatile and confident', async () => {
    const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
    mockedLoad.mockResolvedValue({
      prices,
      dates: prices.map((_, i) => new Date(Date.UTC(2024, 0, i + 1))),
      featureVector: {
        values: new Array(19).fill(0.1),
        dimension: 19,
        sourceModel: 'feature-engineer-v1',
      },
    });
    mockedGetProfile.mockResolvedValueOnce({
      ...coldStartProfile,
      productId: 'volatile-prod',
      usableDataPoints: 20,
      isColdStart: false,
      volatilityClass: 'volatile',
      profileConfidence: 0.75,
    });

    const r = await svc.predict('volatile-prod');
    const rm7 = rollingMeanLast(prices, 7);
    const last = prices[prices.length - 1];
    const expectedSmoothed = Math.round(((rm7 + last) / 2) * 100) / 100;
    expect(r.predictedPrice).toBeCloseTo(expectedSmoothed, 2);
    expect(r.factors.some((f) => f.name === 'Dynamic ensemble')).toBe(true);
  });

  it('uses conservative blend when profiler reports stable and confident', async () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    mockedLoad.mockResolvedValue({
      prices,
      dates: prices.map((_, i) => new Date(Date.UTC(2024, 0, i + 1))),
      featureVector: {
        values: new Array(19).fill(0.1),
        dimension: 19,
        sourceModel: 'feature-engineer-v1',
      },
    });
    mockedGetProfile.mockResolvedValueOnce({
      ...coldStartProfile,
      productId: 'stable-prod',
      usableDataPoints: 20,
      isColdStart: false,
      volatilityClass: 'stable',
      profileConfidence: 0.75,
    });

    const r = await svc.predict('stable-prod');
    const rm7 = rollingMeanLast(prices, 7);
    const rm30 = rollingMeanLast(prices, 30);
    const expected = Math.round((0.65 * rm30 + 0.35 * rm7) * 100) / 100;
    expect(r.predictedPrice).toBeCloseTo(expected, 2);
    expect(r.factors.some((f) => f.description?.includes('Stable'))).toBe(true);
  });

  it('falls back to baseline when profiler throws', async () => {
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
    mockedGetProfile.mockRejectedValueOnce(new Error('db unavailable'));

    const r = await svc.predict('prod-fail');
    expect(r.predictedPrice).toBeCloseTo(rollingMeanLast(prices, 7), 2);
    expect(r.factors.some((f) => f.name === 'Dynamic ensemble')).toBe(false);
  });
});
