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
