import { productIdentityService } from '../services/productIdentityService';
import { query } from '../models/database';
import { Platform } from '@shared/types';

jest.mock('../models/database');

describe('ProductIdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeTitle', () => {
    it('should normalize titles correctly', () => {
      const title = 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black';
      const normalized = productIdentityService.normalizeTitle(title);
      expect(normalized).toBe('sony wh 1000xm5 wireless noise cancelling headphones black');
    });

    it('should remove stop words', () => {
      const title = 'The Sony Headphones and a Case';
      const normalized = productIdentityService.normalizeTitle(title);
      expect(normalized).toBe('sony headphones case');
    });
  });

  describe('extractModelNumber', () => {
    it('should extract model numbers correctly', () => {
      expect(productIdentityService.extractModelNumber('Sony WH-1000XM5 Headphones')).toBe('WH-1000XM5');
      expect(productIdentityService.extractModelNumber('Apple iPhone 13 Pro (MLPF3HN/A)')).toBe('MLPF3HN/A');
    });
  });

  describe('generateUniversalProductId', () => {
    it('should generate ID from brand and model', () => {
      const id = productIdentityService.generateUniversalProductId({
        name: 'Headphones',
        brand: 'Sony',
        modelNumber: 'WH-1000XM5',
        currentPrice: 300,
        currency: 'USD',
        platform: Platform.AMAZON,
        url: 'http://amazon.com/p1'
      });
      expect(id).toBe('SONY_WH-1000XM5');
    });
  });
});
