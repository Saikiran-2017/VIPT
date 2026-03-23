import { query } from '../models/database';
import {
  coefficientOfVariation,
  volatilityClassFromCv,
  trendDirectionFromPrices,
  isSeasonalPattern,
  profileConfidenceFromSignals,
  recommendedBaselineMode,
  ProductProfiler,
} from '../services/productProfiler';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('productProfiler helpers', () => {
  it('volatilityClassFromCv maps CV to stable | moderate | volatile', () => {
    expect(volatilityClassFromCv(0.01)).toBe('stable');
    expect(volatilityClassFromCv(0.08)).toBe('moderate');
    expect(volatilityClassFromCv(0.2)).toBe('volatile');
  });

  it('trendDirectionFromPrices returns flat for very short series', () => {
    expect(trendDirectionFromPrices([10, 11])).toBe('flat');
  });

  it('trendDirectionFromPrices detects up when tail is higher than head', () => {
    const up = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120, 120];
    expect(trendDirectionFromPrices(up)).toBe('up');
  });

  it('trendDirectionFromPrices detects down when tail is lower', () => {
    const down = [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 100, 100];
    expect(trendDirectionFromPrices(down)).toBe('down');
  });

  it('isSeasonalPattern is false when insufficient data', () => {
    expect(isSeasonalPattern(Array.from({ length: 10 }, () => 100))).toBe(false);
    expect(isSeasonalPattern(Array.from({ length: 27 }, () => 100))).toBe(false);
  });

  it('profileConfidenceFromSignals is deterministic for same inputs', () => {
    const a = profileConfidenceFromSignals(20, 0.9, 120);
    const b = profileConfidenceFromSignals(20, 0.9, 120);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it('recommendedBaselineMode prefers conservative for cold start', () => {
    expect(
      recommendedBaselineMode({ isColdStart: true, volatilityClass: 'stable' })
    ).toBe('conservative_baseline');
  });

  it('recommendedBaselineMode widens for volatile when not cold start', () => {
    expect(
      recommendedBaselineMode({ isColdStart: false, volatilityClass: 'volatile' })
    ).toBe('rolling_mean_7d_wide');
  });
});

describe('ProductProfiler.getProductProfile', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('marks cold start when usable points < 14', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ total: 10, validated: 8, last_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 10 }, (_, i) => ({ price: String(100 + i) })),
      });

    const svc = new ProductProfiler();
    const p = await svc.getProductProfile('p-cold');
    expect(p.usableDataPoints).toBe(10);
    expect(p.isColdStart).toBe(true);
    expect(p.productId).toBe('p-cold');
  });

  it('not cold start at 14 points', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ total: 14, validated: 14, last_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 14 }, () => ({ price: '100' })),
      });

    const svc = new ProductProfiler();
    const p = await svc.getProductProfile('p-warm');
    expect(p.isColdStart).toBe(false);
  });

  it('classifies stable volatility for flat prices', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ total: 20, validated: 20, last_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 20 }, () => ({ price: '100' })),
      });

    const svc = new ProductProfiler();
    const p = await svc.getProductProfile('p-flat');
    expect(p.volatilityClass).toBe('stable');
    expect(coefficientOfVariation(Array(20).fill(100))).toBe(0);
  });

  it('handles empty history without throwing', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ total: 0, validated: 0, last_at: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const svc = new ProductProfiler();
    const p = await svc.getProductProfile('p-empty');
    expect(p.usableDataPoints).toBe(0);
    expect(p.freshnessMinutes).toBeNull();
    expect(p.isColdStart).toBe(true);
    expect(p.trendDirection).toBe('flat');
  });

  it('getProfiles dedupes ids', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ total: 1, validated: 1, last_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [{ price: '50' }] })
      .mockResolvedValueOnce({
        rows: [{ total: 1, validated: 1, last_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [{ price: '50' }] });

    const svc = new ProductProfiler();
    const list = await svc.getProfiles(['a', 'a', 'b']);
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.productId)).toEqual(['a', 'b']);
  });
});
