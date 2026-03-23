import request from 'supertest';
import { createExpressApp } from '../server';
import { predictionOutcomeEvaluationService } from '../services/predictionOutcomeEvaluationService';

jest.mock('../services/predictionService', () => ({
  predictionService: {
    predict: jest.fn().mockResolvedValue({
      productId: 'pid',
      currentPrice: 100,
      expectedPriceRange: { low: 98, high: 102 },
      dropProbability: 0.1,
      suggestedWaitDays: 0,
      confidenceScore: 0.7,
      modelUsed: 'baseline',
      factors: [],
      generatedAt: new Date(),
      predictedPrice: 100,
      predictionOutcomeId: 'outcome-route-id',
      featureVector: { dimension: 19, values: new Array(19).fill(0) },
    }),
  },
}));

jest.mock('../services/predictionEvaluationService', () => ({
  predictionEvaluationService: {
    summarize: jest.fn().mockResolvedValue({
      usableDataPoints: 12,
      validatedCount: 10,
      suspiciousOrOtherCount: 2,
      validatedFraction: 0.833,
      lastRecordedAt: new Date().toISOString(),
      freshnessHours: 0.5,
      freshnessScore: 1,
      volatilityScore: 0.1,
      meanAbsoluteErrorBaseline: 0.5,
      readinessScore: 0.85,
    }),
  },
}));

jest.mock('../services/predictionOutcomeEvaluationService', () => ({
  predictionOutcomeEvaluationService: {
    evaluateOutcome: jest.fn().mockResolvedValue({
      status: 'evaluated',
      outcomeId: 'outcome-eval-id',
      productId: 'pid',
      predictedPrice: 100,
      predictedAt: new Date(),
      actualPrice: 102,
      mape: 1.96,
      directionCorrect: true,
      checkDate: new Date(),
      evaluatedAt: new Date(),
      wasAccurate: true,
    }),
    evaluatePendingOutcomes: jest.fn().mockResolvedValue({
      processed: 0,
      evaluated: 0,
      alreadyEvaluated: 0,
      noActualPrice: 0,
      skipped: 0,
      errors: 0,
    }),
  },
}));

describe('GET /api/v1/predictions/:productId', () => {
  const app = createExpressApp();

  it('returns prediction and omits featureVector without debug', async () => {
    const res = await request(app).get('/api/v1/predictions/pid').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.predictedPrice).toBe(100);
    expect(res.body.data.featureVector).toBeUndefined();
    expect(res.body.predictionOutcomeId).toBe('outcome-route-id');
  });

  it('includes featureVector when debug=1', async () => {
    const res = await request(app).get('/api/v1/predictions/pid?debug=1').expect(200);
    expect(res.body.data.featureVector?.dimension).toBe(19);
  });

  it('includes evaluation when includeEvaluation=1', async () => {
    const res = await request(app)
      .get('/api/v1/predictions/pid?includeEvaluation=1')
      .expect(200);
    expect(res.body.data.predictedPrice).toBe(100);
    expect(res.body.evaluation?.readinessScore).toBe(0.85);
    expect(res.body.evaluation?.usableDataPoints).toBe(12);
  });

  it('omits evaluation without includeEvaluation', async () => {
    const res = await request(app).get('/api/v1/predictions/pid').expect(200);
    expect(res.body.evaluation).toBeUndefined();
  });
});

const mockEvaluateOutcome = predictionOutcomeEvaluationService.evaluateOutcome as jest.Mock;
const mockEvaluatePendingOutcomes = predictionOutcomeEvaluationService.evaluatePendingOutcomes as jest.Mock;

describe('POST /api/v1/predictions/outcomes/:outcomeId/evaluate', () => {
  beforeEach(() => {
    mockEvaluateOutcome.mockResolvedValue({
      status: 'evaluated',
      outcomeId: 'outcome-eval-id',
      productId: 'pid',
      predictedPrice: 100,
      predictedAt: new Date(),
      actualPrice: 102,
      mape: 1.96,
      directionCorrect: true,
      checkDate: new Date(),
      evaluatedAt: new Date(),
      wasAccurate: true,
    });
  });

  it('returns evaluation payload', async () => {
    const app = createExpressApp();
    const res = await request(app)
      .post('/api/v1/predictions/outcomes/outcome-eval-id/evaluate')
      .send({})
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('evaluated');
    expect(res.body.actualPrice).toBe(102);
  });

  it('returns 404 when outcome is not found', async () => {
    mockEvaluateOutcome.mockResolvedValueOnce({
      status: 'not_found',
      outcomeId: 'missing',
    });
    const app = createExpressApp();
    const res = await request(app)
      .post('/api/v1/predictions/outcomes/missing/evaluate')
      .send({})
      .expect(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/predictions/outcomes/evaluate-pending', () => {
  beforeEach(() => {
    mockEvaluatePendingOutcomes.mockResolvedValue({
      processed: 2,
      evaluated: 1,
      alreadyEvaluated: 0,
      noActualPrice: 1,
      skipped: 0,
      errors: 0,
    });
  });

  it('returns batch summary', async () => {
    const app = createExpressApp();
    const res = await request(app)
      .post('/api/v1/predictions/outcomes/evaluate-pending')
      .send({ limit: 10, olderThanHours: 1, accurateMapeThreshold: 4 })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.processed).toBe(2);
    expect(res.body.summary.evaluated).toBe(1);
    expect(mockEvaluatePendingOutcomes).toHaveBeenCalledWith({
      limit: 10,
      olderThanHours: 1,
      accurateMapeThreshold: 4,
    });
  });

  it('single-outcome evaluate route still works after batch route exists', async () => {
    mockEvaluateOutcome.mockResolvedValue({
      status: 'evaluated',
      outcomeId: 'outcome-eval-id',
      productId: 'pid',
      predictedPrice: 100,
      predictedAt: new Date(),
      actualPrice: 102,
      mape: 1.96,
      directionCorrect: true,
      checkDate: new Date(),
      evaluatedAt: new Date(),
      wasAccurate: true,
    });
    const app = createExpressApp();
    const res = await request(app)
      .post('/api/v1/predictions/outcomes/outcome-eval-id/evaluate')
      .send({})
      .expect(200);
    expect(res.body.status).toBe('evaluated');
    expect(mockEvaluateOutcome).toHaveBeenCalled();
  });
});
