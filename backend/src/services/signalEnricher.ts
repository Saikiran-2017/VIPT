import type {
  EnrichedPredictionSignals,
  PricePrediction,
  ProductProfile,
} from '@shared/types';
import type { PredictionStrategy } from './dynamicEnsemble';

/** Relative spread (hi−lo)/|mean| above this is flagged as high (FeatureEngineer cross-platform). */
const HIGH_CROSS_PLATFORM_SPREAD = 0.08;
/** Minutes without update considered stale (7 days). */
const STALE_FRESHNESS_MINUTES = 10080;
/** Upcoming retail event within this many days triggers a signal. */
const EVENT_PROXIMITY_DAYS = 10;

export type SignalEnricherOptions = {
  strategy: PredictionStrategy;
  /** When ProductProfiler failed, use counts from loaded history. */
  fallbackUsablePoints?: number;
  fallbackFreshnessMinutes?: number | null;
};

function dedupeFactors(factors: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of factors) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

/**
 * Build deterministic prediction context signals from stored data + profiler + ensemble mode.
 * Sync-only; reads from `pricePrediction.featureVector` when present (FeatureEngineer / retail_events / listings).
 */
export function enrichPredictionContext(
  _productId: string,
  profile: ProductProfile | null,
  baselinePrediction: PricePrediction,
  options?: SignalEnricherOptions
): EnrichedPredictionSignals {
  const strategy = options?.strategy ?? { mode: 'baseline_only' };
  const mode = strategy.mode;

  const usableFromProfile = profile?.usableDataPoints;
  const usable =
    usableFromProfile !== undefined && usableFromProfile !== null
      ? usableFromProfile
      : (options?.fallbackUsablePoints ?? 0);

  const freshness =
    profile?.freshnessMinutes !== undefined && profile?.freshnessMinutes !== null
      ? profile.freshnessMinutes
      : options?.fallbackFreshnessMinutes ?? null;

  const validatedFraction =
    profile?.validatedFraction !== undefined && profile?.validatedFraction !== null
      ? profile.validatedFraction
      : null;

  const feats = baselinePrediction.featureVector?.features;
  const crossPlatformSpread =
    feats && typeof feats.crossPlatformSpread === 'number'
      ? feats.crossPlatformSpread
      : null;

  const rawEventDays =
    feats && typeof feats.daysToNearestEvent === 'number' ? feats.daysToNearestEvent : null;
  const rawEventDiscount =
    feats && typeof feats.nearestEventDiscount === 'number' ? feats.nearestEventDiscount : null;

  const noUpcomingEvent =
    rawEventDays === null || rawEventDays >= 365;
  const nearestEventDays = noUpcomingEvent ? null : rawEventDays;
  const nearestEventDiscount = noUpcomingEvent ? null : rawEventDiscount;

  const signalFactors: string[] = [];

  const cold = profile?.isColdStart === true || usable < 14 || usable === 0;
  if (cold) {
    signalFactors.push('cold start fallback');
  }

  if (mode === 'smoothed') {
    signalFactors.push('volatile product smoothing applied');
  }
  if (mode === 'conservative') {
    signalFactors.push('stable product conservative mode');
  }

  if (
    rawEventDays !== null &&
    rawEventDays >= 0 &&
    rawEventDays <= EVENT_PROXIMITY_DAYS &&
    rawEventDays < 365
  ) {
    signalFactors.push('sale event within 10 days');
  }

  if (
    crossPlatformSpread !== null &&
    crossPlatformSpread > HIGH_CROSS_PLATFORM_SPREAD
  ) {
    signalFactors.push('cross-platform spread is high');
  }

  if (freshness !== null && freshness >= STALE_FRESHNESS_MINUTES) {
    signalFactors.push('stale price data');
  }

  return {
    freshnessMinutes: freshness,
    usableDataPoints: usable,
    validatedFraction,
    crossPlatformSpread,
    nearestEventDays,
    nearestEventDiscount,
    selectedPredictionMode: mode,
    signalFactors: dedupeFactors(signalFactors),
  };
}

export class SignalEnricher {
  enrichPredictionContext(
    productId: string,
    profile: ProductProfile | null,
    baselinePrediction: PricePrediction,
    options?: SignalEnricherOptions
  ): EnrichedPredictionSignals {
    return enrichPredictionContext(productId, profile, baselinePrediction, options);
  }
}

export const signalEnricher = new SignalEnricher();
