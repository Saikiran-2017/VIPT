import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '@shared/types';

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error:', err);

  const statusCode = (err as any).statusCode || 500;
  const response: ApiResponse<null> = {
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date(),
  };

  res.status(statusCode).json(response);
}

/**
 * Not found middleware
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse<null> = {
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date(),
  };

  res.status(404).json(response);
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
}

/**
 * Response wrapper middleware - ensures consistent API response format
 */
export function responseWrapper(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    // If already wrapped, pass through
    if (body && typeof body === 'object' && 'success' in body) {
      return originalJson(body);
    }

    // Wrap in standard response
    const wrapped: ApiResponse<typeof body> = {
      success: true,
      data: body,
      timestamp: new Date(),
    };

    return originalJson(wrapped);
  };

  next();
}
