import { PriceAggregationService } from '../services/priceAggregationService';
import { query } from '../models/database';
import { Platform } from '@shared/types';

jest.mock('../models/database');
const mockedQuery = query as jest.Mock;

describe('PriceAggregationService', () => {
  let service: PriceAggregationService;

  beforeEach(() => {
    service = new PriceAggregationService();
    jest.clearAllMocks();
  });

  describe('recordPrice deduplication', () => {
    it('should NOT record a new history entry if price is the same and within cooldown', async () => {
      // Mock upsert platform listing
      mockedQuery.mockResolvedValueOnce({});

      // Mock last record (same price, recent)
      mockedQuery.mockResolvedValueOnce({
        rows: [{ price: '299.00', recorded_at: new Date().toISOString() }]
      });

      await service.recordPrice('uuid', Platform.AMAZON, 299, 0, undefined, true, 'url', 'sku', undefined, 'USD');

      // Check how many times query was called
      // 1: Upsert platform_listings
      // 2: Get last price record
      // 3: checkAlerts (it will call query inside)

      // If deduplication works, there should be NO INSERT INTO price_history
      const insertHistoryCall = mockedQuery.mock.calls.find(call => call[0].includes('INSERT INTO price_history'));
      expect(insertHistoryCall).toBeUndefined();
    });

    it('should record a new history entry if price changed', async () => {
      mockedQuery.mockResolvedValueOnce({}); // upsert
      mockedQuery.mockResolvedValueOnce({ // last record (different price)
        rows: [{ price: '348.00', recorded_at: new Date().toISOString() }]
      });
      mockedQuery.mockResolvedValueOnce({}); // insert history

      await service.recordPrice('uuid', Platform.AMAZON, 299, 0, undefined, true, 'url', 'sku', undefined, 'USD');

      const insertHistoryCall = mockedQuery.mock.calls.find(call => call[0].includes('INSERT INTO price_history'));
      expect(insertHistoryCall).toBeDefined();
    });
  });
});
