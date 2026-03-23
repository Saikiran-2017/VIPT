import { logger } from '../utils/logger';
import { registerPriceUpdateRepeatableJobs } from './scheduler';
import { startPriceUpdateWorker } from './priceUpdateWorker';

/**
 * Starts BullMQ worker + repeatable scheduler for price refresh jobs.
 * Call only when Redis is available and `NODE_ENV !== 'test'`.
 */
export async function startBullMqPriceInfrastructure(): Promise<void> {
  await startPriceUpdateWorker();
  await registerPriceUpdateRepeatableJobs();
  logger.info('BullMQ price update infrastructure started');
}
