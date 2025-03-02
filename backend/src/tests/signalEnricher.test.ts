import { PredictionModel, type PricePrediction, type ProductProfile } from '@shared/types';
import { enrichPredictionContext } from '../services/signalEnricher';
import type { PredictionStrategy } from '../services/dynamicEnsemble';

function baseProfile(overrides: Partial<ProductProfile>): ProductProfile {
  return {
    productId: 'p',
    usableDataPoints: 20,
    validatedFraction: 0.9,
    freshnessMinutes: 60,
    volatilityClass: 'moderate',
    isSeasonal: false,
    isColdStart: false,
    trendDirection: 'flat',
    profileConfidence: 0.75,
    recommendedBaselineMode: 'rolling_mean_7d',
    ...overrides,
  };
}

function minimalPrediction(
  overrides: Partial<PricePrediction> & { featureVector?: PricePrediction['featureVector'] }
): PricePrediction {
  return {
    productId: 'p',
    currentPrice: 100,
    expectedPriceRange: { low: 98, high: 102 },
    dropProbability: 0.1,
    suggestedWaitDays: 0,
    confidenceScore: 0.8,
    modelUsed: PredictionModel.BASELINE,
    factors: [],
    generatedAt: new Date(),
    predictedPrice: 100,
    ...overrides,
  };
}

describe('enrichPredictionContext', () => {
  it('echoes selectedPredictionMode from strategy', () => {
    const strategy: PredictionStrategy = { mode: 'smoothed' };
    const pred = minimalPrediction({});
    const out = enrichPredictionContext('p', baseProfile({ volatilityClass: 'volatile' }), pred, {
      strategy,
    });
    expect(out.selectedPredictionMode).toBe('smoothed');
    expect(out.signalFactors).toContain('volatile product smoothing applied');
  });

  it('adds stable conservative factor', () => {
    const out = enrichPredictionContext('p', baseProfile({}), minimalPrediction({}), {
      strategy: { mode: 'conservative' },
    });
    expect(out.signalFactors).toContain('stable product conservative mode');
  });

  it('adds stale price data when freshness is very old', () => {
    const pred = minimalPrediction({});
    const out = enrichPredictionContext(
      'p',
      baseProfile({ freshnessMinutes: 12000, usableDataPoints: 20 }),
      pred,
      { strategy: { mode: 'baseline_only' } }
    );
    expect(out.signalFactors).toContain('stale price data');
    expect(out.freshnessMinutes).toBe(12000);
  });

  it('adds sale event within 10 days when feature days are small', () => {
    const pred = minimalPrediction({
      featureVector: {
        values: [],
        dimension: 19,
        features: {
          lag1: 1,
          lag7: 1,
          lag14: 1,
          lag30: 1,
          rollingMean7d: 1,
          rollingMean30d: 1,
          rollingStd7d: 0,
          rollingStd30d: 0,
          rsi14: 50,
          macdSignal: 0,
          dayOfWeek: 1,
          dayOfMonth: 1,
          month: 1,
          daysToNearestEvent: 5,
          nearestEventDiscount: 10,
          pricePct30dRange: 0,
          crossPlatformSpread: 0,
          googleTrendScore: 0,
          reviewSentiment: 0,
        },
      },
    });
    const out = enrichPredictionContext('p', baseProfile({}), pred, {
      strategy: { mode: 'baseline_only' },
    });
    expect(out.signalFactors).toContain('sale event within 10 days');
    expect(out.nearestEventDays).toBe(5);
  });

  it('does not surface placeholder event when days is 365 sentinel', () => {
    const pred = minimalPrediction({
      featureVector: {
        values: [],
        dimension: 19,
        features: {
          lag1: 1,
          lag7: 1,
          lag14: 1,
          lag30: 1,
          rollingMean7d: 1,
          rollingMean30d: 1,
          rollingStd7d: 0,
          rollingStd30d: 0,
          rsi14: 50,
          macdSignal: 0,
          dayOfWeek: 1,
          dayOfMonth: 1,
          month: 1,
          daysToNearestEvent: 365,
          nearestEventDiscount: 0,
          pricePct30dRange: 0,
          crossPlatformSpread: 0,
          googleTrendScore: 0,
          reviewSentiment: 0,
        },
      },
    });
    const out = enrichPredictionContext('p', baseProfile({}), pred, {
      strategy: { mode: 'baseline_only' },
    });
    expect(out.nearestEventDays).toBeNull();
    expect(out.signalFactors.some((f) => f.includes('sale event'))).toBe(false);
  });

  it('flags high cross-platform spread', () => {
    const pred = minimalPrediction({
      featureVector: {
        values: [],
        dimension: 19,
        features: {
          lag1: 1,
          lag7: 1,
          lag14: 1,
          lag30: 1,
          rollingMean7d: 1,
          rollingMean30d: 1,
          rollingStd7d: 0,
          rollingStd30d: 0,
          rsi14: 50,
          macdSignal: 0,
          dayOfWeek: 1,
          dayOfMonth: 1,
          month: 1,
          daysToNearestEvent: 365,
          nearestEventDiscount: 0,
          pricePct30dRange: 0,
          crossPlatformSpread: 0.15,
          googleTrendScore: 0,
          reviewSentiment: 0,
        },
      },
    });
    const out = enrichPredictionContext('p', baseProfile({}), pred, {
      strategy: { mode: 'baseline_only' },
    });
    expect(out.signalFactors).toContain('cross-platform spread is high');
    expect(out.crossPlatformSpread).toBe(0.15);
  });

  it('uses fallback when profile is null', () => {
    const pred = minimalPrediction({});
    const out = enrichPredictionContext('p', null, pred, {
      strategy: { mode: 'baseline_only' },
      fallbackUsablePoints: 8,
      fallbackFreshnessMinutes: 100,
    });
    expect(out.usableDataPoints).toBe(8);
    expect(out.freshnessMinutes).toBe(100);
    expect(out.validatedFraction).toBeNull();
    expect(out.signalFactors).toContain('cold start fallback');
  });
});
