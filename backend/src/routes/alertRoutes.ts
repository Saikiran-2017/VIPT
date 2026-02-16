import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { alertService } from '../services/alertService';
import { validate } from '../middleware/validation';
import { AlertType } from '@shared/types';

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────

const createAlertSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.nativeEnum(AlertType),
  targetPrice: z.number().positive().optional(),
});

// ─── Routes ──────────────────────────────────────────────────

/**
 * POST /api/v1/alerts
 * Create a new price alert
 */
router.post(
  '/',
  validate(createAlertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, productId, type, targetPrice } = req.body;
      const alert = await alertService.createAlert(userId, productId, type, targetPrice);

      res.status(201).json({
        success: true,
        data: alert,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/alerts/user/:userId
 * Get all alerts for a user
 */
router.get(
  '/user/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const alerts = await alertService.getUserAlerts(userId);

      res.json({
        success: true,
        data: alerts,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/alerts/product/:productId
 * Get active alerts for a product
 */
router.get(
  '/product/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const alerts = await alertService.getProductAlerts(productId);

      res.json({
        success: true,
        data: alerts,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/alerts/:alertId
 * Delete an alert
 */
router.delete(
  '/:alertId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { alertId } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'userId query parameter is required',
          timestamp: new Date(),
        });
        return;
      }

      const deleted = await alertService.deleteAlert(alertId, userId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
          timestamp: new Date(),
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Alert deleted' },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/alerts/:alertId/toggle
 * Toggle alert active status
 */
router.patch(
  '/:alertId/toggle',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { alertId } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'userId query parameter is required',
          timestamp: new Date(),
        });
        return;
      }

      const isActive = await alertService.toggleAlert(alertId, userId);

      res.json({
        success: true,
        data: { alertId, isActive },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
