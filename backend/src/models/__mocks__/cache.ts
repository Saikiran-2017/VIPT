/**
 * Manual mock for `../models/cache` when tests use `jest.mock('../models/cache')`
 * without a factory. Provides `getRedisReadiness` for GET /ready.
 */

export async function initRedis(): Promise<never> {
  throw new Error('initRedis: override in test or use real module');
}

export function getRedisClient(): never {
  throw new Error('getRedisClient: Redis not initialized in manual mock');
}

export async function getRedisReadiness(): Promise<{
  status: 'connected' | 'not_configured' | 'unavailable';
}> {
  return { status: 'not_configured' };
}

export const cacheGet = jest.fn();
export const cacheSet = jest.fn();
export const cacheDelete = jest.fn();
export const cacheFlush = jest.fn();
