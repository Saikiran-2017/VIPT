import { query } from '../models/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export type PredictionOutcomeMetadata = Record<string, unknown>;

/**
 * Persists a pending row in `prediction_outcomes` for later evaluation (actual price, MAPE, etc.).
 * Failures are non-fatal for callers; returns null and logs a warning.
 */
export class PredictionOutcomeService {
  async recordPrediction(
    productId: string,
    predictedPrice: number,
    modelWeights?: Record<string, unknown> | null,
    metadata?: PredictionOutcomeMetadata | null
  ): Promise<string | null> {
    const id = uuidv4();
    try {
      await query(
        `INSERT INTO prediction_outcomes (
          id,
          product_id,
          predicted_price,
          predicted_at,
          model_weights_used,
          outcome_metadata,
          actual_price_amount,
          actual_price_currency,
          evaluated_at,
          was_accurate,
          mape,
          direction_correct,
          check_date
        ) VALUES (
          $1,
          $2,
          $3,
          NOW(),
          $4::jsonb,
          $5::jsonb,
          NULL,
          'USD',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        )`,
        [
          id,
          productId,
          predictedPrice,
          modelWeights != null ? JSON.stringify(modelWeights) : null,
          metadata != null ? JSON.stringify(metadata) : null,
        ]
      );
      return id;
    } catch (error) {
      logger.warn('Failed to record prediction_outcomes skeleton (prediction still returned):', error);
      return null;
    }
  }
}

export const predictionOutcomeService = new PredictionOutcomeService();
