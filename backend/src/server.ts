import express from 'express';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyExpress from '@fastify/express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './utils/logger';
import { testConnection } from './models/database';
import { initRedis } from './models/cache';
import { runMigrations } from './db/migrate';
import { startBullMqPriceInfrastructure } from './queues/bootstrap';
import { startAlertWorker } from './workers/alertWorker';
import { startPriceWorker } from './workers/priceWorker';

import productRoutes from './routes/productRoutes';
import priceRoutes from './routes/priceRoutes';
import predictionRoutes from './routes/predictionRoutes';
import eventRoutes from './routes/eventRoutes';
import alertRoutes from './routes/alertRoutes';
import recommendationRoutes from './routes/recommendationRoutes';

import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/errorHandler';

const API_PREFIX = '/api/v1';

/**
 * Express application (routes + middleware). Mounted inside Fastify via `@fastify/express` for Phase 1.
 */
export function createExpressApp(): express.Application {
  const app = express();

  app.use(helmet());
  // Compression breaks `app.inject()` response bodies when Express is mounted under Fastify (light-my-request).
  if (process.env.NODE_ENV !== 'test') {
    app.use(compression());
  }
  app.use(
    cors({
      origin: config.server.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: 'Too many requests, please try again later.',
      timestamp: new Date(),
    },
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    })
  );
  app.use(requestLogger);

  app.get('/health', (_req: express.Request, res: express.Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        service: 'vipt',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date(),
      },
    });
  });

  app.use(`${API_PREFIX}/products`, productRoutes);
  app.use(`${API_PREFIX}/prices`, priceRoutes);
  app.use(`${API_PREFIX}/predictions`, predictionRoutes);
  app.use(`${API_PREFIX}/events`, eventRoutes);
  app.use(`${API_PREFIX}/alerts`, alertRoutes);
  app.use(`${API_PREFIX}/recommendation`, recommendationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * HTTP stack: Fastify entry + Express app (validator-first routes unchanged).
 */
export async function buildServer(): Promise<FastifyInstance> {
  const expressApp = createExpressApp();
  const fastify = Fastify({
    logger: false,
    trustProxy: true,
  });
  await fastify.register(fastifyExpress);
  fastify.use(expressApp);
  await fastify.ready();
  return fastify;
}

async function startServer(): Promise<void> {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed - server will start but DB operations will fail');
    }

    if (dbConnected) {
      const skipMigrate =
        process.env.SKIP_DB_MIGRATE === '1' || process.env.SKIP_DB_MIGRATE === 'true';
      if (skipMigrate) {
        logger.warn('Skipping database migrations (SKIP_DB_MIGRATE is set)');
      } else {
        await runMigrations();
        logger.info('Database migrations completed');
      }
    }

    let redisReady = false;
    try {
      await initRedis();
      redisReady = true;
      logger.info('Redis connected');
    } catch (err) {
      logger.warn('Redis connection failed - running without cache', err);
    }

    if (config.server.nodeEnv !== 'test') {
      void startAlertWorker();
      startPriceWorker();
      if (redisReady) {
        try {
          await startBullMqPriceInfrastructure();
        } catch (err) {
          logger.warn('BullMQ price infrastructure failed to start', err);
        }
      } else {
        logger.warn('BullMQ price workers disabled (Redis unavailable)');
      }
    }

    const fastify = await buildServer();
    await fastify.listen({ port: config.server.port, host: '0.0.0.0' });
    logger.info(`
╔═══════════════════════════════════════════════════════╗
║    VIPT - Vayu Intelligence Price Tracker             ║
║              API (Fastify + Express)                  ║
║  Port:     ${config.server.port}                                   ║
║  Env:      ${config.server.nodeEnv.padEnd(21)}            ║
║  API:      http://localhost:${config.server.port}/api/v1             ║
║  Health:   http://localhost:${config.server.port}/health             ║
╚═══════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
