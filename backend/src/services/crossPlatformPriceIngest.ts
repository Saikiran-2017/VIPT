import { crossPlatformService } from './crossPlatformService';
import { priceAggregationService } from './priceAggregationService';
import { Platform } from '@shared/types';
import { logger } from '../utils/logger';

/**
 * Fetches cross-platform comparison data and persists scraped prices via `recordPrice`
 * (DataValidator runs inside `recordPrice`; rejected observations are skipped).
 * Used by HTTP handlers and BullMQ workers so ingestion stays validator-first everywhere.
 */
export async function fetchCrossPlatformAndRecordScrapedPrices(
  productId: string,
  productName: string,
  sourcePlatform: Platform,
  currentPrice: number,
  brand?: string,
  modelNumber?: string
): Promise<void> {
  const comparison = await crossPlatformService.getCrossPlatformPrices(
    productId,
    productName,
    sourcePlatform,
    currentPrice,
    brand,
    modelNumber
  );

  for (const result of comparison.results) {
    if (result.method !== 'scraped' || result.scrapedPrice == null) continue;

    const platformValue = Object.values(Platform).find((p) => p === result.platform);
    if (!platformValue) continue;

    try {
      await priceAggregationService.recordPrice(
        productId,
        platformValue,
        result.scrapedPrice,
        0,
        undefined,
        true,
        result.searchUrl,
        '',
        undefined,
        result.currency || 'USD',
        result.confidence
      );
    } catch (err) {
      logger.error(`Cross-platform price record failed for ${result.platform}:`, err);
    }
  }
}
