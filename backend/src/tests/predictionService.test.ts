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

  describe('enhancedEnsemblePrediction', () => {
    it('should adjust weights for imminent event', () => {
      const arima = { expectedLow: 100, expectedHigh: 110, trend: 'flat', confidence: 0.8, predictedNext: 105 };
      const seasonal = { seasonalFactor: 0, trendComponent: 0, residualVariance: 0, dayOfWeekEffect: 0, monthEffect: 0, isHistoricallyLow: false };
      const hw = { smoothedValue: 105, trendValue: 0, forecastNext: 105 };
      const elasticity = { meanReversion: 0.5, priceFloor: 90, priceCeiling: 120, currentPosition: 0.5 };
      const momentum = { rsi: 50, macdSignal: 'neutral', velocity: 0 };
      const eventFactor = { nearestEventDays: 2, expectedDiscount: 20, eventName: 'Sale' };
      const crossPlatform = { lowestKnownPrice: 105, priceSpread: 0, platformCount: 1 };

      const result = (predictionService as any).enhancedEnsemblePrediction(
        'uuid', 105, arima, seasonal, hw, elasticity, momentum, eventFactor, crossPlatform, 100
      );

      // Check that it predicts a lower price due to the event
      expect(result.expectedPriceRange.low).toBeLessThan(100);
      expect(result.dropProbability).toBeGreaterThan(0.5);
    });
  });
});
