import { predictionOutcomeEvaluationService } from '../services/predictionOutcomeEvaluationService';
import { query } from '../models/database';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

const OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OID2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OID3 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PRED_AT = new Date('2025-01-01T12:00:00.000Z');

function skeletonRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: OID,
    product_id: PID,
    predicted_price: 100,
    predicted_at: PRED_AT.toISOString(),
    outcome_metadata: null,
    actual_price_amount: null,
    mape: null,
    direction_correct: null,
    check_date: null,
    evaluated_at: null,
    was_accurate: null,
    ...overrides,
  };
}

describe('PredictionOutcomeEvaluationService', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('evaluates a skeleton row and writes metrics', async () => {
    const check = new Date('2025-01-02T12:00:00.000Z');
    mockedQuery
      .mockResolvedValueOnce({ rows: [skeletonRow()] })
      .mockResolvedValueOnce({
        rows: [{ price: 95, recorded_at: PRED_AT.toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: [{ price: 110, recorded_at: check.toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: OID,
            product_id: PID,
            predicted_price: 100,
            predicted_at: PRED_AT.toISOString(),
            actual_price_amount: 110,
            mape: 9.090909,
            direction_correct: true,
            check_date: check.toISOString(),
            evaluated_at: new Date().toISOString(),
            was_accurate: false,
          },
        ],
      });

    const r = await predictionOutcomeEvaluationService.evaluateOutcome(OID);

    expect(r.status).toBe('evaluated');
    if (r.status === 'evaluated') {
      expect(r.actualPrice).toBe(110);
      expect(r.directionCorrect).toBe(true);
      expect(r.mape).not.toBeNull();
      expect(Math.abs((r.mape ?? 0) - 9.090909)).toBeLessThan(0.01);
    }
    expect(mockedQuery).toHaveBeenCalledTimes(4);
  });

  it('returns already_evaluated without updating when row is complete', async () => {
    const evaluatedAt = new Date('2025-01-03T00:00:00.000Z');
    const checkRow = new Date('2025-01-02T12:00:00.000Z');
    mockedQuery.mockResolvedValueOnce({
      rows: [
        skeletonRow({
          actual_price_amount: 105,
          mape: 5,
          direction_correct: true,
          check_date: checkRow.toISOString(),
          evaluated_at: evaluatedAt.toISOString(),
          was_accurate: true,
        }),
      ],
    });

    const r = await predictionOutcomeEvaluationService.evaluateOutcome(OID);

    expect(r.status).toBe('already_evaluated');
    if (r.status === 'already_evaluated') {
      expect(r.actualPrice).toBe(105);
      expect(r.mape).toBe(5);
      expect(r.directionCorrect).toBe(true);
    }
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('returns no_actual_price when no validated observation after prediction', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [skeletonRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await predictionOutcomeEvaluationService.evaluateOutcome(OID);

    expect(r.status).toBe('no_actual_price');
    expect(mockedQuery).toHaveBeenCalledTimes(3);
  });

  it('returns not_found when outcome id does not exist', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });

    const r = await predictionOutcomeEvaluationService.evaluateOutcome(OID);

    expect(r.status).toBe('not_found');
  });

  it('second evaluation after concurrent update returns already_evaluated', async () => {
    const check = new Date('2025-01-02T12:00:00.000Z');
    const evaluatedAt = new Date('2025-01-03T00:00:00.000Z');
    mockedQuery
      .mockResolvedValueOnce({ rows: [skeletonRow()] })
      .mockResolvedValueOnce({
        rows: [{ price: 95, recorded_at: PRED_AT.toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: [{ price: 110, recorded_at: check.toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          skeletonRow({
            actual_price_amount: 110,
            mape: 9.090909,
            direction_correct: true,
            check_date: check.toISOString(),
            evaluated_at: evaluatedAt.toISOString(),
            was_accurate: false,
          }),
        ],
      });

    const r = await predictionOutcomeEvaluationService.evaluateOutcome(OID);

    expect(r.status).toBe('already_evaluated');
    if (r.status === 'already_evaluated') {
      expect(r.actualPrice).toBe(110);
    }
  });
});

describe('evaluatePendingOutcomes', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    mockedQuery.mockReset();
    spy = jest.spyOn(predictionOutcomeEvaluationService, 'evaluateOutcome');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('aggregates evaluated, no_actual_price, and already_evaluated', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: OID }, { id: OID2 }, { id: OID3 }],
    });
    spy
      .mockResolvedValueOnce({
        status: 'evaluated',
        outcomeId: OID,
        productId: PID,
        predictedPrice: 100,
        predictedAt: PRED_AT,
        actualPrice: 100,
        mape: 0,
        directionCorrect: true,
        checkDate: PRED_AT,
        evaluatedAt: new Date(),
        wasAccurate: true,
      } as const)
      .mockResolvedValueOnce({
        status: 'no_actual_price',
        outcomeId: OID2,
        productId: PID,
        predictedAt: PRED_AT,
      })
      .mockResolvedValueOnce({
        status: 'already_evaluated',
        outcomeId: OID3,
        productId: PID,
        predictedPrice: 100,
        predictedAt: PRED_AT,
        actualPrice: 100,
        mape: 0,
        directionCorrect: true,
        checkDate: PRED_AT,
        evaluatedAt: new Date(),
        wasAccurate: true,
      } as const);

    const r = await predictionOutcomeEvaluationService.evaluatePendingOutcomes({
      limit: 5,
      olderThanHours: 0,
    });

    expect(r.processed).toBe(3);
    expect(r.evaluated).toBe(1);
    expect(r.noActualPrice).toBe(1);
    expect(r.alreadyEvaluated).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.errors).toBe(0);
    expect(mockedQuery.mock.calls[0][1]).toEqual([0, 5]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('counts skipped for invalid_outcome', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: OID }] });
    spy.mockResolvedValueOnce({
      status: 'invalid_outcome',
      outcomeId: OID,
      reason: 'missing_predicted_price',
    });

    const r = await predictionOutcomeEvaluationService.evaluatePendingOutcomes({ limit: 10 });

    expect(r.processed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('counts errors for not_found', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: OID }] });
    spy.mockResolvedValueOnce({ status: 'not_found', outcomeId: OID });

    const r = await predictionOutcomeEvaluationService.evaluatePendingOutcomes({ limit: 10 });

    expect(r.processed).toBe(1);
    expect(r.errors).toBe(1);
  });

  it('respects limit in the pending query', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: OID }] });
    spy.mockResolvedValue({
      status: 'no_actual_price',
      outcomeId: OID,
      productId: PID,
      predictedAt: PRED_AT,
    });

    await predictionOutcomeEvaluationService.evaluatePendingOutcomes({ limit: 2, olderThanHours: 24 });

    expect(mockedQuery.mock.calls[0][1]).toEqual([24, 2]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns zeros when no pending rows', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });

    const r = await predictionOutcomeEvaluationService.evaluatePendingOutcomes();

    expect(r.processed).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('counts errors when evaluateOutcome throws', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: OID }] });
    spy.mockRejectedValueOnce(new Error('db down'));

    const r = await predictionOutcomeEvaluationService.evaluatePendingOutcomes({ limit: 10 });

    expect(r.processed).toBe(1);
    expect(r.errors).toBe(1);
    expect(r.evaluated).toBe(0);
  });

  it('passes accurateMapeThreshold to evaluateOutcome', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: OID }] });
    spy.mockResolvedValue({
      status: 'evaluated',
      outcomeId: OID,
      productId: PID,
      predictedPrice: 100,
      predictedAt: PRED_AT,
      actualPrice: 100,
      mape: 0,
      directionCorrect: true,
      checkDate: PRED_AT,
      evaluatedAt: new Date(),
      wasAccurate: true,
    });

    await predictionOutcomeEvaluationService.evaluatePendingOutcomes({
      limit: 5,
      accurateMapeThreshold: 3,
    });

    expect(spy).toHaveBeenCalledWith(OID, { accurateMapeThreshold: 3 });
  });
});
