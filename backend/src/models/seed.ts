import { query } from './database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { RETAIL_EVENTS } from '@shared/constants';

async function seed(): Promise<void> {
  logger.info('Seeding database...');

  // Seed retail events
  for (const event of RETAIL_EVENTS) {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, event.monthStart - 1, event.dayStart);
    const endDate = new Date(currentYear, event.monthEnd - 1, event.dayEnd);

    for (const platform of event.platforms) {
      await query(
        `INSERT INTO retail_events (id, name, platform, start_date, end_date, region, expected_discount_min, expected_discount_max, categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          event.name,
          platform,
          startDate.toISOString(),
          endDate.toISOString(),
          event.region,
          event.expectedDiscountRange.min,
          event.expectedDiscountRange.max,
          event.categories,
        ]
      );
    }
  }

  // Seed a demo product for testing (upsert and retrieve the actual ID)
  const upsertResult = await query(
    `INSERT INTO products (id, universal_product_id, name, brand, model_number, category)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (universal_product_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [
      uuidv4(),
      'DEMO-SONY-WH1000XM5',
      'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
      'Sony',
      'WH-1000XM5',
      'electronics',
    ]
  );
  const demoProductId = upsertResult.rows[0].id;

  // Clear old demo price history before re-seeding
  await query(`DELETE FROM price_history WHERE product_id = $1`, [demoProductId]);

  // Seed demo price history (90 days of data)
  const now = new Date();
  const platforms = ['amazon', 'flipkart', 'walmart'];
  const basePrices: Record<string, number> = { amazon: 348, flipkart: 330, walmart: 345 };

  for (const platform of platforms) {
    const basePrice = basePrices[platform];
    for (let i = 90; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Simulate price variations
      const variation = Math.sin(i / 15) * 20 + (Math.random() - 0.5) * 10;
      const price = Math.round((basePrice + variation) * 100) / 100;

      await query(
        `INSERT INTO price_history (id, product_id, platform, price, in_stock, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), demoProductId, platform, price, true, date.toISOString()]
      );
    }
  }

  logger.info('Database seeded successfully');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Seed error:', err);
      process.exit(1);
    });
}

export { seed };
