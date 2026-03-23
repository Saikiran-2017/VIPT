import { Router, Request, Response, NextFunction } from 'express';
import { predictionService } from '../services/predictionService';
import { predictionEvaluationService } from '../services/predictionEvaluationService';
import { predictionOutcomeEvaluationService } from '../services/predictionOutcomeEvaluationService';
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
