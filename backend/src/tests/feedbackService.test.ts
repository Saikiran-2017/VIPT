import { query } from '../models/database';
import {
  FeedbackService,
  OutcomeNotFoundError,
  assertFeedbackInput,
  normalizeConfidenceRating,
} from '../services/feedbackService';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('feedbackService helpers', () => {
  it('normalizeConfidenceRating maps percent to 0–1', () => {
    expect(normalizeConfidenceRating(0.5)).toBe(0.5);
    expect(normalizeConfidenceRating(75)).toBe(0.75);
    expect(normalizeConfidenceRating(undefined)).toBeNull();
  });

  it('assertFeedbackInput rejects invalid type', () => {
    expect(() => {
      // @ts-expect-error exercise invalid feedbackType at runtime
      assertFeedbackInput({ feedbackType: 'bogus' });
    }).toThrow();
  });
});

describe('FeedbackService', () => {
  let svc: FeedbackService;

  beforeEach(() => {
    mockedQuery.mockReset();
    svc = new FeedbackService();
  });

  it('submitFeedback inserts when outcome exists', async () => {
    const oid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ x: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            feedback_id: 'fb-1',
            prediction_outcome_id: oid,
            feedback_type: 'correct',
            confidence_rating: '0.8',
            feedback_reason: 'ok',
            created_at: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
      });

    const r = await svc.submitFeedback(oid, {
      feedbackType: 'correct',
      confidenceRating: 0.8,
      feedbackReason: 'ok',
    });
    expect(r.feedbackId).toBe('fb-1');
    expect(r.feedbackType).toBe('correct');
    expect(r.confidenceRating).toBeCloseTo(0.8, 3);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  it('submitFeedback allows optional fields omitted', async () => {
    const oid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ x: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            feedback_id: 'fb-2',
            prediction_outcome_id: oid,
            feedback_type: 'uncertain',
            confidence_rating: null,
            feedback_reason: null,
            created_at: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
      });

    const r = await svc.submitFeedback(oid, { feedbackType: 'uncertain' });
    expect(r.confidenceRating).toBeNull();
    expect(r.feedbackReason).toBeNull();
  });

  it('submitFeedback throws when outcome missing', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      svc.submitFeedback('missing-id', { feedbackType: 'incorrect' })
    ).rejects.toBeInstanceOf(OutcomeNotFoundError);
  });

  it('getFeedbackForOutcome returns rows', async () => {
    const oid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          feedback_id: '1',
          prediction_outcome_id: oid,
          feedback_type: 'correct',
          confidence_rating: null,
          feedback_reason: null,
          created_at: new Date('2025-01-01T00:00:00.000Z'),
        },
      ],
    });
    const list = await svc.getFeedbackForOutcome(oid);
    expect(list).toHaveLength(1);
    expect(list[0].feedbackId).toBe('1');
  });
});
