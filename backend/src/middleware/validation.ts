import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiResponse } from '@shared/types';

/**
 * Validation middleware using Zod schemas
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[source] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          timestamp: new Date(),
        };
        res.status(400).json(response);
        return;
      }
      next(error);
    }
  };
}
