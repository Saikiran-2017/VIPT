import { query } from '../models/database';
import type {
  PredictionFeedbackInput,
  PredictionFeedbackRecord,
  PredictionFeedbackType,
} from '@shared/types';

const FEEDBACK_TYPES = new Set<PredictionFeedbackType>(['correct', 'incorrect', 'uncertain']);

export class OutcomeNotFoundError extends Error {
  readonly code = 'OUTCOME_NOT_FOUND' as const;
  constructor() {
    super('Prediction outcome not found');
    this.name = 'OutcomeNotFoundError';
  }
}

function mapRow(row: Record<string, unknown>): PredictionFeedbackRecord {
  return {
    feedbackId: String(row.feedback_id),
    predictionOutcomeId: String(row.prediction_outcome_id),
    feedbackType: String(row.feedback_type) as PredictionFeedbackType,
    confidenceRating:
      row.confidence_rating !== null && row.confidence_rating !== undefined
        ? parseFloat(String(row.confidence_rating))
        : null,
    feedbackReason:
      row.feedback_reason !== null && row.feedback_reason !== undefined
        ? String(row.feedback_reason)
        : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** Normalize optional rating to [0, 1] or null. */
export function normalizeConfidenceRating(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return Math.round(n * 1000) / 1000;
  if (n > 1 && n <= 100) return Math.round((n / 100) * 1000) / 1000;
  return Math.max(0, Math.min(1, n));
}

export function assertFeedbackInput(input: PredictionFeedbackInput): void {
  if (!FEEDBACK_TYPES.has(input.feedbackType)) {
    throw new Error(`Invalid feedbackType: ${String(input.feedbackType)}`);
  }
}

/**
 * Persists feedback rows for `prediction_outcomes` (Phase 2). No retraining or trust updates.
 */
export class FeedbackService {
  async outcomeExists(outcomeId: string): Promise<boolean> {
    const res = await query(`SELECT 1 FROM prediction_outcomes WHERE id = $1 LIMIT 1`, [outcomeId]);
    return res.rows.length > 0;
  }

  async submitFeedback(
    outcomeId: string,
    input: PredictionFeedbackInput
  ): Promise<PredictionFeedbackRecord> {
    assertFeedbackInput(input);
    const exists = await this.outcomeExists(outcomeId);
    if (!exists) {
      throw new OutcomeNotFoundError();
    }

    const rating = normalizeConfidenceRating(input.confidenceRating);
    const reason =
      input.feedbackReason !== undefined && input.feedbackReason !== null
        ? String(input.feedbackReason).trim() || null
        : null;

    const ins = await query(
      `INSERT INTO prediction_feedback (
        prediction_outcome_id,
        feedback_type,
        confidence_rating,
        feedback_reason
      ) VALUES ($1, $2, $3, $4)
      RETURNING feedback_id, prediction_outcome_id, feedback_type, confidence_rating, feedback_reason, created_at`,
      [outcomeId, input.feedbackType, rating, reason]
    );

    return mapRow(ins.rows[0] as Record<string, unknown>);
  }

  async getFeedbackForOutcome(outcomeId: string): Promise<PredictionFeedbackRecord[]> {
    const res = await query(
      `SELECT feedback_id, prediction_outcome_id, feedback_type, confidence_rating, feedback_reason, created_at
       FROM prediction_feedback
       WHERE prediction_outcome_id = $1
       ORDER BY created_at ASC`,
      [outcomeId]
    );
    return res.rows.map((r) => mapRow(r as Record<string, unknown>));
  }
}

export const feedbackService = new FeedbackService();
