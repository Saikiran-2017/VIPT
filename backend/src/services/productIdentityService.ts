import { query } from '../models/database';
import { cacheGet, cacheSet } from '../models/cache';
import { logger } from '../utils/logger';
import { Product, ProductDetection, Platform } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';
import stringSimilarity from 'string-similarity';
import { MATCHING_CONFIG } from '@shared/constants';

/**
 * Product Identity Service
 * 
 * Normalizes products across platforms by:
 * 1. Model number extraction & exact matching
 * 2. Title normalization
 * 3. Fuzzy string matching
 * 4. Generates Universal Product ID
 */
export class ProductIdentityService {

  /**
   * Find or create a canonical product from a detection
   */
  async resolveProduct(detection: ProductDetection): Promise<Product> {
    const cacheKey = `product:resolve:${this.generateDetectionHash(detection)}`;
    const cached = await cacheGet<Product>(cacheKey);
    if (cached) return cached;

    // Strategy 0: Universal Product ID match
    const upid = this.generateUniversalProductId(detection);
    const existingByUpid = await this.findByUniversalProductId(upid);
    if (existingByUpid) {
      logger.info(`Product matched by UPID: ${upid}`);
      await cacheSet(cacheKey, existingByUpid, 3600);
      return existingByUpid;
    }

    // Strategy 1: Exact model number match
    const modelNumber = detection.modelNumber || this.extractModelNumber(detection.name);
    if (modelNumber) {
      const existing = await this.findByModelNumber(modelNumber);
      if (existing) {
        logger.info(`Product matched by model number: ${modelNumber}`);
        await cacheSet(cacheKey, existing, 3600);
        return existing;
      }
    }

    // Strategy 2: SKU match on same platform (only if SKU is provided and reliable)
    if (detection.sku && detection.sku.length >= MATCHING_CONFIG.MIN_SKU_LENGTH) {
      const existing = await this.findBySku(detection.sku);
      if (existing) {
        logger.info(`Product matched by SKU: ${detection.sku}`);
        await cacheSet(cacheKey, existing, 3600);
        return existing;
      }
    }

    // Strategy 3: Fuzzy title match
    const normalizedName = this.normalizeTitle(detection.name);
    const fuzzyMatch = await this.findByFuzzyTitle(normalizedName, detection.brand);
    if (fuzzyMatch) {
      logger.info(`Product matched by fuzzy title: ${normalizedName}`);
      await cacheSet(cacheKey, fuzzyMatch, 3600);
      return fuzzyMatch;
    }

    // Strategy 4: Create new product
    const product = await this.createProduct(detection);
    logger.info(`New product created: ${product.universalProductId}`);
    await cacheSet(cacheKey, product, 3600);
    return product;
  }

  /**
   * Generate a Universal Product ID from product attributes
   */
  generateUniversalProductId(detection: ProductDetection): string {
    const parts: string[] = [];

    if (detection.brand) {
      parts.push(detection.brand.toUpperCase().replace(/\s+/g, '-'));
    }

    if (detection.modelNumber) {
      parts.push(detection.modelNumber.toUpperCase().replace(/\s+/g, '-'));
    } else {
      // Generate from normalized title
      const normalized = this.normalizeTitle(detection.name);
      const words = normalized.split(' ').slice(0, 5);
      parts.push(words.join('-').toUpperCase());
    }

    return parts.join('_') || `GENERIC_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Normalize product title for matching
   */
  normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      // Remove common promotional phrases
      .replace(/\b(free shipping|in stock|buy now|on sale|discount|limited time)\b/g, '')
      // Remove common technical jargon that varies by platform but doesn't identify the core product
      .replace(/\b(newest|latest|version|model|authentic|original|genuine|best price|lowest price)\b/g, '')
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .replace(/\b(the|a|an|and|or|for|with|in|on|at|to|of)\b/g, '') // Remove stop words
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract model number from product title
   */
  extractModelNumber(title: string): string | undefined {
    // Common patterns: XX-1234, ABC1234, XX1234-AB, MLPF3HN/A, A1234, 123456789 (ISBN/UPC)
    const patterns = [
      /\b([A-Z]{2,}-?\d+[A-Z0-9]*(-[A-Z0-9]+)*(\/[A-Z0-9]+)?)\b/i,
      /\b([A-Z]+\d+[A-Z0-9]*(-[A-Z0-9]+)*(\/[A-Z0-9]+)?)\b/i,
      /\b(model\s*#?\s*:?\s*)([\w-]+)\b/i,
      /\b([A-Z0-9]{8,13})\b/i, // ISBN-10, ISBN-13, or long SKU
      /\b([A-Z]\d{4})\b/i,      // Apple style model numbers (e.g. A2172)
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return (match[2] || match[1]).toUpperCase().trim();
      }
    }

    return undefined;
  }

  // ─── Private Methods ──────────────────────────────────────────

  private async findByUniversalProductId(upid: string): Promise<Product | null> {
    const result = await query(
      'SELECT * FROM products WHERE universal_product_id = $1 LIMIT 1',
      [upid]
    );
    return result.rows[0] ? this.mapRowToProduct(result.rows[0]) : null;
  }

  private async findByModelNumber(modelNumber: string): Promise<Product | null> {
    // Escape special chars for ILIKE to prevent injection
    const escaped = modelNumber.replace(/[%_]/g, '\\$&');
    const result = await query(
      `SELECT *, similarity(model_number, $1) as sim
       FROM products
       WHERE model_number = $1
          OR (model_number ILIKE $2 AND length(model_number) <= length($1) + 3)
       ORDER BY sim DESC LIMIT 1`,
      [modelNumber.toUpperCase(), `%${escaped}%`]
    );
    return result.rows[0] ? this.mapRowToProduct(result.rows[0]) : null;
  }

  private async findBySku(sku: string): Promise<Product | null> {
    const result = await query(
      'SELECT * FROM products WHERE sku = $1 LIMIT 1',
      [sku]
    );
    return result.rows[0] ? this.mapRowToProduct(result.rows[0]) : null;
  }

  private async findByFuzzyTitle(
    normalizedName: string,
    brand?: string
  ): Promise<Product | null> {
    // Use PostgreSQL trigram similarity
    let sql = `
      SELECT *, similarity(name, $1) AS sim
      FROM products
      WHERE similarity(name, $1) > ${MATCHING_CONFIG.FUZZY_THRESHOLD}
    `;
    const params: unknown[] = [normalizedName];

    if (brand) {
      const escapedBrand = brand.replace(/[%_]/g, '\\$&');
      sql += ' AND brand ILIKE $2';
      params.push(`%${escapedBrand}%`);
    }

    sql += ' ORDER BY sim DESC LIMIT 5';

    const result = await query(sql, params);

    if (result.rows.length === 0) return null;

    // Additional string-similarity check
    const bestMatch = stringSimilarity.findBestMatch(
      normalizedName,
      result.rows.map((r: { name: string }) => r.name.toLowerCase())
    );

    if (bestMatch.bestMatch.rating > MATCHING_CONFIG.SIMILARITY_THRESHOLD) {
      return this.mapRowToProduct(result.rows[bestMatch.bestMatchIndex]);
    }

    return null;
  }

  private async createProduct(detection: ProductDetection): Promise<Product> {
    const id = uuidv4();
    const universalProductId = this.generateUniversalProductId(detection);
    const modelNumber = detection.modelNumber || this.extractModelNumber(detection.name);

    // Use ON CONFLICT to handle race conditions where the same product is detected twice simultaneously
    const result = await query(
      `INSERT INTO products (id, universal_product_id, name, brand, model_number, sku, image_url, name_embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector('english', $8))
       ON CONFLICT (universal_product_id) DO UPDATE SET
         updated_at = NOW(),
         image_url = COALESCE(products.image_url, EXCLUDED.image_url),
         brand = COALESCE(products.brand, EXCLUDED.brand),
         model_number = COALESCE(products.model_number, EXCLUDED.model_number)
       RETURNING *`,
      [id, universalProductId, detection.name, detection.brand || null, modelNumber || null, detection.sku || null, detection.imageUrl || null, detection.name]
    );

    return this.mapRowToProduct(result.rows[0]);
  }

  private mapRowToProduct(row: Record<string, unknown>): Product {
    return {
      id: row.id as string,
      universalProductId: row.universal_product_id as string,
      name: row.name as string,
      brand: row.brand as string,
      modelNumber: row.model_number as string | undefined,
      sku: row.sku as string | undefined,
      category: row.category as string | undefined,
      imageUrl: row.image_url as string | undefined,
      description: row.description as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private generateDetectionHash(detection: ProductDetection): string {
    const key = `${detection.platform}:${detection.modelNumber || ''}:${detection.sku || ''}:${detection.name.substring(0, 50)}`;
    return Buffer.from(key).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }
}

export const productIdentityService = new ProductIdentityService();
