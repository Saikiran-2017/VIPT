import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

/**
 * Requires `X-User-Id: <uuid>` for extension-scoped resources (e.g. price alerts).
 * Identity is not taken from JSON bodies or path params — only this header.
 */
export function requireExtensionUserId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const raw = req.headers['x-user-id'];
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  const parsed = uuidSchema.safeParse(candidate);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid X-User-Id header (UUID required)',
      timestamp: new Date(),
    });
    return;
  }
  req.extensionUserId = parsed.data;
  next();
}
