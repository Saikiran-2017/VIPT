import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function extractApiKey(req: Request): string | undefined {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  return undefined;
}

/**
 * Requires `X-API-Key` (or `Authorization: Bearer <key>`) for all mounted routes.
 * Skipped when `SKIP_AUTH=1` (local dev only — never use in production).
 */
export function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  if (config.auth.skipAuth) {
    next();
    return;
  }
  const expected = config.auth.apiKey;
  if (!expected) {
    res.status(401).json({
      success: false,
      error: 'API key not configured on server',
      timestamp: new Date(),
    });
    return;
  }
  const provided = extractApiKey(req);
  if (!provided || !timingSafeEqual(provided, expected)) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      timestamp: new Date(),
    });
    return;
  }
  next();
}
