import { Router, Request, Response, NextFunction } from 'express';
import { eventService } from '../services/eventService';
import { Platform } from '@shared/types';

const router = Router();

/**
 * GET /api/v1/events/upcoming
 * Get upcoming retail events
 */
router.get(
  '/upcoming',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const events = await eventService.getUpcomingEvents(days);

      res.json({
        success: true,
        data: events,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/events/active
 * Get currently active sale events
 */
router.get(
  '/active',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const events = await eventService.getActiveEvents();

      res.json({
        success: true,
        data: events,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/events/platform/:platform
 * Get events for a specific platform
 */
router.get(
  '/platform/:platform',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = req.params.platform as Platform;
      const days = parseInt(req.query.days as string) || 90;
      const events = await eventService.getEventsForPlatform(platform, days);

      res.json({
        success: true,
        data: events,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/events/sale-likelihood
 * Get sale likelihood for upcoming period
 */
router.get(
  '/sale-likelihood',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const likelihood = await eventService.getSaleLikelihood(days);

      res.json({
        success: true,
        data: likelihood,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
