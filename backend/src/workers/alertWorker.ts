import cron from 'node-cron';
import { query } from '../models/database';
import { alertService } from '../services/alertService';
import { logger } from '../utils/logger';
import { Platform } from '@shared/types';

/**
 * Alert Evaluation Worker
 *
 * Periodically checks all active alerts against current market prices.
 */
export async function startAlertWorker() {
  logger.info('Starting alert evaluation worker...');

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running scheduled alert evaluation...');
    try {
      await evaluateAllAlerts();
    } catch (error) {
      logger.error('Error in scheduled alert evaluation:', error);
    }
  });
}

async function evaluateAllAlerts() {
  // Get all active alerts
  const result = await query(
    `SELECT a.*, pl.current_price, pl.platform, ph.price as previous_price
     FROM alerts a
     JOIN platform_listings pl ON a.product_id = pl.product_id
     LEFT JOIN LATERAL (
       SELECT price FROM price_history
       WHERE product_id = a.product_id AND platform = pl.platform
       ORDER BY recorded_at DESC OFFSET 1 LIMIT 1
     ) ph ON true
     WHERE a.is_active = true`
  );

  logger.info(`Evaluating ${result.rows.length} active alert-platform combinations...`);

  for (const row of result.rows) {
    try {
      await alertService.checkAlerts(
        row.product_id,
        parseFloat(row.current_price),
        parseFloat(row.previous_price || row.current_price),
        row.platform as Platform
      );
    } catch (error) {
      logger.error(`Failed to evaluate alert ${row.id}:`, error);
    }
  }
}
