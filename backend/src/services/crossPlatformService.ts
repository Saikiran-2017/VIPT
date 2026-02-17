import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import { Platform } from '@shared/types';
import { PLATFORM_CONFIG } from '@shared/constants';

/**
 * Cross-Platform Price Intelligence Service
 * 
 * Generates search URLs and attempts to fetch prices from other platforms.
 * Uses a combination of:
 * 1. Direct search URL generation (always works)
 * 2. Lightweight HTML scraping (best-effort)
 * 3. Public price API endpoints (when available)
 */

interface CrossPlatformResult {
  platform: string;
  platformName: string;
  searchUrl: string;
  scrapedPrice?: number;
  scrapedProductName?: string;
  currency?: string;
  available: boolean;
  method: 'scraped' | 'search_link';
  confidence: number; // 0-1, how confident we are in the match
}

interface CrossPlatformComparison {
  productName: string;
  currentPlatform: string;
  currentPrice: number;
  results: CrossPlatformResult[];
  generatedAt: Date;
}

// Search URL templates for each platform
const SEARCH_URLS: Record<string, (query: string) => string> = {
  amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
  walmart: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  ebay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  bestbuy: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
  target: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  newegg: (q) => `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`,
  aliexpress: (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
};

// Platform display names
const PLATFORM_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  walmart: 'Walmart',
  ebay: 'eBay',
  bestbuy: 'Best Buy',
  target: 'Target',
  newegg: 'Newegg',
  aliexpress: 'AliExpress',
};

// Platform colors for UI
const PLATFORM_LOGOS: Record<string, string> = {
  amazon: '🟠',
  flipkart: '🔵',
  walmart: '🔵',
  ebay: '🔴',
  bestbuy: '🔵',
  target: '🔴',
  newegg: '🟠',
  aliexpress: '🔴',
};

export class CrossPlatformService {

  /**
   * Get cross-platform comparison for a product
   */
  async getCrossPlatformPrices(
    productId: string,
    productName: string,
    currentPlatform: string,
    currentPrice: number,
    brand?: string,
    modelNumber?: string
  ): Promise<CrossPlatformComparison> {
    const cacheKey = `cross-platform:${productId}`;
    const cached = await cacheGet<CrossPlatformComparison>(cacheKey);
    if (cached) return cached;

    // Build search query - use brand + model if available, else product name
    const searchQuery = this.buildSearchQuery(productName, brand, modelNumber);
    
    // All platforms except the current one
    const otherPlatforms = Object.keys(SEARCH_URLS).filter(p => p !== currentPlatform);

    // Attempt to get prices from each platform
    const results: CrossPlatformResult[] = await Promise.all(
      otherPlatforms.map(platform => this.checkPlatform(platform, searchQuery, productName, currentPrice))
    );

    const comparison: CrossPlatformComparison = {
      productName,
      currentPlatform,
      currentPrice,
      results: results.sort((a, b) => {
        // Sort: scraped prices first (lowest), then search links
        if (a.scrapedPrice && b.scrapedPrice) return a.scrapedPrice - b.scrapedPrice;
        if (a.scrapedPrice) return -1;
        if (b.scrapedPrice) return 1;
        return 0;
      }),
      generatedAt: new Date(),
    };

    // Cache for 30 minutes
    await cacheSet(cacheKey, comparison, 1800);
    return comparison;
  }

  /**
   * Build an optimized search query from product info
   */
  private buildSearchQuery(name: string, brand?: string, modelNumber?: string): string {
    // If we have brand + model, that's the best search query
    if (brand && modelNumber) {
      return `${brand} ${modelNumber}`.trim();
    }

    // Clean up the product name for better search results
    let query = name
      // Remove common filler words that hurt search
      .replace(/\b(with|and|for|the|a|an|in|on|to|by|of)\b/gi, ' ')
      // Remove special chars except hyphens
      .replace(/[™®©]/g, '')
      // Remove size/quantity descriptors at the end
      .replace(/[-–]\s*\d+\s*(ct|pk|oz|ml|lb|kg|count|pack)\b.*/i, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to first ~60 chars at word boundary for better search
    if (query.length > 60) {
      query = query.substring(0, 60).replace(/\s+\S*$/, '');
    }

    return query;
  }

  /**
   * Check a single platform for the product
   */
  private async checkPlatform(
    platform: string,
    searchQuery: string,
    originalProductName: string,
    currentPrice: number
  ): Promise<CrossPlatformResult> {
    const searchUrl = SEARCH_URLS[platform](searchQuery);
    const platformName = PLATFORM_NAMES[platform] || platform;

    const result: CrossPlatformResult = {
      platform,
      platformName,
      searchUrl,
      available: true,
      method: 'search_link',
      confidence: 0,
    };

    // Attempt lightweight scraping (best effort, with short timeout)
    try {
      const scraped = await this.scrapeSearchResults(platform, searchUrl, originalProductName, currentPrice);
      if (scraped) {
        result.scrapedPrice = scraped.price;
        result.scrapedProductName = scraped.name;
        result.currency = scraped.currency || 'USD';
        result.method = 'scraped';
        result.confidence = scraped.confidence;
      }
    } catch (error) {
      // Scraping failed - that's fine, we have the search link
      logger.debug(`Scrape failed for ${platform}: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Attempt to scrape search results from a platform
   * Uses axios + cheerio with a short timeout - best effort only
   */
  private async scrapeSearchResults(
    platform: string,
    searchUrl: string,
    productName: string,
    referencePrice: number
  ): Promise<{ price: number; name: string; currency?: string; confidence: number } | null> {
    try {
      const response = await axios.get(searchUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 3,
      });

      if (response.status !== 200) return null;

      const $ = cheerio.load(response.data);
      return this.extractFirstResult(platform, $, productName, referencePrice);
    } catch {
      return null;
    }
  }

  /**
   * Extract first matching product from search results HTML
   */
  private extractFirstResult(
    platform: string,
    $: ReturnType<typeof cheerio.load>,
    productName: string,
    referencePrice: number
  ): { price: number; name: string; currency?: string; confidence: number } | null {
    const extractors: Record<string, () => { price: number; name: string; confidence: number } | null> = {
      walmart: () => {
        const items = $('[data-item-id]').first();
        const priceText = items.find('[data-automation-id="product-price"] .f2').text() ||
                          items.find('.sans-serif.lh-title').first().text();
        const nameText = items.find('[data-automation-id="product-title"]').text() ||
                         items.find('span.w_iUH7').text();
        return this.parseResult(priceText, nameText, productName, referencePrice);
      },
      target: () => {
        const item = $('[data-test="@web/site-top-of-funnel/ProductCardWrapper"]').first();
        const priceText = item.find('[data-test="current-price"]').text();
        const nameText = item.find('a[data-test="product-title"]').text();
        return this.parseResult(priceText, nameText, productName, referencePrice);
      },
      ebay: () => {
        const item = $('.s-item').first();
        const priceText = item.find('.s-item__price').text();
        const nameText = item.find('.s-item__title').text();
        return this.parseResult(priceText, nameText, productName, referencePrice);
      },
      bestbuy: () => {
        const item = $('.sku-item').first();
        const priceText = item.find('.priceView-customer-price span').first().text();
        const nameText = item.find('.sku-title a').text();
        return this.parseResult(priceText, nameText, productName, referencePrice);
      },
    };

    const extractor = extractors[platform];
    if (extractor) {
      try {
        return extractor();
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Parse price and name from scraped text and calculate confidence
   */
  private parseResult(
    priceText: string,
    nameText: string,
    originalName: string,
    referencePrice: number
  ): { price: number; name: string; confidence: number } | null {
    if (!priceText || !nameText) return null;

    // Extract price number
    const priceMatch = priceText.match(/[\$£€₹]?\s*([\d,]+\.?\d*)/);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (isNaN(price) || price <= 0) return null;

    // Sanity check: price shouldn't be wildly different (10x or 0.01x)
    if (price > referencePrice * 10 || price < referencePrice * 0.01) return null;

    // Calculate name similarity confidence
    const confidence = this.calculateNameSimilarity(nameText.trim(), originalName);
    if (confidence < 0.2) return null;

    return { price, name: nameText.trim().substring(0, 100), confidence };
  }

  /**
   * Simple name similarity (word overlap ratio)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const words1 = new Set(name1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(name2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let overlap = 0;
    words1.forEach(w => { if (words2.has(w)) overlap++; });

    return overlap / Math.max(words1.size, words2.size);
  }
}

export const crossPlatformService = new CrossPlatformService();
