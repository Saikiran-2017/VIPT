import request from 'supertest';
import { createExpressApp } from '../server';
import { query } from '../models/database';
import { cacheGet } from '../models/cache';

jest.mock('../models/database');
jest.mock('../models/cache');
jest.mock('../services/crossPlatformService', () => ({
  crossPlatformService: {
    getCrossPlatformPrices: jest.fn().mockResolvedValue({ results: [] }),
  },
}));
jest.mock('../queues/priceUpdateQueue', () => ({
  enqueueCrossPlatformRefreshJob: jest.fn().mockResolvedValue(undefined),
}));

const mockedQuery = query as jest.Mock;
const mockedCacheGet = cacheGet as jest.Mock;

/**
 * Integration tests use the Express app directly. Production serves the same stack via
 * `buildServer()` (Fastify + @fastify/express); route handlers and middleware are identical.
 * Fastify `inject()` does not reliably surface response bodies for Express-mounted apps.
 */
describe('API Integration Tests (Express; same handlers as Fastify production)', () => {
  const app = createExpressApp();

  afterEach(() => {
    mockedQuery.mockReset();
    mockedCacheGet.mockReset();
    mockedCacheGet.mockResolvedValue(null);
  });

  describe('GET /health', () => {
    it('should return 200 and healthy status', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('POST /api/v1/products/detect', () => {
    it('should return 200 and resolved product', async () => {
      mockedCacheGet.mockResolvedValue(null);
      mockedQuery.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO products')) {
          return Promise.resolve({
            rows: [
              {
                id: 'uuid-1',
                universal_product_id: 'SONY_WH-1000XM5',
                name: 'Sony Headphones',
                brand: 'Sony',
                model_number: 'WH-1000XM5',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          });
        }
        if (sql.includes('SELECT') && sql.includes('products')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const payload = {
        name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
        brand: 'Sony',
        modelNumber: 'WH-1000XM5',
        currentPrice: 348,
        currency: 'USD',
        platform: 'amazon',
        url: 'https://www.amazon.com/dp/B09XS7GNLJ',
      };

      const res = await request(app).post('/api/v1/products/detect').send(payload).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.product.universalProductId).toBe('SONY_WH-1000XM5');
    });
  });
});
