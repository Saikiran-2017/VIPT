import { featureEngineer } from '../services/FeatureEngineer';
import type { RetailEvent } from '@shared/types';

function linearPrices(n: number, start = 100, step = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((start + i * step) * 100) / 100);
}

function dailyDates(n: number, start = new Date('2024-06-01T12:00:00Z')): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

describe('FeatureEngineer', () => {
  describe('buildFeatureVector', () => {
    it('throws when fewer than 2 price points', () => {
      expect(() =>
        featureEngineer.buildFeatureVector([100], [new Date()], [])
      ).toThrow(/at least 2 price points/);
    });

    it('produces a complete feature vector from 20 price points', () => {
      const prices = linearPrices(20);
      const dates = dailyDates(20);
      const v = featureEngineer.buildFeatureVector(prices, dates, [], [99, 100, 101]);
      expect(v.dimension).toBe(19);
      expect(v.values.length).toBe(19);
      expect(v.features).toBeDefined();
      expect(v.features!.googleTrendScore).toBe(50);
      expect(v.features!.reviewSentiment).toBe(0);
      expect(v.values).toEqual(
        expect.arrayContaining([expect.any(Number)])
      );
    });

    it('supports short history (2 points) with safe fallbacks', () => {
      const prices = [100, 102];
      const dates = dailyDates(2);
      const v = featureEngineer.buildFeatureVector(prices, dates, []);
      expect(v.features!.lag1).toBeCloseTo(100 / 102, 5);
      expect(Number.isFinite(v.features!.rsi14)).toBe(true);
      expect(Number.isFinite(v.features!.rollingMean7d)).toBe(true);
    });

    it('returns numeric RSI and rolling statistics', () => {
      const prices = linearPrices(15);
      const dates = dailyDates(15);
      const v = featureEngineer.buildFeatureVector(prices, dates, []);
      expect(typeof v.features!.rsi14).toBe('number');
      expect(typeof v.features!.rollingMean7d).toBe('number');
      expect(typeof v.features!.rollingStd7d).toBe('number');
    });

    it('keeps pricePct30dRange in [0, 1]', () => {
      const prices = linearPrices(25, 200, 1);
      const dates = dailyDates(25);
      const v = featureEngineer.buildFeatureVector(prices, dates, []);
      const r = v.features!.pricePct30dRange;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('uses nearest retail event for discount and days', () => {
      const prices = linearPrices(20);
      const dates = dailyDates(20);
      const events: RetailEvent[] = [
        {
          id: 'e1',
          name: 'Sale',
          startDate: new Date('2024-06-25T00:00:00Z'),
          endDate: new Date('2024-06-26T00:00:00Z'),
          region: 'global',
          expectedDiscountRange: { min: 10, max: 20 },
          categories: [],
          isActive: true,
        },
      ];
      const v = featureEngineer.buildFeatureVector(prices, dates, events);
      expect(v.features!.nearestEventDiscount).toBe(15);
      expect(v.features!.daysToNearestEvent).toBeGreaterThanOrEqual(0);
    });
  });
});
