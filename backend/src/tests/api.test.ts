import request from 'supertest';
import app from '../server';
import { query } from '../models/database';

jest.mock('../models/database');
jest.mock('../models/cache');

describe('API Integration Tests', () => {
  describe('GET /health', () => {
    it('should return 200 and healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('POST /api/v1/products/detect', () => {
    it('should return 200 and resolved product', async () => {
      (query as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO products')) {
          return Promise.resolve({ rows: [{ id: 'uuid-1', universal_product_id: 'SONY_WH-1000XM5', name: 'Sony Headphones' }] });
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
        url: 'https://www.amazon.com/dp/B09XS7GNLJ'
      };

      const res = await request(app)
        .post('/api/v1/products/detect')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.universalProductId).toBe('SONY_WH-1000XM5');
    });
  });
});
