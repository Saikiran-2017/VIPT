import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import { RetailEvent, Platform } from '@shared/types';
import { API_CONFIG, RETAIL_EVENTS } from '@shared/constants';

/**
 * Event Intelligence Service
 * 
 * Manages retail events calendar:
 * - Black Friday, Prime Day, seasonal sales, etc.
 * - Predicts upcoming discount opportunities
 * - Integrates with prediction engine
 */
export class EventService {

  /**
   * Get upcoming retail events within the next N days
   */
  async getUpcomingEvents(withinDays: number = 90): Promise<RetailEvent[]> {
    const cacheKey = `events:upcoming:${withinDays}`;
    const cached = await cacheGet<RetailEvent[]>(cacheKey);
    if (cached) return cached;

    const result = await query(
      `SELECT * FROM retail_events
       WHERE start_date >= NOW()
         AND start_date <= NOW() + $1 * INTERVAL '1 day'
         AND is_active = true
       ORDER BY start_date ASC`,
      [withinDays]
    );

    const events: RetailEvent[] = result.rows.map(this.mapRowToEvent);
    await cacheSet(cacheKey, events, API_CONFIG.CACHE_TTL.EVENTS);
    return events;
  }

  /**
   * Get currently active events
   */
  async getActiveEvents(): Promise<RetailEvent[]> {
    const cacheKey = 'events:active';
    const cached = await cacheGet<RetailEvent[]>(cacheKey);
    if (cached) return cached;

    const result = await query(
      `SELECT * FROM retail_events
       WHERE start_date <= NOW()
         AND end_date >= NOW()
         AND is_active = true
       ORDER BY start_date ASC`
    );

    const events: RetailEvent[] = result.rows.map(this.mapRowToEvent);
    await cacheSet(cacheKey, events, 3600); // 1 hour cache
    return events;
  }

  /**
   * Get events for a specific platform
   */
  async getEventsForPlatform(platform: Platform, withinDays: number = 90): Promise<RetailEvent[]> {
    const result = await query(
      `SELECT * FROM retail_events
       WHERE (platform = $1 OR platform IS NULL)
         AND start_date >= NOW()
         AND start_date <= NOW() + $2 * INTERVAL '1 day'
         AND is_active = true
       ORDER BY start_date ASC`,
      [platform, withinDays]
    );

    return result.rows.map(this.mapRowToEvent);
  }

  /**
   * Calculate sale likelihood for upcoming period
   */
  async getSaleLikelihood(daysAhead: number = 30): Promise<{
    likelihood: number;
    nearestEvent: RetailEvent | null;
    daysUntil: number;
  }> {
    const events = await this.getUpcomingEvents(daysAhead);

    if (events.length === 0) {
      return { likelihood: 0.1, nearestEvent: null, daysUntil: -1 };
    }

    const nearest = events[0];
    const daysUntil = Math.ceil(
      (new Date(nearest.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Likelihood increases as event approaches
    const proximity = 1 - (daysUntil / daysAhead);
    const avgDiscount = (nearest.expectedDiscountRange.min + nearest.expectedDiscountRange.max) / 2;
    const likelihood = Math.min(0.95, proximity * 0.6 + (avgDiscount / 100) * 0.4);

    return {
      likelihood: Math.round(likelihood * 100) / 100,
      nearestEvent: nearest,
      daysUntil,
    };
  }

  /**
   * Sync events from the static events calendar
   */
  async syncEventsCalendar(): Promise<void> {
    const currentYear = new Date().getFullYear();

    for (const event of RETAIL_EVENTS) {
      for (const platform of event.platforms) {
        const startDate = new Date(currentYear, event.monthStart - 1, event.dayStart);
        const endDate = new Date(currentYear, event.monthEnd - 1, event.dayEnd);

        // Skip past events (schedule next year's)
        if (endDate < new Date()) {
          startDate.setFullYear(currentYear + 1);
          endDate.setFullYear(currentYear + 1);
        }

        await query(
          `INSERT INTO retail_events (name, platform, start_date, end_date, region, expected_discount_min, expected_discount_max, categories, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
           ON CONFLICT DO NOTHING`,
          [
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

    logger.info('Events calendar synced');
  }

  // ─── Mapping Helpers ─────────────────────────────────────────

  private mapRowToEvent(row: Record<string, unknown>): RetailEvent {
    return {
      id: row.id as string,
      name: row.name as string,
      platform: row.platform as Platform | undefined,
      startDate: new Date(row.start_date as string),
      endDate: new Date(row.end_date as string),
      region: row.region as string,
      expectedDiscountRange: {
        min: parseFloat(row.expected_discount_min as string) || 0,
        max: parseFloat(row.expected_discount_max as string) || 0,
      },
      categories: (row.categories as string[]) || [],
      isActive: row.is_active as boolean,
    };
  }
}

export const eventService = new EventService();
