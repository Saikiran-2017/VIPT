import { Router, Request, Response, NextFunction } from 'express';
import { priceAggregationService } from '../services/priceAggregationService';
import { crossPlatformService } from '../services/crossPlatformService';
import { Platform } from '@shared/types';
import { query } from '../models/database';

const router = Router();

/**
 * GET /api/v1/prices/compare/:productId
 * Get cross-platform price comparison
 */
router.get(
  '/compare/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const comparison = await priceAggregationService.getComparison(productId);

      res.json({
        success: true,
        data: comparison,
        timestamp: new Date(),
        freshness: {
          lastUpdated: comparison.lastUpdated,
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 5 * 60 * 1000),
          confidencePercent: 95,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/prices/history/:productId
 * Get price history with stats
 */
router.get(
  '/history/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const platform = req.query.platform as Platform | undefined;
      const days = parseInt(req.query.days as string) || 90;

      const history = await priceAggregationService.getHistory(productId, platform, days);

      res.json({
        success: true,
        data: history,
        timestamp: new Date(),
        freshness: {
          lastUpdated: new Date(),
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 30 * 60 * 1000),
          confidencePercent: 98,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/prices/record
 * Manually record a price observation
 */
router.post(
  '/record',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        productId,
        platform,
        price,
        shippingCost,
        discount,
        inStock,
        url,
        platformProductId,
        deliveryEstimate,
      } = req.body;

      await priceAggregationService.recordPrice(
        productId,
        platform,
        price,
        shippingCost,
        discount,
        inStock,
        url,
        platformProductId,
        deliveryEstimate
      );

      res.json({
        success: true,
        data: { message: 'Price recorded successfully' },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/prices/cross-platform/:productId
 * Get cross-platform price intelligence
 */
router.get(
  '/cross-platform/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;

      // Get product info
      const productResult = await query(
        `SELECT p.name, p.brand, p.model_number, pl.platform, pl.current_price
         FROM products p
         JOIN platform_listings pl ON p.id = pl.product_id
         WHERE p.id = $1
         ORDER BY pl.last_updated DESC
         LIMIT 1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Product not found' });
        return;
      }

      const product = productResult.rows[0];
      const comparison = await crossPlatformService.getCrossPlatformPrices(
        productId,
        product.name,
        product.platform,
        parseFloat(product.current_price),
        product.brand,
        product.model_number
      );

      res.json({
        success: true,
        data: comparison,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
