import { Router, Request, Response, NextFunction } from 'express';
import { recommendationService } from '../services/recommendationService';
import { antiManipulationService } from '../services/antiManipulationService';
import { Platform } from '@shared/types';

const router = Router();

/**
 * GET /api/v1/recommendation/anti-manipulation/:productId
 * Get discount manipulation analysis
 */
router.get(
  '/anti-manipulation/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const platform = req.query.platform as Platform | undefined;

      const analysis = await antiManipulationService.analyze(productId, platform);

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date(),
        freshness: {
          lastUpdated: new Date(),
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 30 * 60 * 1000),
          confidencePercent: Math.round(analysis.confidence * 100),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/recommendation/:productId
 * Get smart buy/wait/track recommendation
 */
router.get(
  '/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const platform = req.query.platform as Platform | undefined;

      const recommendation = await recommendationService.getRecommendation(
        productId,
        platform
      );

      res.json({
        success: true,
        data: recommendation,
        timestamp: new Date(),
        freshness: {
          lastUpdated: new Date(),
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 30 * 60 * 1000),
          confidencePercent: Math.round(recommendation.confidence * 100),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
