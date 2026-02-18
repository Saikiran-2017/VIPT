import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { productIdentityService } from '../services/productIdentityService';
import { priceAggregationService } from '../services/priceAggregationService';
import { validate } from '../middleware/validation';
import { Platform } from '@shared/types';

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────

const detectProductSchema = z.object({
  name: z.string().min(1).max(1024),
  brand: z.string().optional(),
  modelNumber: z.string().optional(),
  sku: z.string().optional(),
  currentPrice: z.number().min(0),
  currency: z.string().default('USD'),
  platform: z.nativeEnum(Platform),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
});

// ─── Routes ──────────────────────────────────────────────────

/**
 * POST /api/v1/products/detect
 * Detect and resolve a product from browser extension data
 */
router.post(
  '/detect',
  validate(detectProductSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const detection = req.body;

      // Resolve product identity
      const product = await productIdentityService.resolveProduct(detection);

      // Record the current price (only if valid)
      if (detection.currentPrice > 0) {
        await priceAggregationService.recordPrice(
          product.id,
          detection.platform,
          detection.currentPrice,
          0, // shipping
          undefined, // discount
          true, // in stock
          detection.url,
          detection.sku || detection.modelNumber || '',
          undefined, // deliveryEstimate
          detection.currency
        );

        // Background: Try to fetch and record prices from other platforms to build history faster
        // We don't await this to keep the response fast
        import('../services/crossPlatformService').then(({ crossPlatformService }) => {
          crossPlatformService.getCrossPlatformPrices(
            product.id,
            product.name,
            detection.platform,
            detection.currentPrice,
            product.brand,
            product.modelNumber
          ).then(comparison => {
            comparison.results.forEach(result => {
              if (result.method === 'scraped' && result.scrapedPrice && result.confidence > 0.7) {
                priceAggregationService.recordPrice(
                  product.id,
                  result.platform as any,
                  result.scrapedPrice,
                  0,
                  undefined,
                  true,
                  result.searchUrl,
                  '',
                  undefined,
                  result.currency || 'USD'
                ).catch(err => {});
              }
            });
          }).catch(err => {});
        });
      }

      res.json({
        success: true,
        data: {
          product,
          message: 'Product detected and price recorded',
        },
        timestamp: new Date(),
        freshness: {
          lastUpdated: new Date(),
          isStale: false,
          nextRefreshAt: new Date(Date.now() + 60 * 60 * 1000),
          confidencePercent: 100,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/products/search/:term
 * Search products by name
 */
router.get('/search/:term', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { term } = req.params;
    const { query: dbQuery } = await import('../models/database');

    const result = await dbQuery(
      `SELECT *, similarity(name, $1) AS sim
       FROM products
       WHERE similarity(name, $1) > 0.2
       ORDER BY sim DESC
       LIMIT 20`,
      [term]
    );

    res.json({
      success: true,
      data: result.rows,
      timestamp: new Date(),
      freshness: {
        lastUpdated: new Date(),
        isStale: false,
        nextRefreshAt: new Date(Date.now() + 60 * 60 * 1000),
        confidencePercent: 90,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/products/:id
 * Get product details by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { query: dbQuery } = await import('../models/database');
    const result = await dbQuery('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Product not found',
        timestamp: new Date(),
      });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date(),
      freshness: {
        lastUpdated: result.rows[0].updated_at,
        isStale: false,
        nextRefreshAt: new Date(Date.now() + 60 * 60 * 1000),
        confidencePercent: 100,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
