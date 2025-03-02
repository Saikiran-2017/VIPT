import { z } from 'zod';
import { Platform } from '@shared/types';

/** POST /api/v1/prices/record */
export const recordPriceBodySchema = z
  .object({
    productId: z.string().uuid(),
    platform: z.nativeEnum(Platform),
    price: z.number().finite().nonnegative(),
    shippingCost: z.number().finite().nonnegative().optional().default(0),
    discount: z.number().finite().optional(),
    inStock: z.boolean().optional().default(true),
    url: z.union([z.string().url(), z.literal('')]).optional().default(''),
    platformProductId: z.string().max(512).optional(),
    deliveryEstimate: z.string().max(512).optional(),
    currency: z.string().min(1).max(16).optional().default('USD'),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type RecordPriceBody = z.infer<typeof recordPriceBodySchema>;

/** POST /api/v1/predictions/feedback */
export const predictionFeedbackBodySchema = z
  .object({
    predictionOutcomeId: z.string().uuid().optional(),
    outcomeId: z.string().uuid().optional(),
    feedbackType: z.enum(['correct', 'incorrect', 'uncertain']),
    confidenceRating: z.number().finite().optional(),
    feedbackReason: z.string().max(4000).optional(),
  })
  .strict()
  .refine((d) => d.predictionOutcomeId != null || d.outcomeId != null, {
    message: 'Either predictionOutcomeId or outcomeId is required',
    path: ['predictionOutcomeId'],
  });

export type PredictionFeedbackBody = z.infer<typeof predictionFeedbackBodySchema>;

/** POST /api/v1/predictions/outcomes/:outcomeId/evaluate — params */
export const evaluateOutcomeParamsSchema = z.object({
  outcomeId: z.string().uuid(),
});

/** POST /api/v1/predictions/outcomes/:outcomeId/evaluate — body */
export const evaluateOutcomeBodySchema = z
  .object({
    accurateMapeThreshold: z.number().finite().nonnegative().optional(),
  })
  .strict();

/** POST /api/v1/predictions/outcomes/evaluate-pending */
export const evaluatePendingBodySchema = z
  .object({
    limit: z.number().int().positive().max(100_000).optional(),
    olderThanHours: z.number().finite().nonnegative().optional(),
    accurateMapeThreshold: z.number().finite().nonnegative().optional(),
  })
  .strict();
