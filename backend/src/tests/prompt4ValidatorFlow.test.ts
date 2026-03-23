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

describe('Prompt 4: validator-first price_history writes', () => {
  const app = createExpressApp();

  afterEach(() => {
    mockedQuery.mockReset();
    mockedCacheGet.mockReset();
    mockedCacheGet.mockResolvedValue(null);
  });

  it('does not INSERT price_history when DataValidator rejects duplicate', async () => {
    let priceHistoryInserts = 0;

    mockedCacheGet.mockResolvedValue(null);
    mockedQuery.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO price_history')) {
        priceHistoryInserts += 1;
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO products')) {
        return Promise.resolve({
          rows: [
            {
              id: 'prod-duplicate',
              universal_product_id: 'DUP_TEST',
              name: 'Dup Test',
              brand: 'X',
              model_number: 'M1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      if (sql.includes('SELECT price, recorded_at FROM price_history') && sql.includes('ORDER BY recorded_at DESC')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT 1') && sql.includes('price_history')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }] });
      }
      if (sql.includes('SELECT') && sql.includes('FROM products')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const payload = {
      name: 'Dup Test Product Full Name Here',
      brand: 'X',
      modelNumber: 'M1',
      currentPrice: 99,
      currency: 'USD',
      platform: 'amazon',
      url: 'https://example.com/p/1',
    };

    await request(app).post('/api/v1/products/detect').send(payload).expect(200);
    expect(priceHistoryInserts).toBe(0);
  });

  it('INSERTs price_history with quality when observation is accepted', async () => {
    const qualities: string[] = [];

    mockedCacheGet.mockResolvedValue(null);
    mockedQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO price_history')) {
        if (Array.isArray(params) && params.length >= 8) {
          qualities.push(String(params[7]));
        }
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO products')) {
        return Promise.resolve({
          rows: [
            {
              id: 'prod-ok',
              universal_product_id: 'OK_TEST',
              name: 'Ok Test',
              brand: 'Y',
              model_number: 'M2',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      if (sql.includes('SELECT price, recorded_at FROM price_history') && sql.includes('ORDER BY recorded_at DESC')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT 1') && sql.includes('price_history')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT price, currency FROM price_history')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT name FROM products WHERE id')) {
        return Promise.resolve({ rows: [{ name: 'Ok Test' }] });
      }
      if (sql.includes('SELECT') && sql.includes('FROM products')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('FROM platform_listings') && sql.includes('WHERE product_id')) {
        return Promise.resolve({ rows: [{ platform: 'ebay', current_price: '100', currency: 'USD', total_effective_price: '100' }] });
      }
      if (sql.includes('FROM alerts')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const payload = {
      name: 'Ok Test Product Full Name Here Extra Words',
      brand: 'Y',
      modelNumber: 'M2',
      currentPrice: 199,
      currency: 'USD',
      platform: 'amazon',
      url: 'https://example.com/p/2',
    };

    await request(app).post('/api/v1/products/detect').send(payload).expect(200);
    expect(qualities.length).toBe(1);
    expect(['validated', 'suspicious']).toContain(qualities[0]);
  });
});
