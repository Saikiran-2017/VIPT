import { Router, Request, Response, NextFunction } from 'express';
import { predictionService } from '../services/predictionService';
import { predictionEvaluationService } from '../services/predictionEvaluationService';
import { predictionOutcomeEvaluationService } from '../services/predictionOutcomeEvaluationService';
import { modelPerformanceService } from '../services/modelPerformanceService';
import { modelHealthService } from '../services/modelHealthService';
import { productProfiler } from '../services/productProfiler';
import { Platform } from '@shared/types';

const router = Router();

function parseOptionalFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * GET /api/v1/predictions/model-performance
 * Latest stored rollups + drift flags for all models (Prompt 12).
 */
router.get('/model-performance', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await modelPerformanceService.listModelPerformanceSnapshots();
    res.json({
      success: true,
      data: { models },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/predictions/model-performance/:modelName
 * Single model rollup + drift (Prompt 12).
 */
router.get(
  '/model-performance/:modelName',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { modelName } = req.params;
      const snapshot = await modelPerformanceService.getModelPerformanceSnapshot(modelName);
      if (!snapshot) {
        res.status(404).json({
          success: false,
          error: 'No model performance data for this model',
          modelName,
          timestamp: new Date(),
        });
        return;
      }
      res.json({
        success: true,
        data: snapshot,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/predictions/model-health-summary
 * Aggregate health counts (Prompt 13). Registered before /model-health/:modelName.
 */
router.get('/model-health-summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await modelHealthService.getHealthSummary();
    res.json({
      success: true,
      data: summary,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/predictions/model-health
 * Operational health for all models with severity and recommended actions (Prompt 13).
 */
router.get('/model-health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await modelHealthService.getAllModelHealth();
    res.json({
      success: true,
      data: { models },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/predictions/model-health/:modelName
 * Single-model health (Prompt 13).
 */
router.get(
  '/model-health/:modelName',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { modelName } = req.params;
      const health = await modelHealthService.getModelHealth(modelName);
      if (!health) {
        res.status(404).json({
          success: false,
          error: 'No model health data for this model',
          modelName,
          timestamp: new Date(),
        });
        return;
      }
      res.json({
        success: true,
        data: health,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/predictions/model-performance/refresh
 * Recompute rolling model_performance metrics from evaluated outcomes (Prompt 11).
 */
router.post(
  '/model-performance/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lookbackDays = parseOptionalFiniteNumber(req.body?.lookbackDays);
      const limit = parseOptionalFiniteNumber(req.body?.limit);
      const modelName =
        typeof req.body?.modelName === 'string' && req.body.modelName.trim() !== ''
          ? req.body.modelName.trim()
          : undefined;

      const result = await modelPerformanceService.refreshPerformanceRollups({
        ...(lookbackDays !== undefined ? { lookbackDays } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(modelName !== undefined ? { modelName } : {}),
      });

      res.json({
        success: true,
        ...result,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/predictions/outcomes/evaluate-pending
 * Batch: evaluate pending skeleton rows (Prompt 10).
 */
router.post(
  '/outcomes/evaluate-pending',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseOptionalFiniteNumber(req.body?.limit);
      const olderThanHours = parseOptionalFiniteNumber(req.body?.olderThanHours);
      const accurateMapeThreshold = parseOptionalFiniteNumber(req.body?.accurateMapeThreshold);

      const summary = await predictionOutcomeEvaluationService.evaluatePendingOutcomes({
        ...(limit !== undefined ? { limit } : {}),
        ...(olderThanHours !== undefined ? { olderThanHours } : {}),
        ...(accurateMapeThreshold !== undefined ? { accurateMapeThreshold } : {}),
      });

      res.json({
        success: true,
        summary,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/predictions/outcomes/:outcomeId/evaluate
 * Internal-style hook: fill skeleton outcome from validated price_history (Prompt 9).
 */
router.post(
  '/outcomes/:outcomeId/evaluate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { outcomeId } = req.params;
      const thresholdRaw = req.body?.accurateMapeThreshold;
      const accurateMapeThreshold =
        typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw)
          ? thresholdRaw
          : undefined;

      const result = await predictionOutcomeEvaluationService.evaluateOutcome(outcomeId, {
        accurateMapeThreshold,
      });

      if (result.status === 'not_found') {
        res.status(404).json({
          success: false,
          error: 'Prediction outcome not found',
          outcomeId,
          timestamp: new Date(),
        });
        return;
      }

      res.json({
        success: true,
        ...result,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/predictions/profile/:productId
 * Phase 2: deterministic product profile from validated `price_history` (routing / observability).
 * Registered before `GET /:productId` so `profile` is not captured as a product id.
 */
router.get(
  '/profile/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const platform = req.query.platform as Platform | undefined;
      const profile = await productProfiler.getProductProfile(productId, platform);
      res.json({
        success: true,
        data: profile,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/predictions/:productId
 * Get AI price prediction for a product
 */
router.get(
  '/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const platform = req.query.platform as Platform | undefined;
      const debug =
        req.query.debug === '1' ||
        req.query.debug === 'true' ||
        req.query.debug === 'yes';

      const includeEvaluation =
        req.query.includeEvaluation === '1' ||
        req.query.includeEvaluation === 'true' ||
        req.query.includeEvaluation === 'yes';

      const prediction = await predictionService.predict(productId, platform);

      const { featureVector, ...rest } = prediction;
      const data = debug ? prediction : rest;

      const evaluation = includeEvaluation
        ? await predictionEvaluationService.summarize(productId, platform)
        : undefined;

      res.json({
        success: true,
        data,
        ...(evaluation !== undefined && { evaluation }),
        ...(prediction.predictionOutcomeId !== undefined &&
          prediction.predictionOutcomeId !== null && {
            predictionOutcomeId: prediction.predictionOutcomeId,
          }),
        timestamp: new Date(),
        freshness: {
          lastUpdated: prediction.generatedAt,
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 60 * 60 * 1000),
          confidencePercent: Math.round(prediction.confidenceScore * 100),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
