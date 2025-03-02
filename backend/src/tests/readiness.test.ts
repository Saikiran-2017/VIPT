import request from 'supertest';
import { createExpressApp } from '../server';
import { databaseService } from '../models/database';
import { getRedisReadiness } from '../models/cache';

jest.mock('../models/database', () => {
  const healthCheck = jest.fn().mockResolvedValue(true);
  const db = { healthCheck };
  return {
    __esModule: true,
    query: jest.fn(),
    transaction: jest.fn(),
    testConnection: jest.fn(),
    databaseService: db,
    default: db,
  };
});

jest.mock('../models/cache', () => ({
  ...jest.requireActual<typeof import('../models/cache')>('../models/cache'),
  getRedisReadiness: jest.fn().mockResolvedValue({ status: 'not_configured' }),
}));

const mockHealthCheck = databaseService.healthCheck as jest.Mock;
const mockGetRedisReadiness = getRedisReadiness as jest.Mock;

describe('GET /ready (readiness)', () => {
  const app = createExpressApp();

  beforeEach(() => {
    mockHealthCheck.mockResolvedValue(true);
    mockGetRedisReadiness.mockResolvedValue({ status: 'not_configured' });
  });

  it('returns 200 when database is available', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.probe).toBe('readiness');
    expect(res.body.data.checks.database.status).toBe('ok');
    expect(res.body.data.checks.redis.status).toBe('not_configured');
    expect(res.body.data.checks.redis.ready).toBe(true);
  });

  it('returns 503 when database is unavailable', async () => {
    mockHealthCheck.mockResolvedValue(false);
    const res = await request(app).get('/ready').expect(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.checks.database.status).toBe('unavailable');
  });

  it('includes redis status when Redis is connected', async () => {
    mockGetRedisReadiness.mockResolvedValue({ status: 'connected' });
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.data.checks.redis.status).toBe('connected');
    expect(res.body.data.checks.redis.ready).toBe(true);
  });

  it('reports redis unavailable without failing readiness when DB is ok', async () => {
    mockGetRedisReadiness.mockResolvedValue({ status: 'unavailable' });
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.data.checks.redis.status).toBe('unavailable');
    expect(res.body.data.checks.redis.ready).toBe(false);
  });

  it('returns 503 when database healthCheck throws', async () => {
    mockHealthCheck.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(app).get('/ready').expect(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
  });
});
