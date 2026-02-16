import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './utils/logger';
import { testConnection } from './models/database';
import { initRedis } from './models/cache';
import { runMigrations } from './models/migrate';
import { startAlertWorker } from './workers/alertWorker';

// Routes
import productRoutes from './routes/productRoutes';
import priceRoutes from './routes/priceRoutes';
import predictionRoutes from './routes/predictionRoutes';
import eventRoutes from './routes/eventRoutes';
import alertRoutes from './routes/alertRoutes';
import recommendationRoutes from './routes/recommendationRoutes';

// Middleware
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/errorHandler';

const app = express();

// ─── Security & Performance Middleware ─────────────────────

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.server.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.info(message.trim()) },
}));
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────

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

// ─── API Routes ───────────────────────────────────────────────

const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/products`, productRoutes);
app.use(`${API_PREFIX}/prices`, priceRoutes);
app.use(`${API_PREFIX}/predictions`, predictionRoutes);
app.use(`${API_PREFIX}/events`, eventRoutes);
app.use(`${API_PREFIX}/alerts`, alertRoutes);
app.use(`${API_PREFIX}/recommendation`, recommendationRoutes);

// ─── Error Handling ───────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Server Startup ───────────────────────────────────────────

async function startServer(): Promise<void> {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed - server will start but DB operations will fail');
    }

    // Run migrations
    if (dbConnected) {
      await runMigrations();
      logger.info('Database migrations completed');
    }

    // Initialize Redis
    try {
      await initRedis();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn('Redis connection failed - running without cache', err);
    }

    // Start workers
    startAlertWorker();

    // Start listening
    app.listen(config.server.port, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════╗
║    VIPT - Vayu Intelligence Price Tracker             ║
║                  API Server                           ║
║  Port:     ${config.server.port}                                   ║
║  Env:      ${config.server.nodeEnv.padEnd(21)}            ║
║  API:      http://localhost:${config.server.port}/api/v1             ║
║  Health:   http://localhost:${config.server.port}/health             ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export default app;
