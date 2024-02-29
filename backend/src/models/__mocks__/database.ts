/**
 * Manual mock for `../models/database` when tests use `jest.mock('../models/database')`
 * without a factory. Keeps `databaseService.healthCheck` available for GET /ready.
 */
const healthCheck = jest.fn().mockResolvedValue(true);
const db = { healthCheck };

export const query = jest.fn();
export const transaction = jest.fn();
export const testConnection = jest.fn();

export { db as databaseService };
export default db;
