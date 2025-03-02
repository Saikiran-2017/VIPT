import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { alertService } from '../services/alertService';
import { validate } from '../middleware/validation';
import { requireExtensionUserId } from '../middleware/extensionUserIdentity';
import { AlertType } from '@shared/types';

const router = Router();

const createAlertSchema = z
  .object({
    productId: z.string().uuid(),
    type: z.nativeEnum(AlertType),
    targetPrice: z.number().positive().optional(),
  })
  .strict();

router.use(requireExtensionUserId);

/**
 * POST /api/v1/alerts
 * Create a price alert for the authenticated extension user (`X-User-Id`).
 */
router.post(
  '/',
  validate(createAlertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.extensionUserId!;
      const { productId, type, targetPrice } = req.body;
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
 * GET /api/v1/alerts/me
 * List alerts for the authenticated user (from `X-User-Id` only).
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.extensionUserId!;
    const alerts = await alertService.getUserAlerts(userId);

    res.json({
      success: true,
      data: alerts,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/alerts/product/:productId
 * Active alerts for this product **for the authenticated user** only.
 */
router.get(
  '/product/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.extensionUserId!;
      const { productId } = req.params;
      const alerts = await alertService.getUserAlertsForProduct(userId, productId);

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
 * Delete an alert owned by the authenticated user.
 */
router.delete(
  '/:alertId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.extensionUserId!;
      const { alertId } = req.params;

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
 * Toggle alert active status (owner only).
 */
router.patch(
  '/:alertId/toggle',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.extensionUserId!;
      const { alertId } = req.params;

      const isActive = await alertService.toggleAlert(alertId, userId);

      if (isActive === null) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
          timestamp: new Date(),
        });
        return;
      }

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
