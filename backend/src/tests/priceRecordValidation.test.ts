import { createExpressApp } from '../server';
import { authed } from './authTestHelpers';
import { priceAggregationService } from '../services/priceAggregationService';

const validPayload = {
  productId: '550e8400-e29b-41d4-a716-446655440000',
  platform: 'amazon',
  price: 99.99,
  shippingCost: 0,
  inStock: true,
  url: 'https://example.com/p/1',
};

describe('POST /api/v1/prices/record validation', () => {
  const app = createExpressApp();
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(priceAggregationService, 'recordPrice').mockResolvedValue(undefined);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('accepts a valid payload and calls recordPrice', async () => {
    await authed(app).post('/api/v1/prices/record').send(validPayload).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(validPayload.productId);
    expect(spy.mock.calls[0][1]).toBe('amazon');
    expect(spy.mock.calls[0][2]).toBe(99.99);
    expect(spy.mock.calls[0][9]).toBe('USD');
  });

  it('rejects missing productId with 400', async () => {
    const { productId: _p, ...rest } = validPayload;
    const res = await authed(app).post('/api/v1/prices/record').send(rest).expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Validation error/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects invalid productId uuid with 400', async () => {
    const res = await authed(app)
      .post('/api/v1/prices/record')
      .send({ ...validPayload, productId: 'not-a-uuid' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects invalid platform enum with 400', async () => {
    const res = await authed(app)
      .post('/api/v1/prices/record')
      .send({ ...validPayload, platform: 'shopify' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects negative price with 400', async () => {
    const res = await authed(app)
      .post('/api/v1/prices/record')
      .send({ ...validPayload, price: -1 })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects unknown extra keys with 400 (strict)', async () => {
    const res = await authed(app)
      .post('/api/v1/prices/record')
      .send({ ...validPayload, extraField: 1 })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects invalid url when provided', async () => {
    const res = await authed(app)
      .post('/api/v1/prices/record')
      .send({ ...validPayload, url: 'not-a-url' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
