import { Router, Request, Response, NextFunction } from 'express';
import { predictionService } from '../services/predictionService';
import { Platform } from '@shared/types';

const router = Router();

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

      const prediction = await predictionService.predict(productId, platform);

      res.json({
        success: true,
        data: prediction,
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
