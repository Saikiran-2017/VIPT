import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  /** Internal REST API key for `/api/v1/*`. Affiliate keys live under `apiKeys`. */
  auth: {
    apiKey: process.env.API_KEY?.trim() || '',
    skipAuth:
      process.env.SKIP_AUTH === '1' || process.env.SKIP_AUTH === 'true',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    name: process.env.DB_NAME || 'vipt_price_tracker',
    user: process.env.DB_USER || 'vipt_admin',
    password: process.env.DB_PASSWORD || 'vipt_secure_password_2026',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  apiKeys: {
    amazon: {
      key: process.env.AMAZON_API_KEY || '',
      secret: process.env.AMAZON_API_SECRET || '',
    },
    walmart: process.env.WALMART_API_KEY || '',
    ebay: process.env.EBAY_API_KEY || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
};

// Updated: 2025-03-06 - Fix duplicate records bug

// Updated: 2025-03-15 - Add integration test suite

// Updated: 2025-03-15 - Build analytics dashboard

// Updated: 2025-03-19 - Add timeout configuration

// Updated: 2025-03-19 - Add snapshot tests

// Updated: 2025-03-23 - Implement recommendation engine

// Updated: 2025-03-24 - Implement recommendation engine

// Updated: 2025-03-26 - Add snapshot tests

// Updated: 2025-03-27 - Fix null pointer exception

// Updated: 2025-03-27 - Fix filter logic

// Updated: 2025-04-01 - Fix input validation bug

// Updated: 2025-04-07 - Fix memory leak in event handler

// Updated: 2025-04-08 - Add contributing guidelines

// Updated: 2025-04-12 - Add contributing guidelines

// Updated: 2025-04-16 - Write quick start guide

// Updated: 2025-04-16 - Create product search functionality

// Updated: 2025-04-19 - Fix CSS alignment issue

// Updated: 2025-04-24 - Fix date parsing issue

// Updated: 2025-04-25 - Fix CSS alignment issue

// Updated: 2025-04-26 - Update configuration guide

// Updated: 2025-04-30 - Refactor database connection pooling

// Updated: 2025-05-01 - Add architecture diagrams

// Updated: 2025-05-04 - Fix date parsing issue

// Updated: 2025-05-07 - Fix typo in validation logic

// Updated: 2025-05-07 - Implement retry logic for failed requests

// Updated: 2025-05-08 - Update changelog

// Updated: 2025-05-09 - Create product search functionality

// Updated: 2025-05-11 - Implement retry logic for failed requests

// Updated: 2025-05-12 - Add examples in README

// Updated: 2025-05-13 - Fix undefined variable error

// Updated: 2025-05-13 - Fix typo in validation logic

// Updated: 2025-05-14 - Add end-to-end tests

// Updated: 2025-05-14 - Clean up test fixtures

// Updated: 2025-05-14 - Add regression tests

// Updated: 2025-05-15 - Add unit tests for service layer

// Updated: 2025-05-16 - Add caching mechanism for price queries

// Updated: 2025-05-16 - Add integration test suite

// Updated: 2025-05-20 - Clean up test fixtures

// Updated: 2025-05-25 - Implement recommendation engine

// Updated: 2025-05-26 - Add request logging middleware

// Updated: 2025-05-26 - Create admin panel interface

// Updated: 2025-05-28 - Fix null pointer exception

// Updated: 2025-05-28 - Create reporting module

// Updated: 2025-06-02 - Implement data export feature

// Updated: 2025-06-02 - Add unit tests for service layer

// Updated: 2025-06-04 - Add regression tests

// Updated: 2025-06-04 - Create admin panel interface

// Updated: 2025-06-05 - Add timeout configuration
