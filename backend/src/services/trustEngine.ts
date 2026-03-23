import type {
  EnrichedPredictionSignals,
  ProductProfile,
  TrustContext,
} from '@shared/types';
import type { PredictionStrategy } from './dynamicEnsemble';
import type { ModelHealth } from './modelHealthService';

const STALE_MINUTES = 10080;
const HIGH_SPREAD = 0.08;
const COLD_START_POINTS = 14;

export type TrustEngineInput = {
  profile: ProductProfile | null;
  strategy: PredictionStrategy;
  enrichedSignals?: EnrichedPredictionSignals;
  modelHealth: ModelHealth | null;
  /** Baseline confidence from price stability (0–1). */
  baselineConfidenceScore: number;
  usableDataPoints: number;
  validatedFraction: number | null;
  freshnessMinutes: number | null;
};

function clamp100(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

/**
 * Deterministic trust metadata from profiler, ensemble mode, signals, and baseline model health.
 */
export function buildTrustContext(input: TrustEngineInput): TrustContext {
  const profile = input.profile;
  const es = input.enrichedSignals;
  const mh = input.modelHealth;

  const vf =
    es?.validatedFraction ?? input.validatedFraction ?? profile?.validatedFraction ?? null;
  const usable = es?.usableDataPoints ?? input.usableDataPoints;
  const fresh = es?.freshnessMinutes ?? input.freshnessMinutes ?? profile?.freshnessMinutes ?? null;
  const pc = profile?.profileConfidence ?? null;
  const cold = profile?.isColdStart === true || usable < COLD_START_POINTS;
  const spread = es?.crossPlatformSpread ?? null;

  const trustFactors: string[] = [];
  const cautionFlags: string[] = [];

  if (vf !== null && vf >= 0.82) {
    trustFactors.push('high validated data coverage');
  }
  if (fresh !== null && fresh < 1440) {
    trustFactors.push('fresh recent price history');
  }
  if (profile?.volatilityClass === 'stable') {
    trustFactors.push('stable product profile');
  }
  if (mh?.healthStatus === 'healthy') {
    trustFactors.push('model health is healthy');
  }

  if (cold) {
    cautionFlags.push('cold start product');
  }
  if (fresh !== null && fresh >= STALE_MINUTES) {
    cautionFlags.push('stale price history');
  }
  if (mh?.driftFlag && mh.driftSeverity !== 'low') {
    cautionFlags.push('recent model drift detected');
  }
  if (spread !== null && spread > HIGH_SPREAD) {
    cautionFlags.push('high cross-platform spread');
  }
  if (mh?.healthStatus === 'degraded') {
    cautionFlags.push('degraded model health');
  }
  if (input.strategy.mode === 'smoothed') {
    cautionFlags.push('volatile smoothing applied');
  }

  const vfNum = vf ?? 0.55;
  let score =
    vfNum * 22 +
    Math.min(usable / 30, 1) * 18 +
    (fresh === null ? 6 : (1 - Math.min(fresh / STALE_MINUTES, 1)) * 20) +
    (pc !== null ? pc * 14 : 7) +
    (profile?.volatilityClass === 'stable' ? 8 : profile?.volatilityClass === 'moderate' ? 4 : 2);

  if (mh) {
    if (mh.healthStatus === 'healthy') score += 14;
    else if (mh.healthStatus === 'warning') score += 5;
    else score -= 12;

    if (mh.driftFlag) {
      if (mh.driftSeverity === 'high') score -= 18;
      else if (mh.driftSeverity === 'medium') score -= 11;
      else score -= 4;
    }
  } else {
    score -= 3;
  }

  if (cold) score -= 22;
  if (fresh !== null && fresh >= STALE_MINUTES) score -= 14;
  if (spread !== null && spread > HIGH_SPREAD) {
    score -= (pc !== null && pc < 0.5) ? 14 : 7;
  }
  if (input.strategy.mode === 'smoothed') score -= 5;
  if (input.strategy.mode === 'conservative') score += 4;

  const nd = es?.nearestEventDays;
  if (nd != null && nd >= 0 && nd <= 10 && nd < 365) {
    score += 4;
  }

  score += (input.baselineConfidenceScore ?? 0) * 6;

  score = clamp100(score);

  const trustTier: TrustContext['trustTier'] =
    score >= 72 ? 'high' : score >= 48 ? 'medium' : 'low';

  const recommendedAction = pickRecommendedAction({
    trustTier,
    cold,
    usable,
    cautionFlags,
    mh,
  });

  return {
    trustScore: score,
    trustTier,
    trustFactors: dedupe(trustFactors),
    cautionFlags: dedupe(cautionFlags),
    recommendedAction,
  };
}

function pickRecommendedAction(args: {
  trustTier: TrustContext['trustTier'];
  cold: boolean;
  usable: number;
  cautionFlags: string[];
  mh: ModelHealth | null;
}): TrustContext['recommendedAction'] {
  const { trustTier, cold, usable, cautionFlags, mh } = args;

  if (usable === 0) {
    return 'collect_more_data';
  }
  if (cautionFlags.includes('degraded model health') || mh?.healthStatus === 'degraded') {
    return 'investigate_data_quality';
  }
  if (
    cautionFlags.includes('recent model drift detected') &&
    mh?.driftSeverity === 'high' &&
    trustTier === 'low'
  ) {
    return 'investigate_data_quality';
  }
  if (cold && trustTier !== 'high') {
    return 'collect_more_data';
  }
  if (trustTier === 'high') {
    return 'use_prediction';
  }
  if (trustTier === 'medium') {
    return 'use_with_caution';
  }
  if (cautionFlags.includes('stale price history') && cold) {
    return 'collect_more_data';
  }
  return 'use_with_caution';
}

export class TrustEngine {
  buildTrustContext(input: TrustEngineInput): TrustContext {
    return buildTrustContext(input);
  }
}

export const trustEngine = new TrustEngine();
