import request from 'supertest';
import { createExpressApp } from '../server';
import { authed, TEST_API_KEY } from './authTestHelpers';
import { query, databaseService } from '../models/database';

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

const mockedQuery = query as jest.Mock;
const mockHealthCheck = databaseService.healthCheck as jest.Mock;

describe('API key authentication (/api/v1/*)', () => {
  const app = createExpressApp();

  afterEach(() => {
    mockedQuery.mockReset();
    mockHealthCheck.mockResolvedValue(true);
  });

  it('GET /health does not require API key', async () => {
    await request(app).get('/health').expect(200);
  });

  it('GET /ready does not require API key', async () => {
    await request(app).get('/ready').expect(200);
  });

  it('GET /api/v1/* without key returns 401', async () => {
    const res = await request(app).get('/api/v1/products/search/test').expect(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('GET /api/v1/* with wrong key returns 401', async () => {
    await request(app)
      .get('/api/v1/products/search/test')
      .set('X-API-Key', 'wrong-key')
      .expect(401);
  });

  it('GET /api/v1/* with correct X-API-Key succeeds', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const res = await authed(app).get('/api/v1/products/search/test').expect(200);
    expect(res.body.success).toBe(true);
  });

  it('Authorization: Bearer <key> is accepted', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    await request(app)
      .get('/api/v1/products/search/test')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .expect(200);
  });
});
