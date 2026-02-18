import { PredictionService } from '../services/predictionService';
import { PredictionModel } from '@shared/types';

describe('PredictionService', () => {
  let predictionService: PredictionService;

  beforeEach(() => {
    predictionService = new PredictionService();
  });

  describe('arimaPredict', () => {
    it('should predict downward trend for decreasing prices', () => {
      const prices = [100, 95, 90, 85, 80, 75, 70];
      const result = (predictionService as any).arimaPredict(prices);
      expect(result.trend).toBe('down');
      expect(result.expectedLow).toBeLessThan(70);
    });

    it('should predict upward trend for increasing prices', () => {
      const prices = [100, 105, 110, 115, 120, 125, 130];
      const result = (predictionService as any).arimaPredict(prices);
      expect(result.trend).toBe('up');
      expect(result.expectedHigh).toBeGreaterThan(130);
    });
  });

  describe('calculateSmartWaitDays', () => {
    it('should suggest waiting for downward trend', () => {
      const momentum = { rsi: 50, macdSignal: 'neutral', velocity: -0.05 };
      const eventFactor = { nearestEventDays: -1, expectedDiscount: 0 };
      const seasonal = { isHistoricallyLow: false };
      const waitDays = (predictionService as any).calculateSmartWaitDays('down', momentum, eventFactor, 0.8, seasonal);
      expect(waitDays).toBeGreaterThan(0);
    });

    it('should suggest waiting for upcoming event', () => {
      const momentum = { rsi: 50, macdSignal: 'neutral', velocity: 0 };
      const eventFactor = { nearestEventDays: 10, expectedDiscount: 20 };
      const seasonal = { isHistoricallyLow: false };
      const waitDays = (predictionService as any).calculateSmartWaitDays('flat', momentum, eventFactor, 0.5, seasonal);
      expect(waitDays).toBe(10);
    });
  });
});
