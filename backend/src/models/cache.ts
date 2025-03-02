import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | undefined;

export type RedisReadinessStatus = 'connected' | 'not_configured' | 'unavailable';

/**
 * Used by GET /ready: report whether the optional Redis client is usable (never throws).
 */
export async function getRedisReadiness(): Promise<{ status: RedisReadinessStatus }> {
  if (!redisClient) {
    return { status: 'not_configured' };
  }
  try {
    await redisClient.ping();
    return { status: 'connected' };
  } catch (err) {
    logger.warn('Redis readiness ping failed', err);
    return { status: 'unavailable' };
  }
}

export async function initRedis(): Promise<RedisClientType> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    redisClient = createClient({ url: redisUrl });
  } else {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
    });
  }

  redisClient.on('error', (err: Error) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  await redisClient.connect();
  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    logger.warn(`Cache get failed for key: ${key}`);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    logger.warn(`Cache set failed for key: ${key}`);
  }
}

export async function cacheDelete(key: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    logger.warn(`Cache delete failed for key: ${key}`);
  }
}

export async function cacheFlush(pattern: string): Promise<void> {
  if (!redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch {
    logger.warn(`Cache flush failed for pattern: ${pattern}`);
  }
}
