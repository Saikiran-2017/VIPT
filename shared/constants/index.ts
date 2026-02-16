import { Platform } from '../types';

// ─── Retail Events Calendar ───────────────────────────────────────

export const RETAIL_EVENTS = [
  {
    name: 'New Year Sale',
    platforms: [Platform.AMAZON, Platform.FLIPKART, Platform.WALMART],
    monthStart: 1,
    dayStart: 1,
    monthEnd: 1,
    dayEnd: 7,
    region: 'global',
    expectedDiscountRange: { min: 10, max: 40 },
    categories: ['electronics', 'fashion', 'home'],
  },
  {
    name: 'Republic Day Sale',
    platforms: [Platform.AMAZON, Platform.FLIPKART],
    monthStart: 1,
    dayStart: 20,
    monthEnd: 1,
    dayEnd: 26,
    region: 'IN',
    expectedDiscountRange: { min: 20, max: 60 },
    categories: ['electronics', 'fashion', 'home', 'mobile'],
  },
  {
    name: 'Valentine\'s Day Sale',
    platforms: [Platform.AMAZON, Platform.WALMART, Platform.TARGET],
    monthStart: 2,
    dayStart: 7,
    monthEnd: 2,
    dayEnd: 14,
    region: 'global',
    expectedDiscountRange: { min: 10, max: 30 },
    categories: ['fashion', 'gifts', 'beauty'],
  },
  {
    name: 'Spring Sale',
    platforms: [Platform.AMAZON, Platform.WALMART, Platform.BESTBUY],
    monthStart: 3,
    dayStart: 15,
    monthEnd: 3,
    dayEnd: 31,
    region: 'US',
    expectedDiscountRange: { min: 15, max: 40 },
    categories: ['home', 'garden', 'fashion'],
  },
  {
    name: 'Amazon Prime Day',
    platforms: [Platform.AMAZON],
    monthStart: 7,
    dayStart: 11,
    monthEnd: 7,
    dayEnd: 12,
    region: 'global',
    expectedDiscountRange: { min: 20, max: 60 },
    categories: ['electronics', 'fashion', 'home', 'books'],
  },
  {
    name: 'Flipkart Big Billion Days',
    platforms: [Platform.FLIPKART],
    monthStart: 10,
    dayStart: 1,
    monthEnd: 10,
    dayEnd: 7,
    region: 'IN',
    expectedDiscountRange: { min: 30, max: 80 },
    categories: ['electronics', 'fashion', 'home', 'mobile'],
  },
  {
    name: 'Amazon Great Indian Festival',
    platforms: [Platform.AMAZON],
    monthStart: 10,
    dayStart: 1,
    monthEnd: 10,
    dayEnd: 7,
    region: 'IN',
    expectedDiscountRange: { min: 30, max: 70 },
    categories: ['electronics', 'fashion', 'home', 'mobile'],
  },
  {
    name: 'Black Friday',
    platforms: [Platform.AMAZON, Platform.WALMART, Platform.BESTBUY, Platform.TARGET, Platform.EBAY, Platform.NEWEGG],
    monthStart: 11,
    dayStart: 25,
    monthEnd: 11,
    dayEnd: 29,
    region: 'global',
    expectedDiscountRange: { min: 20, max: 70 },
    categories: ['electronics', 'fashion', 'home', 'gaming'],
  },
  {
    name: 'Cyber Monday',
    platforms: [Platform.AMAZON, Platform.WALMART, Platform.BESTBUY, Platform.NEWEGG],
    monthStart: 12,
    dayStart: 1,
    monthEnd: 12,
    dayEnd: 2,
    region: 'global',
    expectedDiscountRange: { min: 20, max: 65 },
    categories: ['electronics', 'software', 'gaming'],
  },
  {
    name: 'Christmas Sale',
    platforms: [Platform.AMAZON, Platform.WALMART, Platform.TARGET, Platform.BESTBUY],
    monthStart: 12,
    dayStart: 18,
    monthEnd: 12,
    dayEnd: 25,
    region: 'global',
    expectedDiscountRange: { min: 15, max: 50 },
    categories: ['electronics', 'toys', 'fashion', 'gifts'],
  },
];

// ─── Supported Platforms Config ───────────────────────────────────

export const PLATFORM_CONFIG: Record<Platform, { name: string; baseUrl: string; productPattern: RegExp }> = {
  [Platform.AMAZON]: {
    name: 'Amazon',
    baseUrl: 'https://www.amazon.com',
    productPattern: /amazon\.(com|in|co\.uk|de|fr|es|it|ca|com\.au)\/.*\/dp\/([A-Z0-9]{10})/,
  },
  [Platform.FLIPKART]: {
    name: 'Flipkart',
    baseUrl: 'https://www.flipkart.com',
    productPattern: /flipkart\.com\/.*\/p\/(itm[a-zA-Z0-9]+)/,
  },
  [Platform.WALMART]: {
    name: 'Walmart',
    baseUrl: 'https://www.walmart.com',
    productPattern: /walmart\.com\/ip\/.*\/(\d+)/,
  },
  [Platform.EBAY]: {
    name: 'eBay',
    baseUrl: 'https://www.ebay.com',
    productPattern: /ebay\.com\/itm\/.*\/(\d+)/,
  },
  [Platform.BESTBUY]: {
    name: 'Best Buy',
    baseUrl: 'https://www.bestbuy.com',
    productPattern: /bestbuy\.com\/site\/.*\/(\d+)\.p/,
  },
  [Platform.TARGET]: {
    name: 'Target',
    baseUrl: 'https://www.target.com',
    productPattern: /target\.com\/p\/.*\/-\/A-(\d+)/,
  },
  [Platform.NEWEGG]: {
    name: 'Newegg',
    baseUrl: 'https://www.newegg.com',
    productPattern: /newegg\.com\/.*\/p\/([\w-]+)/,
  },
  [Platform.ALIEXPRESS]: {
    name: 'AliExpress',
    baseUrl: 'https://www.aliexpress.com',
    productPattern: /aliexpress\.com\/item\/(\d+)\.html/,
  },
};

// ─── API Configuration ───────────────────────────────────────────

export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  VERSION: 'v1',
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },
  CACHE_TTL: {
    PRICE_COMPARISON: 5 * 60, // 5 minutes
    PRICE_HISTORY: 30 * 60, // 30 minutes
    PREDICTION: 60 * 60, // 1 hour
    EVENTS: 24 * 60 * 60, // 24 hours
  },
};

// ─── Prediction Configuration ─────────────────────────────────────

export const PREDICTION_CONFIG = {
  MIN_DATA_POINTS: 14,
  CONFIDENCE_THRESHOLD: 0.6,
  MAX_PREDICTION_DAYS: 90,
  VOLATILITY_THRESHOLDS: {
    STABLE: 0.05,
    MODERATE: 0.15,
  },
};

// ─── Anti-Manipulation Configuration ──────────────────────────────

export const ANTI_MANIPULATION_CONFIG = {
  MOVING_AVERAGE_DAYS: 30,
  SPIKE_THRESHOLD: 1.2, // 20% above moving average
  MIN_HISTORY_DAYS: 7,
  SUSPICIOUS_DISCOUNT_THRESHOLD: 50, // 50% discount is suspicious if price was raised
};
