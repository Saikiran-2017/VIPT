import type {
  AlertType,
  Platform,
  PricePrediction,
  ProductVolatility,
} from '../src/index';

export * from '../src/index';

// ─── Core Product Types (legacy / API) ───────────────────────────

export interface ProductDetection {
  name: string;
  brand?: string;
  modelNumber?: string;
  sku?: string;
  currentPrice: number;
  currency: string;
  platform: Platform;
  url: string;
  imageUrl?: string;
}

// ─── Platform Types ───────────────────────────────────────────────

export interface PlatformListing {
  id: string;
  productId: string;
  platform: Platform;
  platformProductId: string;
  url: string;
  currentPrice: number;
  shippingCost: number;
  totalEffectivePrice: number;
  currency: string;
  discountPercent?: number;
  deliveryEstimate?: string;
  inStock: boolean;
  lastUpdated: Date;
}

// ─── Price History Types ──────────────────────────────────────────

export interface PriceHistoryEntry {
  id: string;
  productId: string;
  platform: Platform;
  price: number;
  currency: string;
  discount?: number;
  inStock: boolean;
  timestamp: Date;
}

export interface PriceHistoryStats {
  allTimeLow: number;
  allTimeHigh: number;
  averagePrice: number;
  volatilityIndex: ProductVolatility;
  standardDeviation: number;
  changeFrequency: number;
  priceHistory: PriceHistoryEntry[];
}

// ─── Price Comparison Types ───────────────────────────────────────

export interface PriceComparison {
  productId: string;
  productName: string;
  listings: PlatformListing[];
  lowestPrice: PlatformListing;
  recommendation: Recommendation;
  antiManipulation: AntiManipulationResult;
  lastUpdated: Date;
}

// ─── Recommendation Types ─────────────────────────────────────────

export enum RecommendationAction {
  BUY_NOW = 'buy_now',
  WAIT = 'wait',
  TRACK = 'track',
}

export interface Recommendation {
  action: RecommendationAction;
  confidence: number;
  reasoning: string[];
  prediction?: PricePrediction;
  nearestEvent?: RetailEvent;
}

// ─── Event Types ──────────────────────────────────────────────────

export interface RetailEvent {
  id: string;
  name: string;
  platform?: Platform;
  startDate: Date;
  endDate: Date;
  region: string;
  expectedDiscountRange: {
    min: number;
    max: number;
  };
  categories: string[];
  isActive: boolean;
}

// ─── Anti-Manipulation Types ──────────────────────────────────────

export interface AntiManipulationResult {
  isGenuineDiscount: boolean;
  confidence: number;
  flags: ManipulationFlag[];
  movingAverage30d: number;
  priceBeforeDiscount: number;
}

export enum ManipulationFlag {
  PRICE_SPIKE_BEFORE_SALE = 'price_spike_before_sale',
  ARTIFICIAL_DISCOUNT = 'artificial_discount',
  FREQUENT_PRICE_CHANGES = 'frequent_price_changes',
  NEVER_SOLD_AT_MRP = 'never_sold_at_mrp',
}

// ─── Alert Types ──────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  userId: string;
  productId: string;
  type: AlertType;
  targetPrice?: number;
  isActive: boolean;
  createdAt: Date;
  triggeredAt?: Date;
}

export interface AlertNotification {
  alertId: string;
  productId: string;
  productName: string;
  message: string;
  currentPrice: number;
  previousPrice?: number;
  platform: Platform;
  timestamp: Date;
}

// ─── User Types ───────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  tier: UserTier;
  trackedProducts: string[];
  alerts: PriceAlert[];
  createdAt: Date;
}

export enum UserTier {
  FREE = 'free',
  PREMIUM = 'premium',
}

// ─── API Response Types ───────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  freshness?: DataFreshness;
}

export interface DataFreshness {
  lastUpdated: Date;
  isStale: boolean;
  nextRefreshAt: Date;
  confidencePercent: number;
}

// ─── Extension Message Types ──────────────────────────────────────

export enum ExtensionMessageType {
  PRODUCT_DETECTED = 'product_detected',
  GET_COMPARISON = 'get_comparison',
  GET_HISTORY = 'get_history',
  GET_PREDICTION = 'get_prediction',
  SET_ALERT = 'set_alert',
  GET_ALERTS = 'get_alerts',
}

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload: unknown;
}
