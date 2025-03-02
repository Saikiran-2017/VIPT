// Global test setup — must include `databaseService.healthCheck` and `getRedisReadiness`
// for any test that loads `createExpressApp()` / GET /ready.
jest.mock('../models/database', () => {
  const healthCheck = jest.fn().mockResolvedValue(true);
  const db = { healthCheck };
  return {
    __esModule: true,
    query: jest.fn(),
    transaction: jest.fn(),
    testConnection: jest.fn(),
    databaseService: db,
    default: db,
  };
});

jest.mock('../models/cache', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDelete: jest.fn(),
  cacheFlush: jest.fn(),
  getRedisReadiness: jest.fn().mockResolvedValue({ status: 'not_configured' }),
}));
