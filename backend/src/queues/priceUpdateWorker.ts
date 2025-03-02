import { Worker, type Job } from 'bullmq';
import { Platform } from '@shared/types';
import { query } from '../models/database';
import { logger } from '../utils/logger';
import { fetchCrossPlatformAndRecordScrapedPrices } from '../services/crossPlatformPriceIngest';
import {
  PRICE_UPDATE_QUEUE_NAME,
  enqueueCrossPlatformRefreshJob,
  type CrossPlatformRefreshJobData,
} from './priceUpdateQueue';
import { getBullMqConnectionOptions } from './connection';

let worker: Worker | null = null;

/**
 * BullMQ processor: cross-platform refresh jobs call the same validator-first ingest as HTTP.
 */
export async function processPriceUpdateJob(job: Job): Promise<void> {
  if (job.name === 'periodic-scan') {
    await enqueuePeriodicCrossPlatformJobs();
    return;
  }

  if (job.name === 'cross-platform-refresh') {
    const d = job.data as CrossPlatformRefreshJobData;
    await fetchCrossPlatformAndRecordScrapedPrices(
      d.productId,
      d.productName,
      d.sourcePlatform as Platform,
      d.currentPrice,
      d.brand,
      d.modelNumber
    );
  }
}

async function enqueuePeriodicCrossPlatformJobs(): Promise<void> {
  const result = await query(`
    SELECT p.id, p.name, p.brand, p.model_number,
           pl.platform, pl.current_price
    FROM products p
    JOIN platform_listings pl ON p.id = pl.product_id
    WHERE pl.last_updated > NOW() - INTERVAL '24 hours'
    ORDER BY pl.last_updated DESC
    LIMIT 5
  `);

  if (result.rows.length === 0) {
    logger.info('Periodic scan: no active listings to enqueue');
    return;
  }

  logger.info(`Periodic scan: enqueueing ${result.rows.length} cross-platform refresh jobs`);

  for (const row of result.rows) {
    try {
      await enqueueCrossPlatformRefreshJob({
        productId: row.id,
        productName: row.name,
        sourcePlatform: row.platform,
        currentPrice: parseFloat(row.current_price),
        brand: row.brand || undefined,
        modelNumber: row.model_number || undefined,
      });
    } catch (e) {
      logger.error(`Failed to enqueue refresh for ${row.id}:`, e);
    }
  }
}

export async function startPriceUpdateWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = new Worker(PRICE_UPDATE_QUEUE_NAME, (job) => processPriceUpdateJob(job), {
    connection: getBullMqConnectionOptions(),
    concurrency: 2,
  });
  worker.on('failed', (job, err) => {
    logger.error(`Price update job ${job?.id} failed:`, err);
  });
  return worker;
}

export async function closePriceUpdateWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
