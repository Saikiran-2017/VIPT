import { createExpressApp } from '../server';
import { alertService } from '../services/alertService';
import { authed, authedAsUser, TEST_USER_A, TEST_USER_B } from './authTestHelpers';
import { AlertType } from '@shared/types';

jest.mock('../services/alertService', () => ({
  alertService: {
    createAlert: jest.fn(),
    getUserAlerts: jest.fn(),
    getUserAlertsForProduct: jest.fn(),
    deleteAlert: jest.fn(),
    toggleAlert: jest.fn(),
  },
}));

const mockCreate = alertService.createAlert as jest.Mock;
const mockGetUserAlerts = alertService.getUserAlerts as jest.Mock;
const mockGetUserProduct = alertService.getUserAlertsForProduct as jest.Mock;
const mockDelete = alertService.deleteAlert as jest.Mock;
const mockToggle = alertService.toggleAlert as jest.Mock;

const productId = '550e8400-e29b-41d4-a716-446655440000';
const alertId = '660e8400-e29b-41d4-a716-446655440001';

describe('Alert routes (ownership via X-User-Id)', () => {
  const app = createExpressApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when X-User-Id is missing', async () => {
    await authed(app)
      .post('/api/v1/alerts')
      .send({ productId, type: AlertType.TARGET_PRICE, targetPrice: 10 })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when X-User-Id is not a UUID', async () => {
    await authed(app)
      .post('/api/v1/alerts')
      .set('X-User-Id', 'not-a-uuid')
      .send({ productId, type: AlertType.TARGET_PRICE, targetPrice: 10 })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /alerts rejects legacy userId in body (strict schema)', async () => {
    await authedAsUser(app, TEST_USER_A)
      .post('/api/v1/alerts')
      .send({
        userId: TEST_USER_B,
        productId,
        type: AlertType.TARGET_PRICE,
        targetPrice: 10,
      })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /alerts uses extension user id from header only', async () => {
    mockCreate.mockResolvedValue({
      id: alertId,
      userId: TEST_USER_A,
      productId,
      type: AlertType.TARGET_PRICE,
      targetPrice: 10,
      isActive: true,
      createdAt: new Date(),
    });

    await authedAsUser(app, TEST_USER_A)
      .post('/api/v1/alerts')
      .send({
        productId,
        type: AlertType.TARGET_PRICE,
        targetPrice: 10,
      })
      .expect(201);

    expect(mockCreate).toHaveBeenCalledWith(
      TEST_USER_A,
      productId,
      AlertType.TARGET_PRICE,
      10
    );
  });

  it('GET /alerts/me lists alerts for the authenticated user only', async () => {
    mockGetUserAlerts.mockResolvedValue([]);
    await authedAsUser(app, TEST_USER_A).get('/api/v1/alerts/me').expect(200);
    expect(mockGetUserAlerts).toHaveBeenCalledWith(TEST_USER_A);
  });

  it('GET /alerts/product/:productId scopes to header user', async () => {
    mockGetUserProduct.mockResolvedValue([]);
    await authedAsUser(app, TEST_USER_B)
      .get(`/api/v1/alerts/product/${productId}`)
      .expect(200);
    expect(mockGetUserProduct).toHaveBeenCalledWith(TEST_USER_B, productId);
  });

  it('DELETE uses header identity — cannot delete another user alert by spoofing body', async () => {
    mockDelete.mockResolvedValue(false);
    await authedAsUser(app, TEST_USER_A)
      .delete(`/api/v1/alerts/${alertId}`)
      .expect(404);
    expect(mockDelete).toHaveBeenCalledWith(alertId, TEST_USER_A);
  });

  it('DELETE succeeds when service confirms ownership', async () => {
    mockDelete.mockResolvedValue(true);
    await authedAsUser(app, TEST_USER_A)
      .delete(`/api/v1/alerts/${alertId}`)
      .expect(200);
    expect(mockDelete).toHaveBeenCalledWith(alertId, TEST_USER_A);
  });

  it('PATCH toggle returns 404 when alert not owned', async () => {
    mockToggle.mockResolvedValue(null);
    await authedAsUser(app, TEST_USER_A)
      .patch(`/api/v1/alerts/${alertId}/toggle`)
      .expect(404);
    expect(mockToggle).toHaveBeenCalledWith(alertId, TEST_USER_A);
  });

  it('PATCH toggle succeeds when owned', async () => {
    mockToggle.mockResolvedValue(true);
    const res = await authedAsUser(app, TEST_USER_A)
      .patch(`/api/v1/alerts/${alertId}/toggle`)
      .expect(200);
    expect(res.body.data.isActive).toBe(true);
  });
});
