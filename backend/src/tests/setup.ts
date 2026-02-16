// Global test setup
jest.mock('../models/database', () => ({
  query: jest.fn(),
}));

jest.mock('../models/cache', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));
