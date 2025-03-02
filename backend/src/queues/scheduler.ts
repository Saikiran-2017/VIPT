import { getPriceUpdateQueue } from './priceUpdateQueue';
import { logger } from '../utils/logger';

const REPEATABLE_PERIODIC_JOB_ID = 'repeatable-price-periodic-scan-v1';

/**
 * Registers a repeatable job that enqueues per-product cross-platform refresh work.
 * Requires an active `Worker` for `price-update` (see `priceUpdateWorker.ts`).
 */
export async function registerPriceUpdateRepeatableJobs(): Promise<void> {
  const queue = getPriceUpdateQueue();
  await queue.add(
    'periodic-scan',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: REPEATABLE_PERIODIC_JOB_ID,
    }
  );
  logger.info('Registered BullMQ repeatable job: periodic-scan (every 15 minutes)');
}
