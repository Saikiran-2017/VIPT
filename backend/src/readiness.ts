import { databaseService } from './models/database';
import { getRedisReadiness } from './models/cache';

export type ReadinessChecks = {
  database: { status: 'ok' | 'unavailable' };
  redis: {
    status: 'connected' | 'not_configured' | 'unavailable';
    /** True when Redis is optional (not configured) or connected; false when configured but unreachable. */
    ready: boolean;
  };
};

export type ReadinessState = {
  ready: boolean;
  checks: ReadinessChecks;
};

/**
 * Production readiness: PostgreSQL is required. Redis is reported but optional (app can run degraded).
 */
export async function getReadinessState(): Promise<ReadinessState> {
  const dbOk = await databaseService.healthCheck();
  const redis = await getRedisReadiness();

  return {
    ready: dbOk,
    checks: {
      database: { status: dbOk ? 'ok' : 'unavailable' },
      redis: {
        status: redis.status,
        ready: redis.status === 'connected' || redis.status === 'not_configured',
      },
    },
  };
}
