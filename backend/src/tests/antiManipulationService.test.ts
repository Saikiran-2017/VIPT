import { AntiManipulationService } from '../services/antiManipulationService';
import { ManipulationFlag } from '@shared/types';

describe('AntiManipulationService', () => {
  let antiManipulationService: AntiManipulationService;

  beforeEach(() => {
    antiManipulationService = new AntiManipulationService();
  });

  describe('detectPreSaleSpike', () => {
    it('should detect price spikes before a "discount"', () => {
      // Prices were around 100, then spiked to 140, then "discounted" to 110
      // Need enough olderPrices (7+) and recentPrices (14)
      const prices = [
        100, 100, 100, 100, 100, 100, 100, 100, 100, 100, // Older (10)
        100, 100, 100, 100, 100, 100, 100, 140, 140, 140, // Recent part 1
        140, 140, 140, 110                                // Recent part 2
      ];
      const result = (antiManipulationService as any).detectPreSaleSpike(prices);
      expect(result).toBe(true);
    });

    it('should not flag normal price variations', () => {
      const prices = [100, 102, 99, 101, 100, 103, 100, 101, 100, 102, 101];
      const result = (antiManipulationService as any).detectPreSaleSpike(prices);
      expect(result).toBe(false);
    });
  });

  describe('detectFrequentChanges', () => {
    it('should detect highly volatile price changes', () => {
      const prices = [100, 110, 90, 120, 80, 130, 70];
      const result = (antiManipulationService as any).detectFrequentChanges(prices);
      expect(result).toBe(true);
    });
  });
});
