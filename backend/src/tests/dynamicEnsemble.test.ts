import type { ProductProfile } from '@shared/types';
import {
  getPredictionStrategy,
  adjustPredictedPrice,
} from '../services/dynamicEnsemble';

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

describe('getPredictionStrategy', () => {
  it('cold start → baseline_only', () => {
    const s = getPredictionStrategy(baseProfile({ isColdStart: true, volatilityClass: 'volatile' }));
    expect(s.mode).toBe('baseline_only');
  });

  it('profileConfidence < 0.5 → baseline_only', () => {
    const s = getPredictionStrategy(
      baseProfile({ isColdStart: false, profileConfidence: 0.4, volatilityClass: 'volatile' })
    );
    expect(s.mode).toBe('baseline_only');
  });

  it('volatile + sufficient confidence → smoothed', () => {
    const s = getPredictionStrategy(
      baseProfile({ volatilityClass: 'volatile', profileConfidence: 0.6, isColdStart: false })
    );
    expect(s.mode).toBe('smoothed');
    expect(s.blendWeight).toBe(0.5);
  });

  it('stable + sufficient confidence → conservative', () => {
    const s = getPredictionStrategy(
      baseProfile({ volatilityClass: 'stable', profileConfidence: 0.6, isColdStart: false })
    );
    expect(s.mode).toBe('conservative');
    expect(s.longHorizonWeight).toBe(0.65);
  });

  it('moderate → baseline_only', () => {
    const s = getPredictionStrategy(
      baseProfile({ volatilityClass: 'moderate', profileConfidence: 0.9, isColdStart: false })
    );
    expect(s.mode).toBe('baseline_only');
  });
});

describe('adjustPredictedPrice', () => {
  it('baseline_only returns baseline', () => {
    expect(
      adjustPredictedPrice(
        { mode: 'baseline_only' },
        { currentPrice: 100, rm7: 95, rm30: 90, baselinePredicted: 95 }
      )
    ).toBe(95);
  });

  it('smoothed blends rm7 and last price', () => {
    expect(
      adjustPredictedPrice(
        { mode: 'smoothed' },
        { currentPrice: 200, rm7: 100, rm30: 110, baselinePredicted: 100 }
      )
    ).toBe(150);
  });

  it('conservative blends rm30 and rm7', () => {
    expect(
      adjustPredictedPrice(
        { mode: 'conservative' },
        { currentPrice: 100, rm7: 100, rm30: 200, baselinePredicted: 100 }
      )
    ).toBe(165);
  });
});
