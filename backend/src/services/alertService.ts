import { query } from '../models/database';
import { logger } from '../utils/logger';
import {
  PriceAlert,
  AlertType,
  AlertNotification,
  Platform,
} from '@shared/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Alert Service
 * 
 * Manages price alerts:
 * - Target price alerts
 * - Sudden drop alerts
 * - Prediction trigger alerts
 * - Event-based alerts
 */
export class AlertService {

  /**
   * Create a new price alert
   */
  async createAlert(
    userId: string,
    productId: string,
    type: AlertType,
    targetPrice?: number
  ): Promise<PriceAlert> {
    const id = uuidv4();

    await query(
      `INSERT INTO alerts (id, user_id, product_id, alert_type, target_price, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, userId, productId, type, targetPrice]
    );

    logger.info(`Alert created: ${type} for product ${productId} by user ${userId}`);

    return {
      id,
      userId,
      productId,
      type,
      targetPrice,
      isActive: true,
      createdAt: new Date(),
    };
  }

  /**
   * Get all alerts for a user
   */
  async getUserAlerts(userId: string): Promise<PriceAlert[]> {
    const result = await query(
      `SELECT a.*, p.name as product_name
       FROM alerts a
       JOIN products p ON a.product_id = p.id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC`,
      [userId]
    );

    return result.rows.map(this.mapRowToAlert);
  }

  /**
   * Get active alerts for a product
   */
  async getProductAlerts(productId: string): Promise<PriceAlert[]> {
    const result = await query(
      `SELECT * FROM alerts
       WHERE product_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [productId]
    );

    return result.rows.map(this.mapRowToAlert);
  }

  /**
   * Check and trigger alerts based on new price data
   */
  async checkAlerts(
    productId: string,
    currentPrice: number,
    previousPrice: number,
    platform: Platform
  ): Promise<AlertNotification[]> {
    const alerts = await this.getProductAlerts(productId);
    const notifications: AlertNotification[] = [];

    // Get product name
    const productResult = await query('SELECT name FROM products WHERE id = $1', [productId]);
    const productName = productResult.rows[0]?.name || 'Unknown Product';

    for (const alert of alerts) {
      let shouldTrigger = false;
      let message = '';

      switch (alert.type) {
        case AlertType.TARGET_PRICE:
          if (alert.targetPrice && currentPrice <= alert.targetPrice) {
            shouldTrigger = true;
            message = `Price dropped to $${currentPrice} - below your target of $${alert.targetPrice}!`;
          }
          break;

        case AlertType.SUDDEN_DROP:
          const dropPercent = previousPrice > 0
            ? ((previousPrice - currentPrice) / previousPrice) * 100
            : 0;
          if (dropPercent >= 10) {
            shouldTrigger = true;
            message = `Sudden price drop of ${dropPercent.toFixed(1)}%! Now $${currentPrice} (was $${previousPrice})`;
          }
          break;

        case AlertType.PREDICTION_TRIGGER:
          // Triggered by prediction service when a predicted drop occurs
          break;

        case AlertType.EVENT_BASED:
          // Triggered by event service when a sale event starts
          break;
      }

      if (shouldTrigger) {
        const notification: AlertNotification = {
          alertId: alert.id,
          productId,
          productName,
          message,
          currentPrice,
          previousPrice,
          platform,
          timestamp: new Date(),
        };

        notifications.push(notification);

        // Mark alert as triggered
        await this.triggerAlert(alert.id);
      }
    }

    return notifications;
  }

  /**
   * Mark an alert as triggered
   */
  async triggerAlert(alertId: string): Promise<void> {
    await query(
      `UPDATE alerts SET triggered_at = NOW(), is_active = false WHERE id = $1`,
      [alertId]
    );
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string, userId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM alerts WHERE id = $1 AND user_id = $2',
      [alertId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Toggle alert active status
   */
  async toggleAlert(alertId: string, userId: string): Promise<boolean> {
    const result = await query(
      `UPDATE alerts SET is_active = NOT is_active
       WHERE id = $1 AND user_id = $2
       RETURNING is_active`,
      [alertId, userId]
    );
    return result.rows[0]?.is_active ?? false;
  }

  // ─── Mapping Helpers ─────────────────────────────────────────

  private mapRowToAlert(row: Record<string, unknown>): PriceAlert {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      productId: row.product_id as string,
      type: row.alert_type as AlertType,
      targetPrice: row.target_price ? parseFloat(row.target_price as string) : undefined,
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      triggeredAt: row.triggered_at ? new Date(row.triggered_at as string) : undefined,
    };
  }
}

export const alertService = new AlertService();
