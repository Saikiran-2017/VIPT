import { Queue } from 'bullmq';
import { getBullMqConnectionOptions } from './connection';
import { logger } from '../utils/logger';

export const PRICE_UPDATE_QUEUE_NAME = 'price-update';

export type CrossPlatformRefreshJobData = {
  productId: string;
  productName: string;
  sourcePlatform: string;
  currentPrice: number;
  brand?: string;
  modelNumber?: string;
};

let priceUpdateQueue: Queue | null = null;

export function getPriceUpdateQueue(): Queue {
  if (!priceUpdateQueue) {
    priceUpdateQueue = new Queue(PRICE_UPDATE_QUEUE_NAME, {
      connection: getBullMqConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return priceUpdateQueue;
}

/**
 * Enqueue a cross-platform refresh; scraped prices are written only through `recordPrice` (validator-first).
 */
export async function enqueueCrossPlatformRefreshJob(
  data: CrossPlatformRefreshJobData
): Promise<void> {
  const queue = getPriceUpdateQueue();
  await queue.add('cross-platform-refresh', data);
}

export async function closePriceUpdateQueue(): Promise<void> {
  if (priceUpdateQueue) {
    await priceUpdateQueue.close();
    priceUpdateQueue = null;
  }
  logger.info('Price update queue closed');
}
