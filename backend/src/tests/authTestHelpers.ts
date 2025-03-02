import request from 'supertest';
import type { Application } from 'express';

/** Must match `jest-env-setup.ts` default. */
export const TEST_API_KEY = 'test-api-key-vipt-jest';

/** Stable UUIDs for extension identity tests (alerts). */
export const TEST_USER_A = '11111111-1111-1111-1111-111111111111';
export const TEST_USER_B = '22222222-2222-2222-2222-222222222222';

/**
 * Supertest helpers with `X-API-Key` for `/api/v1/*` (must chain .set after HTTP verb).
 */
export function authed(app: Application) {
  return {
    get: (url: string) => request(app).get(url).set('X-API-Key', TEST_API_KEY),
    post: (url: string) => request(app).post(url).set('X-API-Key', TEST_API_KEY),
    delete: (url: string) => request(app).delete(url).set('X-API-Key', TEST_API_KEY),
    patch: (url: string) => request(app).patch(url).set('X-API-Key', TEST_API_KEY),
    put: (url: string) => request(app).put(url).set('X-API-Key', TEST_API_KEY),
  };
}

/**
 * Same as `authed` plus `X-User-Id` for extension-scoped routes (e.g. `/api/v1/alerts/*`).
 */
export function authedAsUser(app: Application, userId: string) {
  return {
    get: (url: string) =>
      request(app).get(url).set('X-API-Key', TEST_API_KEY).set('X-User-Id', userId),
    post: (url: string) =>
      request(app).post(url).set('X-API-Key', TEST_API_KEY).set('X-User-Id', userId),
    delete: (url: string) =>
      request(app).delete(url).set('X-API-Key', TEST_API_KEY).set('X-User-Id', userId),
    patch: (url: string) =>
      request(app).patch(url).set('X-API-Key', TEST_API_KEY).set('X-User-Id', userId),
    put: (url: string) =>
      request(app).put(url).set('X-API-Key', TEST_API_KEY).set('X-User-Id', userId),
  };
}
