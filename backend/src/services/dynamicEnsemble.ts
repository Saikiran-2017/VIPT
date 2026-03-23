import type { ProductProfile } from '@shared/types';

export type EnsembleMode = 'baseline_only' | 'smoothed' | 'conservative';

/**
 * Deterministic routing from ProductProfiler output (Phase 2). No ML, no randomness.
 */
export type PredictionStrategy = {
  mode: EnsembleMode;
  /** For smoothed: equal blend of rm7 and last price (0.5 each). */
  blendWeight?: number;
  /** For conservative: weight on 30d rolling mean (remainder on 7d mean). */
  longHorizonWeight?: number;
};

export type EnsemblePriceInputs = {
  currentPrice: number;
  rm7: number;
  rm30: number;
  /** Baseline point estimate (typically 7d rolling mean or last price). */
  baselinePredicted: number;
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

const CONSERVATIVE_RM30_WEIGHT = 0.65;
const CONSERVATIVE_RM7_WEIGHT = 0.35;

/**
 * Maps profiler output to an ensemble mode. Priority: cold start → low confidence → volatility band.
 */
export function getPredictionStrategy(profile: ProductProfile): PredictionStrategy {
  if (profile.isColdStart) {
    return { mode: 'baseline_only' };
  }
  if (profile.profileConfidence < 0.5) {
    return { mode: 'baseline_only' };
  }
  if (profile.volatilityClass === 'volatile') {
    return { mode: 'smoothed', blendWeight: 0.5 };
  }
  if (profile.volatilityClass === 'stable') {
    return {
      mode: 'conservative',
      longHorizonWeight: CONSERVATIVE_RM30_WEIGHT,
    };
  }
  return { mode: 'baseline_only' };
}

/**
 * Adjusts baseline point estimate according to strategy (deterministic).
 */
export function adjustPredictedPrice(
  strategy: PredictionStrategy,
  input: EnsemblePriceInputs
): number {
  const { currentPrice, rm7, rm30, baselinePredicted } = input;

  switch (strategy.mode) {
    case 'baseline_only':
      return round2(baselinePredicted);
    case 'smoothed': {
      const p = (rm7 + currentPrice) / 2;
      return round2(p);
    }
    case 'conservative': {
      const rm30Safe = rm30 > 0 ? rm30 : baselinePredicted;
      const rm7Safe = rm7 > 0 ? rm7 : baselinePredicted;
      const p = CONSERVATIVE_RM30_WEIGHT * rm30Safe + CONSERVATIVE_RM7_WEIGHT * rm7Safe;
      return round2(p);
    }
    default:
      return round2(baselinePredicted);
  }
}

export class DynamicEnsemble {
  getPredictionStrategy(profile: ProductProfile): PredictionStrategy {
    return getPredictionStrategy(profile);
  }

  adjustPredictedPrice(strategy: PredictionStrategy, input: EnsemblePriceInputs): number {
    return adjustPredictedPrice(strategy, input);
  }
}

export const dynamicEnsemble = new DynamicEnsemble();
