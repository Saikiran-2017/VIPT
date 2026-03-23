/** VIPT 3.0 shared core types (camelCase). */

export enum Platform {
  AMAZON = 'amazon',
  FLIPKART = 'flipkart',
  WALMART = 'walmart',
  EBAY = 'ebay',
  BESTBUY = 'bestbuy',
  TARGET = 'target',
  NEWEGG = 'newegg',
  ALIEXPRESS = 'aliexpress',
}

export enum PriceQuality {
  ESTIMATED = 'estimated',
  CONFIRMED = 'confirmed',
  AGGREGATED = 'aggregated',
}

export enum ProductVolatility {
  STABLE = 'stable',
  MODERATE = 'moderate',
  HIGHLY_VOLATILE = 'highly_volatile',
}

export enum AlertType {
  TARGET_PRICE = 'target_price',
  SUDDEN_DROP = 'sudden_drop',
  PREDICTION_TRIGGER = 'prediction_trigger',
  EVENT_BASED = 'event_based',
}

export interface Money {
  amount: number;
  currency: string;
}

export interface PriceRange {
  low: number;
  high: number;
  currency?: string;
}

export interface Product {
  id: string;
  universalProductId: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  sku?: string;
  category?: string;
  imageUrl?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricePoint {
  id: string;
  productId: string;
  platform: Platform;
  price: number;
  currency: string;
  /** Data quality tier for this observation (maps to `price_history.quality`). */
  quality?: PriceQuality;
  /** Optional scrape confidence (0–1); used by DataValidator to flag low-confidence observations. */
  confidence?: number;
  discount?: number;
  inStock: boolean;
  recordedAt: Date;
}

/**
 * Named numeric features produced by FeatureEngineer (Phase 1).
 * `values` / `dimension` mirror this object in canonical key order for ML pipelines.
 */
export interface FeatureEngineeringFields {
  lag1: number;
  lag7: number;
  lag14: number;
  lag30: number;
  rollingMean7d: number;
  rollingMean30d: number;
  rollingStd7d: number;
  rollingStd30d: number;
  rsi14: number;
  macdSignal: number;
  dayOfWeek: number;
  dayOfMonth: number;
  month: number;
  daysToNearestEvent: number;
  nearestEventDiscount: number;
  /** Normalized price range over ~30 observations, typically in [0, 1]. */
  pricePct30dRange: number;
  crossPlatformSpread: number;
  googleTrendScore: number;
  reviewSentiment: number;
}

export interface FeatureVector {
  values: number[];
  dimension: number;
  sourceModel?: string;
  /** Populated by FeatureEngineer.buildFeatureVector when using structured features. */
  features?: FeatureEngineeringFields;
}

export interface ModelContribution {
  modelName: string;
  weight: number;
  score?: number;
}

export interface TrustMetrics {
  dataQualityScore: number;
  sourceReliability: number;
  lastVerifiedAt?: Date;
}

export enum PredictionModel {
  /** Deterministic rolling-mean baseline (no ML). */
  BASELINE = 'baseline',
  ARIMA = 'arima',
  PROPHET = 'prophet',
  LSTM = 'lstm',
  ENSEMBLE = 'ensemble',
}

export interface PredictionFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface PricePrediction {
  productId: string;
  currentPrice: number;
  expectedPriceRange: PriceRange;
  dropProbability: number;
  suggestedWaitDays: number;
  confidenceScore: number;
  modelUsed: PredictionModel;
  factors: PredictionFactor[];
  generatedAt: Date;
  /** Baseline next-step estimate (same currency as currentPrice). */
  predictedPrice?: number;
  /** Populated when ≥2 validated history points (FeatureEngineer). Omit in API unless `debug=1`. */
  featureVector?: FeatureVector;
  /** Set when a `prediction_outcomes` skeleton row is recorded (Prompt 8). */
  predictionOutcomeId?: string;
}

/**
 * Readiness / observability for baseline predictions (Prompt 7). Returned when API requests `includeEvaluation=1`.
 */
export interface PredictionEvaluationSummary {
  usableDataPoints: number;
  validatedCount: number;
  suspiciousOrOtherCount: number;
  validatedFraction: number;
  lastRecordedAt: string | null;
  freshnessHours: number | null;
  /** 0–1, higher = more recently updated history. */
  freshnessScore: number;
  /** 0–1, higher = more volatile recent prices (CV-based). */
  volatilityScore: number;
  /** Mean absolute error of 7-point rolling mean vs next actual (walk-forward), when enough points exist. */
  meanAbsoluteErrorBaseline: number | null;
  /** 0–1 composite readiness for prediction quality. */
  readinessScore: number;
}

export interface PredictionOutcome {
  id: string;
  productId: string;
  predictionId?: string;
  actualPrice: Money;
  predictedAt: Date;
  evaluatedAt: Date;
  wasAccurate: boolean;
  errorMargin?: number;
}
