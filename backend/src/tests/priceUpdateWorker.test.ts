import type { Job } from 'bullmq';
import { processPriceUpdateJob } from '../queues/priceUpdateWorker';
import { fetchCrossPlatformAndRecordScrapedPrices } from '../services/crossPlatformPriceIngest';
import { enqueueCrossPlatformRefreshJob } from '../queues/priceUpdateQueue';
import { query } from '../models/database';

jest.mock('../services/crossPlatformPriceIngest', () => ({
  fetchCrossPlatformAndRecordScrapedPrices: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../queues/priceUpdateQueue', () => ({
  PRICE_UPDATE_QUEUE_NAME: 'price-update',
  enqueueCrossPlatformRefreshJob: jest.fn().mockResolvedValue(undefined),
  getPriceUpdateQueue: jest.fn(),
  closePriceUpdateQueue: jest.fn(),
}));

jest.mock('../models/database');

const mockedFetch = fetchCrossPlatformAndRecordScrapedPrices as jest.Mock;
const mockedEnqueue = enqueueCrossPlatformRefreshJob as jest.Mock;
const mockedQuery = query as jest.Mock;

describe('priceUpdateWorker (BullMQ → validator-first ingest)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates cross-platform-refresh jobs to fetchCrossPlatformAndRecordScrapedPrices (recordPrice + DataValidator)', async () => {
    const job = {
      name: 'cross-platform-refresh',
      data: {
        productId: 'p1',
        productName: 'Test',
        sourcePlatform: 'amazon',
        currentPrice: 49.99,
        brand: 'B',
        modelNumber: 'M',
      },
    } as unknown as Job;

    await processPriceUpdateJob(job);

    expect(mockedFetch).toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledWith(
      'p1',
      'Test',
      'amazon',
      49.99,
      'B',
      'M'
    );
  });

  it('periodic-scan enqueues per-product jobs (ingestion runs in worker via cross-platform-refresh)', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'p1',
          name: 'N',
          brand: 'Br',
          model_number: 'M1',
          platform: 'amazon',
          current_price: '100',
        },
      ],
    });

    await processPriceUpdateJob({ name: 'periodic-scan', data: {} } as unknown as Job);

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'p1',
        productName: 'N',
        sourcePlatform: 'amazon',
        currentPrice: 100,
      })
    );
  });
});
