import request from 'supertest';
import { createExpressApp } from '../server';
import { query } from '../models/database';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('Prompt 4: GET /api/v1/prices/features/:productId', () => {
  const app = createExpressApp();

  afterEach(() => {
    mockedQuery.mockReset();
  });

  it('returns 404 when fewer than 2 price_history rows', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    await request(app).get('/api/v1/prices/features/prod-1').expect(404);
  });

  it('returns FeatureVector when history is sufficient', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          { price: '100', currency: 'USD', recorded_at: new Date('2024-01-01').toISOString() },
          { price: '102', currency: 'USD', recorded_at: new Date('2024-01-02').toISOString() },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ total_effective_price: '100' }, { total_effective_price: '105' }],
      });

    const res = await request(app).get('/api/v1/prices/features/prod-1').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dimension).toBe(19);
    expect(res.body.data.values.length).toBe(19);
  });
});
