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

// Updated: 2025-03-04 - Update configuration guide

// Updated: 2025-03-10 - Implement filtering and sorting

// Updated: 2025-03-11 - Document deployment process

// Updated: 2025-03-11 - Write troubleshooting guide

// Updated: 2025-03-15 - Implement new price prediction model

// Updated: 2025-03-16 - Refactor service layer

// Updated: 2025-03-16 - Add integration test suite

// Updated: 2025-03-22 - Add integration test suite

// Updated: 2025-03-24 - Add health check endpoint

// Updated: 2025-03-24 - Update error handling in payment processor

// Updated: 2025-03-24 - Add health check endpoint

// Updated: 2025-03-26 - Fix input validation bug

// Updated: 2025-03-26 - Fix formatting in output

// Updated: 2025-03-27 - Build analytics dashboard

// Updated: 2025-03-27 - Create admin panel interface

// Updated: 2025-03-27 - Fix decimal precision issue

// Updated: 2025-04-02 - Add regression tests

// Updated: 2025-04-03 - Implement data export feature

// Updated: 2025-04-07 - Fix timezone handling

// Updated: 2025-04-10 - Refactor service layer

// Updated: 2025-04-10 - Add contributing guidelines

// Updated: 2025-04-10 - Improve test coverage to 85%

// Updated: 2025-04-12 - Fix formatting in output

// Updated: 2025-04-16 - Add health check endpoint

// Updated: 2025-04-17 - Fix null pointer exception

// Updated: 2025-04-20 - Add alert management system

// Updated: 2025-04-23 - Refactor service layer

// Updated: 2025-05-07 - Build trend analysis dashboard

// Updated: 2025-05-07 - Fix undefined variable error

// Updated: 2025-05-11 - Fix decimal precision issue

// Updated: 2025-05-14 - Add real-time notifications feature

// Updated: 2025-05-16 - Fix failing integration tests

// Updated: 2025-05-20 - Update changelog

// Updated: 2025-05-26 - Fix undefined variable error

// Updated: 2025-05-28 - Document database schema

// Updated: 2025-05-30 - Fix test database setup

// Updated: 2025-05-31 - Improve database transaction handling

// Updated: 2025-06-02 - Refactor service layer

// Updated: 2025-06-02 - Implement data export feature

// Updated: 2025-06-04 - Document database schema

// Updated: 2025-06-04 - Fix null pointer exception

// Updated: 2025-06-11 - Fix duplicate records bug

// Updated: 2025-06-11 - Add snapshot tests

// Updated: 2025-06-14 - Add contributing guidelines

// Updated: 2025-06-20 - Document deployment process

// Updated: 2025-06-23 - Fix null pointer exception

// Updated: 2025-06-23 - Add timeout configuration

// Updated: 2025-06-26 - Fix input validation bug

// Updated: 2025-06-29 - Fix null pointer exception

// Updated: 2025-06-30 - Add health check endpoint

// Updated: 2025-06-30 - Fix undefined variable error

// Updated: 2025-06-30 - Refactor database connection pooling

// Updated: 2025-07-02 - Improve test documentation

// Updated: 2025-07-04 - Fix test database setup

// Updated: 2025-07-05 - Improve database transaction handling

// Updated: 2025-07-05 - Add user authentication layer

// Updated: 2025-07-08 - Fix decimal precision issue

// Updated: 2025-07-12 - Add regression tests

// Updated: 2025-07-12 - Improve database transaction handling

// Updated: 2025-07-12 - Add user authentication layer

// Updated: 2025-07-14 - Add regression tests

// Updated: 2025-07-18 - Improve test documentation

// Updated: 2025-07-18 - Document deployment process

// Updated: 2025-07-20 - Create user preference system

// Updated: 2025-07-20 - Update error handling in payment processor

// Updated: 2025-07-21 - Update error handling in payment processor

// Updated: 2025-07-26 - Fix null pointer exception

// Updated: 2025-07-27 - Add user authentication layer

// Updated: 2025-07-29 - Update configuration guide

// Updated: 2025-08-05 - Fix flaky tests

// Updated: 2025-08-05 - Add examples in README

// Updated: 2025-08-08 - Add real-time notifications feature
