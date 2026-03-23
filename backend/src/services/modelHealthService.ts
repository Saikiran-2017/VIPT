import {
  modelPerformanceService,
  type ModelPerformanceSnapshot,
} from './modelPerformanceService';

export type DriftSeverity = 'low' | 'medium' | 'high';

export type HealthStatus = 'healthy' | 'warning' | 'degraded';

/** Operational view over stored `model_performance` rollups (Prompt 13). */
export type ModelHealth = {
  modelName: string;
  latestMape7d: number;
  latestMape30d: number;
  latestDirectionalAccuracy7d: number;
  latestDirectionalAccuracy30d: number;
  sampleCount: number;
  updatedAt: Date | null;
  driftFlag: boolean;
  driftReason: string;
  driftSeverity: DriftSeverity;
  healthStatus: HealthStatus;
  recommendedAction: string;
};

export type HealthSummary = {
  totalModels: number;
  healthyCount: number;
  warningCount: number;
  degradedCount: number;
  driftObservedCount: number;
  highestMape7dModel: string | null;
  generatedAt: string;
};

const MIN_SAMPLES_HEALTHY = 5;
const MAPE_HEALTHY_RATIO = 1.1;
const MAPE_DEGRADED_RATIO = 1.3;
const DIR_SHARP_DROP = 0.75;

/**
 * Map a performance snapshot to health fields (deterministic, stored metrics only).
 */
export function buildModelHealth(s: ModelPerformanceSnapshot): ModelHealth {
  const mapeRatio =
    s.mape_30d > 1e-9 ? s.mape_7d / s.mape_30d : s.mape_7d > 0 ? Number.POSITIVE_INFINITY : 1;

  const sharpDirectionalDrop =
    s.directional_accuracy_30d > 0.01 &&
    s.directional_accuracy_7d < s.directional_accuracy_30d * DIR_SHARP_DROP;

  let driftSeverity: DriftSeverity = 'low';
  if (s.driftFlag) {
    const mapeHigh = mapeRatio > MAPE_DEGRADED_RATIO;
    const mapeMed = mapeRatio > 1.2 && mapeRatio <= MAPE_DEGRADED_RATIO;
    const dirSevere =
      s.directional_accuracy_30d > 0.01 &&
      s.directional_accuracy_7d < s.directional_accuracy_30d * 0.75;
    const dirModerate =
      s.directional_accuracy_30d > 0.01 &&
      s.directional_accuracy_7d < s.directional_accuracy_30d * 0.85 &&
      !dirSevere;

    if (mapeHigh || dirSevere || (s.sample_count < 3 && mapeRatio > 1.25 && s.mape_30d > 0)) {
      driftSeverity = 'high';
    } else if (mapeMed || dirModerate || mapeRatio > 1.2) {
      driftSeverity = 'medium';
    } else {
      driftSeverity = 'low';
    }
  }

  const healthStatus = computeHealthStatus(s, mapeRatio, sharpDirectionalDrop, driftSeverity);

  const mh: ModelHealth = {
    modelName: s.model_name,
    latestMape7d: s.mape_7d,
    latestMape30d: s.mape_30d,
    latestDirectionalAccuracy7d: s.directional_accuracy_7d,
    latestDirectionalAccuracy30d: s.directional_accuracy_30d,
    sampleCount: s.sample_count,
    updatedAt: s.updated_at,
    driftFlag: s.driftFlag,
    driftReason: s.driftReason,
    driftSeverity,
    healthStatus,
    recommendedAction: pickRecommendedAction(s, healthStatus),
  };

  return mh;
}

function computeHealthStatus(
  s: ModelPerformanceSnapshot,
  mapeRatio: number,
  sharpDirectionalDrop: boolean,
  driftSeverity: DriftSeverity
): HealthStatus {
  if (s.sample_count === 0) {
    return 'warning';
  }

  const degraded =
    s.mape_7d > s.mape_30d * MAPE_DEGRADED_RATIO ||
    sharpDirectionalDrop ||
    (s.sample_count < 3 && s.driftFlag && s.mape_30d > 0 && s.mape_7d > s.mape_30d * 1.2) ||
    driftSeverity === 'high';

  if (degraded) {
    return 'degraded';
  }

  const healthy =
    !s.driftFlag &&
    s.mape_7d <= s.mape_30d * MAPE_HEALTHY_RATIO + 1e-9 &&
    s.sample_count >= MIN_SAMPLES_HEALTHY;

  if (healthy) {
    return 'healthy';
  }

  return 'warning';
}

function pickRecommendedAction(s: ModelPerformanceSnapshot, healthStatus: HealthStatus): string {
  if (s.sample_count < 3) {
    return 'collect more outcomes';
  }
  if (healthStatus === 'degraded') {
    return 'investigate data quality';
  }
  if (healthStatus === 'warning' && s.driftFlag) {
    return 'refresh rollups';
  }
  if (healthStatus === 'warning' && s.sample_count < MIN_SAMPLES_HEALTHY) {
    return 'collect more outcomes';
  }
  if (healthStatus === 'warning') {
    return 'monitor';
  }
  return 'monitor';
}

export class ModelHealthService {
  async getAllModelHealth(): Promise<ModelHealth[]> {
    const snaps = await modelPerformanceService.listModelPerformanceSnapshots();
    return snaps.map(buildModelHealth);
  }

  async getModelHealth(modelName: string): Promise<ModelHealth | null> {
    const snap = await modelPerformanceService.getModelPerformanceSnapshot(modelName);
    if (!snap) return null;
    return buildModelHealth(snap);
  }

  /** Aggregate counts for dashboards / ops (stored metrics only). */
  async getHealthSummary(): Promise<HealthSummary> {
    const all = await this.getAllModelHealth();
    let healthyCount = 0;
    let warningCount = 0;
    let degradedCount = 0;
    let driftObservedCount = 0;
    let highestMape7dModel: string | null = null;
    let highestMape7d = -1;

    for (const h of all) {
      if (h.healthStatus === 'healthy') healthyCount += 1;
      else if (h.healthStatus === 'warning') warningCount += 1;
      else degradedCount += 1;
      if (h.driftFlag) driftObservedCount += 1;
      if (h.latestMape7d > highestMape7d) {
        highestMape7d = h.latestMape7d;
        highestMape7dModel = h.modelName;
      }
    }

    return {
      totalModels: all.length,
      healthyCount,
      warningCount,
      degradedCount,
      driftObservedCount,
      highestMape7dModel: highestMape7d >= 0 ? highestMape7dModel : null,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const modelHealthService = new ModelHealthService();
