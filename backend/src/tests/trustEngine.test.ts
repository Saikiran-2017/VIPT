import type { EnrichedPredictionSignals, ProductProfile } from '@shared/types';
import { buildTrustContext } from '../services/trustEngine';
import type { PredictionStrategy } from '../services/dynamicEnsemble';
import type { ModelHealth } from '../services/modelHealthService';

function profile(overrides: Partial<ProductProfile>): ProductProfile {
  return {
    productId: 'p',
    usableDataPoints: 24,
    validatedFraction: 0.92,
    freshnessMinutes: 120,
    volatilityClass: 'stable',
    isSeasonal: false,
    isColdStart: false,
    trendDirection: 'flat',
    profileConfidence: 0.82,
    recommendedBaselineMode: 'rolling_mean_7d',
    ...overrides,
  };
}

function health(overrides: Partial<ModelHealth>): ModelHealth {
  return {
    modelName: 'baseline_v1',
    latestMape7d: 4,
    latestMape30d: 4,
    latestDirectionalAccuracy7d: 0.72,
    latestDirectionalAccuracy30d: 0.7,
    sampleCount: 12,
    updatedAt: new Date(),
    driftFlag: false,
    driftReason: '',
    driftSeverity: 'low',
    healthStatus: 'healthy',
    recommendedAction: 'monitor',
    ...overrides,
  };
}

function enriched(overrides: Partial<EnrichedPredictionSignals>): EnrichedPredictionSignals {
  return {
    freshnessMinutes: 120,
    usableDataPoints: 24,
    validatedFraction: 0.92,
    crossPlatformSpread: 0.02,
    nearestEventDays: null,
    nearestEventDiscount: null,
    selectedPredictionMode: 'baseline_only',
    signalFactors: [],
    ...overrides,
  };
}

describe('buildTrustContext', () => {
  const strategy: PredictionStrategy = { mode: 'baseline_only' };

  it('produces high trust for strong data and healthy model', () => {
    const ctx = buildTrustContext({
      profile: profile({}),
      strategy,
      enrichedSignals: enriched({}),
      modelHealth: health({}),
      baselineConfidenceScore: 0.85,
      usableDataPoints: 24,
      validatedFraction: 0.92,
      freshnessMinutes: 120,
    });
    expect(ctx.trustTier).toBe('high');
    expect(ctx.trustScore).toBeGreaterThanOrEqual(72);
    expect(ctx.trustFactors.some((f) => f.includes('validated'))).toBe(true);
    expect(ctx.trustFactors).toContain('model health is healthy');
    expect(ctx.recommendedAction).toBe('use_prediction');
  });

  it('produces low trust for cold start and stale data', () => {
    const ctx = buildTrustContext({
      profile: profile({
        isColdStart: true,
        usableDataPoints: 6,
        freshnessMinutes: 12000,
        profileConfidence: 0.3,
      }),
      strategy,
      enrichedSignals: enriched({
        usableDataPoints: 6,
        freshnessMinutes: 12000,
        validatedFraction: 0.4,
      }),
      modelHealth: health({ healthStatus: 'warning' }),
      baselineConfidenceScore: 0.2,
      usableDataPoints: 6,
      validatedFraction: 0.4,
      freshnessMinutes: 12000,
    });
    expect(ctx.trustTier).toBe('low');
    expect(ctx.cautionFlags).toContain('cold start product');
    expect(ctx.cautionFlags).toContain('stale price history');
    expect(['collect_more_data', 'use_with_caution']).toContain(ctx.recommendedAction);
  });

  it('penalizes cold start', () => {
    const high = buildTrustContext({
      profile: profile({ isColdStart: false, usableDataPoints: 20 }),
      strategy,
      enrichedSignals: enriched({ usableDataPoints: 20 }),
      modelHealth: health({}),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 20,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    const low = buildTrustContext({
      profile: profile({ isColdStart: true, usableDataPoints: 10 }),
      strategy,
      enrichedSignals: enriched({ usableDataPoints: 10 }),
      modelHealth: health({}),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 10,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    expect(low.trustScore).toBeLessThan(high.trustScore);
    expect(low.cautionFlags).toContain('cold start product');
  });

  it('penalizes stale freshness', () => {
    const fresh = buildTrustContext({
      profile: profile({ freshnessMinutes: 60 }),
      strategy,
      enrichedSignals: enriched({ freshnessMinutes: 60 }),
      modelHealth: health({}),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 60,
    });
    const stale = buildTrustContext({
      profile: profile({ freshnessMinutes: 15000 }),
      strategy,
      enrichedSignals: enriched({ freshnessMinutes: 15000 }),
      modelHealth: health({}),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 15000,
    });
    expect(stale.trustScore).toBeLessThan(fresh.trustScore);
    expect(stale.cautionFlags).toContain('stale price history');
  });

  it('downgrades when model health is degraded', () => {
    const ok = buildTrustContext({
      profile: profile({}),
      strategy,
      enrichedSignals: enriched({}),
      modelHealth: health({ healthStatus: 'healthy' }),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    const bad = buildTrustContext({
      profile: profile({}),
      strategy,
      enrichedSignals: enriched({}),
      modelHealth: health({
        healthStatus: 'degraded',
        driftFlag: true,
        driftSeverity: 'high',
      }),
      baselineConfidenceScore: 0.8,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    expect(bad.trustScore).toBeLessThan(ok.trustScore);
    expect(bad.cautionFlags).toContain('degraded model health');
    expect(bad.recommendedAction).toBe('investigate_data_quality');
  });

  it('adds caution for high cross-platform spread with low profile confidence', () => {
    const ctx = buildTrustContext({
      profile: profile({ profileConfidence: 0.4 }),
      strategy,
      enrichedSignals: enriched({ crossPlatformSpread: 0.2 }),
      modelHealth: health({}),
      baselineConfidenceScore: 0.7,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    expect(ctx.cautionFlags).toContain('high cross-platform spread');
  });

  it('handles missing model health gracefully', () => {
    const ctx = buildTrustContext({
      profile: profile({}),
      strategy,
      enrichedSignals: enriched({}),
      modelHealth: null,
      baselineConfidenceScore: 0.8,
      usableDataPoints: 24,
      validatedFraction: 0.9,
      freshnessMinutes: 200,
    });
    expect(ctx.trustScore).toBeGreaterThan(0);
    expect(ctx.trustScore).toBeLessThanOrEqual(100);
  });
});
