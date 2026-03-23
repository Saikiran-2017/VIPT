import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { dataValidator } from '../services/DataValidator';
import { query } from '../models/database';
import { Platform } from '@shared/types';

jest.mock('../models/database');
jest.mock('../models/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios');
const mockedQuery = query as jest.Mock;
const mockedAxiosGet = axios.get as jest.Mock;

describe('DataValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxiosGet.mockResolvedValue({ data: { rates: { USD: 1 } } });
  });

  const point = (over: Partial<{ price: number; confidence?: number; currency: string }> = {}) => ({
    id: uuidv4(),
    productId: 'prod-1',
    platform: Platform.AMAZON,
    price: over.price ?? 99.99,
    currency: over.currency ?? 'USD',
    inStock: true,
    recordedAt: new Date(),
    confidence: over.confidence,
  });

  it('rejects zero or negative price', async () => {
    const r = await dataValidator.validate({ ...point(), price: 0 }, 'prod-1');
    expect(r.quality).toBe('rejected');
    const r2 = await dataValidator.validate({ ...point(), price: -1 }, 'prod-1');
    expect(r2.quality).toBe('rejected');
  });

  it('rejects duplicate same platform and price within 4 hours', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const r = await dataValidator.validate(point({ price: 50 }), 'prod-1');
    expect(r.quality).toBe('rejected');
    expect(r.reasons.join(' ').toLowerCase()).toContain('duplicate');
  });

  it('marks low-confidence observations as suspicious', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const r = await dataValidator.validate(point({ price: 50, confidence: 0.2 }), 'prod-1');
    expect(r.quality).toBe('suspicious');
    expect(r.reasons.some(x => x.includes('confidence'))).toBe(true);
  });

  it('accepts normal USD prices as validated when no flags fire', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const r = await dataValidator.validate(point({ price: 50, confidence: 0.95 }), 'prod-1');
    expect(r.quality).toBe('validated');
    expect(r.normalizedPriceUSD).toBe(50);
  });
});
