import { CrossPlatformService } from '../services/crossPlatformService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CrossPlatformService', () => {
  let service: CrossPlatformService;

  beforeEach(() => {
    service = new CrossPlatformService();
    jest.clearAllMocks();
  });

  describe('buildSearchQuery', () => {
    it('should prioritize brand and model number', () => {
      const query = (service as any).buildSearchQuery('Some Product Title', 'Sony', 'WH-1000XM5');
      expect(query).toBe('Sony WH-1000XM5');
    });

    it('should clean up product name if no model number', () => {
      const query = (service as any).buildSearchQuery('Sony WH-1000XM5 Headphones with Noise Cancelling [Black]', 'Sony', undefined);
      expect(query).toBe('Sony WH-1000XM5 Headphones Noise Cancelling');
    });
  });

  describe('calculateNameSimilarity', () => {
    it('should return high similarity for similar names', () => {
      const sim = (service as any).calculateNameSimilarity('Sony WH-1000XM5 Black', 'Sony WH-1000XM5 Wireless Headphones');
      expect(sim).toBeGreaterThanOrEqual(0.5);
    });

    it('should return low similarity for different names', () => {
      const sim = (service as any).calculateNameSimilarity('Sony WH-1000XM5', 'Apple AirPods Pro');
      expect(sim).toBeLessThan(0.3);
    });
  });

  describe('checkPlatform', () => {
    it('should return a scraped result on success', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html><div data-item-id="123"><div data-automation-id="product-price"><div class="f2">$299.00</div></div><div data-automation-id="product-title">Sony WH-1000XM5</div></div></html>'
      });

      const result = await (service as any).checkPlatform('walmart', 'Sony WH-1000XM5', 'Sony WH-1000XM5', 348);

      expect(result.method).toBe('scraped');
      expect(result.scrapedPrice).toBe(299);
      expect(result.platform).toBe('walmart');
    });

    it('should fall back to search link on failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await (service as any).checkPlatform('walmart', 'Sony WH-1000XM5', 'Sony WH-1000XM5', 348);

      expect(result.method).toBe('search_link');
      expect(result.scrapedPrice).toBeUndefined();
    });
  });
});
