/**
 * VIPT (Vayu Intelligence Price Tracker) - Content Script
 * 
 * Automatically detects product information on supported shopping platforms.
 * Extracts: name, brand, model number, SKU, price, currency.
 */

interface DetectedProduct {
  name: string;
  brand?: string;
  modelNumber?: string;
  sku?: string;
  currentPrice: number;
  currency: string;
  platform: string;
  url: string;
  imageUrl?: string;
}

// ─── Platform Detection ────────────────────────────────────────

function detectPlatform(): string | null {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return 'amazon';
  if (hostname.includes('flipkart')) return 'flipkart';
  if (hostname.includes('walmart')) return 'walmart';
  if (hostname.includes('ebay')) return 'ebay';
  if (hostname.includes('bestbuy')) return 'bestbuy';
  if (hostname.includes('target')) return 'target';
  if (hostname.includes('newegg')) return 'newegg';
  if (hostname.includes('aliexpress')) return 'aliexpress';
  return null;
}

// ─── Price Extraction ──────────────────────────────────────────

function extractPrice(text: string): { price: number; currency: string } | null {
  // Patterns: $99.99, ₹1,299, €49.95, £39.99
  const patterns = [
    /[\$]\s*([\d,]+\.?\d*)/,
    /[₹]\s*([\d,]+\.?\d*)/,
    /[€]\s*([\d,]+\.?\d*)/,
    /[£]\s*([\d,]+\.?\d*)/,
    /([\d,]+\.?\d*)\s*(?:USD|INR|EUR|GBP)/i,
  ];

  const currencyMap: Record<string, string> = {
    '$': 'USD', '₹': 'INR', '€': 'EUR', '£': 'GBP',
  };

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        const currencySymbol = text.match(/[\$₹€£]/)?.[0] || '$';
        return {
          price,
          currency: currencyMap[currencySymbol] || 'USD',
        };
      }
    }
  }

  return null;
}

// ─── Helper: Safe Query Selector ───────────────────────────────

function safeText(selector: string): string | null {
  const el = document.querySelector(selector);
  return el?.textContent?.trim() || null;
}

function safeAttr(selector: string, attr: string): string | null {
  const el = document.querySelector(selector);
  return el?.getAttribute(attr) || null;
}

// ─── Amazon Extractor ─────────────────────────────────────────

function extractAmazon(): DetectedProduct | null {
  const name = safeText('#productTitle') || safeText('#title') || safeText('h1 span.a-text-normal');
  if (!name) return null;

  let currentPrice = 0;
  let currency = 'USD';

  // Strategy 1: Use .a-offscreen price (most reliable, Amazon uses this for screen readers)
  const offscreenPrices = document.querySelectorAll('.a-price .a-offscreen');
  for (const el of offscreenPrices) {
    const text = el.textContent?.trim();
    if (text) {
      const priceData = extractPrice(text);
      if (priceData && priceData.price > 0) {
        currentPrice = priceData.price;
        currency = priceData.currency;
        break;
      }
    }
  }

  // Strategy 2: Compose from whole + fraction parts
  if (currentPrice === 0) {
    const priceWhole = safeText('.a-price .a-price-whole');
    const priceFraction = safeText('.a-price .a-price-fraction');

    if (priceWhole) {
      const priceStr = `${priceWhole.replace(/[,.\s]/g, '')}.${priceFraction || '00'}`;
      currentPrice = parseFloat(priceStr);
      const priceSymbol = safeText('.a-price .a-price-symbol');
      if (priceSymbol === '₹') currency = 'INR';
      else if (priceSymbol === '€') currency = 'EUR';
      else if (priceSymbol === '£') currency = 'GBP';
    }
  }

  // Strategy 3: Try other common price selectors
  if (currentPrice === 0) {
    const priceSelectors = [
      '#priceblock_ourprice', '#priceblock_dealprice',
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.priceToPay .a-offscreen',
      '#price_inside_buybox', '#newBuyBoxPrice',
      'span.a-color-price',
      '.a-price.a-text-price .a-offscreen',
    ];
    for (const sel of priceSelectors) {
      const text = safeText(sel);
      if (text) {
        const priceData = extractPrice(text);
        if (priceData && priceData.price > 0) {
          currentPrice = priceData.price;
          currency = priceData.currency;
          break;
        }
      }
    }
  }

  const brand = safeText('#bylineInfo') 
    || safeText('#brand')
    || safeAttr('#bylineInfo', 'textContent')
    || undefined;

  const imageUrl = safeAttr('#landingImage', 'src') 
    || safeAttr('#imgBlkFront', 'src') 
    || safeAttr('#main-image', 'src')
    || safeAttr('#imgTagWrapperId img', 'src')
    || safeAttr('.imgTagWrapper img', 'src')
    || undefined;

  // Try to extract model number from detail table
  let modelNumber: string | undefined;
  document.querySelectorAll('#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li, #prodDetails tr').forEach(el => {
    const text = el.textContent || '';
    if (/model\s*(number|name)/i.test(text)) {
      const value = text.split(/:\s*/)[1]?.trim();
      if (value) modelNumber = value;
    }
  });

  // ASIN as SKU
  const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  const sku = asinMatch?.[1];

  return {
    name,
    brand: brand?.replace(/^(Brand|Visit the |Store)\s*/i, '').trim(),
    modelNumber,
    sku,
    currentPrice,
    currency,
    platform: 'amazon',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Flipkart Extractor ──────────────────────────────────────

function extractFlipkart(): DetectedProduct | null {
  const name = safeText('span.VU-ZEz')
    || safeText('h1.yhB1nd')
    || safeText('span.B_NuCI')
    || safeText('h1._9E25nV');
  if (!name) return null;

  const priceText = safeText('div.Nx9bqj.CxhGGd')
    || safeText('div._30jeq3._16Jk6d')
    || safeText('div._30jeq3')
    || safeText('div.Nx9bqj');
  const priceData = priceText ? extractPrice(priceText) : null;

  const brand = safeText('span.mEh187')
    || safeText('span._2WkVRV')
    || undefined;
  const imageUrl = safeAttr('img._396cs4', 'src')
    || safeAttr('img._2r_T1I', 'src')
    || safeAttr('img.DByuf4', 'src')
    || safeAttr('img._1Nyybr', 'src')
    || undefined;

  // Extract Flipkart product ID from URL
  const skuMatch = window.location.pathname.match(/\/p\/(itm[a-z0-9]+)/i)
    || window.location.search.match(/pid=([^&]+)/);
  const sku = skuMatch?.[1];

  return {
    name,
    brand,
    sku,
    currentPrice: priceData?.price || 0,
    currency: priceData?.currency || 'INR',
    platform: 'flipkart',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Walmart Extractor ───────────────────────────────────────

function extractWalmart(): DetectedProduct | null {
  // Multiple name selectors for different Walmart page layouts
  const name = safeText('[data-testid="product-title"]')
    || safeText('h1[itemprop="name"]')
    || safeText('h1.prod-ProductTitle')
    || safeText('h1.lh-copy')
    || safeText('[itemprop="name"]')
    || safeText('h1');
  if (!name) return null;

  let currentPrice = 0;
  let currency = 'USD';

  // Strategy 1: itemprop price (structured data)
  const itemPropPrice = safeAttr('[itemprop="price"]', 'content');
  if (itemPropPrice) {
    const p = parseFloat(itemPropPrice);
    if (!isNaN(p) && p > 0) currentPrice = p;
  }

  // Strategy 2: Various price selectors
  if (currentPrice === 0) {
    const priceSelectors = [
      '[data-testid="price-wrap"] [itemprop="price"]',
      'span[itemprop="price"]',
      '[data-automation="buybox-price"]',
      'span.price-group',
      'span.price-characteristic',
      '.price-main .visuallyhidden',
      '[data-testid="price"]',
      '.b_title .w_VaGa',
    ];
    for (const sel of priceSelectors) {
      const text = safeText(sel);
      if (text) {
        const priceData = extractPrice(text);
        if (priceData && priceData.price > 0) {
          currentPrice = priceData.price;
          currency = priceData.currency;
          break;
        }
      }
    }
  }

  // Strategy 3: Compose from whole + superscript parts
  if (currentPrice === 0) {
    const whole = safeText('span.price-characteristic');
    const fraction = safeText('span.price-mantissa');
    if (whole) {
      const priceStr = `${whole.replace(/[,\s]/g, '')}.${fraction || '00'}`;
      const p = parseFloat(priceStr);
      if (!isNaN(p) && p > 0) currentPrice = p;
    }
  }

  const brand = safeText('[itemprop="brand"]')
    || safeText('[data-testid="product-brand"]')
    || safeAttr('a.prod-brandName', 'textContent')
    || undefined;

  const imageUrl = safeAttr('[data-testid="hero-image-container"] img', 'src')
    || safeAttr('[data-testid="hero-image"] img', 'src')
    || safeAttr('.prod-HeroImage img', 'src')
    || safeAttr('.hover-zoom-hero-image img', 'src')
    || undefined;

  // Extract Walmart item ID from URL
  const skuMatch = window.location.pathname.match(/\/ip\/[^/]+\/?(\d+)/) 
    || window.location.pathname.match(/\/(\d+)$/);
  const sku = skuMatch?.[1];

  return {
    name,
    brand,
    sku,
    currentPrice,
    currency,
    platform: 'walmart',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── eBay Extractor ──────────────────────────────────────────

function extractEbay(): DetectedProduct | null {
  const name = safeText('h1.x-item-title__mainTitle span')
    || safeText('div.x-item-title span')
    || safeText('#itemTitle')
    || safeText('h1.product-title');
  if (!name) return null;

  const priceText = safeText('.x-price-primary span')
    || safeText('.x-bin-price__content span.ux-textspans')
    || safeText('#prcIsum')
    || safeText('.display-price');
  const priceData = priceText ? extractPrice(priceText) : null;

  const brand = safeText('.x-item-condition-text .ux-textspans') || undefined;
  const imageUrl = safeAttr('.ux-image-carousel-item img', 'src')
    || safeAttr('#icImg', 'src')
    || safeAttr('.ux-image-magnify__container img', 'src')
    || undefined;

  // Extract eBay item ID from URL
  const skuMatch = window.location.pathname.match(/\/itm\/(\d+)/)
    || window.location.pathname.match(/\/(\d+)\??/);
  const sku = skuMatch?.[1];

  return {
    name,
    sku,
    currentPrice: priceData?.price || 0,
    currency: priceData?.currency || 'USD',
    platform: 'ebay',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Best Buy Extractor ─────────────────────────────────────

function extractBestBuy(): DetectedProduct | null {
  const name = safeText('.sku-title h1') || safeText('h1.heading-5') || safeText('[data-testid="heading"] h1');
  if (!name) return null;

  const priceText = safeText('.priceView-hero-price span')
    || safeText('.priceView-customer-price span')
    || safeText('[data-testid="customer-price"] span');
  const priceData = priceText ? extractPrice(priceText) : null;

  const modelNumber = safeText('.sku-model .product-data-value') || safeText('[data-testid="sku-model-value"]');
  const sku = safeText('.sku-value .product-data-value') || safeText('[data-testid="sku-value"]');
  const imageUrl = safeAttr('.primary-image img, .shop-media-gallery img', 'src') || undefined;

  return {
    name,
    modelNumber: modelNumber || undefined,
    sku: sku || undefined,
    currentPrice: priceData?.price || 0,
    currency: 'USD',
    platform: 'bestbuy',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Target Extractor ───────────────────────────────────────

function extractTarget(): DetectedProduct | null {
  const name = safeText('[data-test="product-title"]')
    || safeText('h1[data-test="product-title"]')
    || safeText('h1');
  if (!name) return null;

  const priceText = safeText('[data-test="product-price"]')
    || safeText('.h-text-bs span');
  const priceData = priceText ? extractPrice(priceText) : null;

  const brand = safeText('[data-test="product-brand"]') || undefined;
  const imageUrl = safeAttr('[data-test="product-image"] img', 'src')
    || safeAttr('.slideDeckPicture img', 'src')
    || undefined;

  const skuMatch = window.location.pathname.match(/A-(\d+)/);
  const sku = skuMatch?.[1];

  return {
    name,
    brand,
    sku,
    currentPrice: priceData?.price || 0,
    currency: 'USD',
    platform: 'target',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Newegg Extractor ───────────────────────────────────────

function extractNewegg(): DetectedProduct | null {
  const name = safeText('.product-title') || safeText('h1.product-title');
  if (!name) return null;

  const priceText = safeText('.price-current')
    || safeText('li.price-current');
  const priceData = priceText ? extractPrice(priceText) : null;

  const brand = safeText('.product-brand') || undefined;
  const modelNumber = safeText('.product-model .product-info-value') || undefined;
  const imageUrl = safeAttr('.product-view-img-original', 'src')
    || safeAttr('.mainSlide img', 'src')
    || undefined;

  const skuMatch = window.location.pathname.match(/\/p\/([\w-]+)/);
  const sku = skuMatch?.[1];

  return {
    name,
    brand,
    modelNumber,
    sku,
    currentPrice: priceData?.price || 0,
    currency: 'USD',
    platform: 'newegg',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── AliExpress Extractor ───────────────────────────────────

function extractAliExpress(): DetectedProduct | null {
  const name = safeText('h1.product-title-text')
    || safeText('h1[data-pl="product-title"]')
    || safeText('.product-title');
  if (!name) return null;

  const priceText = safeText('.product-price-current')
    || safeText('.uniform-banner-box-price')
    || safeText('.es--wrap--erdmPRe .notranslate');
  const priceData = priceText ? extractPrice(priceText) : null;

  const imageUrl = safeAttr('.magnifier-image', 'src')
    || safeAttr('.image-view-magnifier-wrap img', 'src')
    || undefined;

  return {
    name,
    currentPrice: priceData?.price || 0,
    currency: priceData?.currency || 'USD',
    platform: 'aliexpress',
    url: window.location.href,
    imageUrl: imageUrl || undefined,
  };
}

// ─── Generic Extractor (Fallback) ────────────────────────────

function extractGeneric(): DetectedProduct | null {
  // Try common product page patterns
  const name = safeText('[itemprop="name"]')
    || safeText('h1')
    || safeText('.product-title')
    || safeText('.product-name');

  if (!name) return null;

  const priceText = safeText('[itemprop="price"]')
    || safeText('.price')
    || safeText('.product-price');

  const priceData = priceText ? extractPrice(priceText) : null;

  return {
    name,
    currentPrice: priceData?.price || 0,
    currency: priceData?.currency || 'USD',
    platform: detectPlatform() || 'unknown',
    url: window.location.href,
  };
}

// ─── Main Detection Logic ─────────────────────────────────────

function detectProduct(): DetectedProduct | null {
  const platform = detectPlatform();

  const extractors: Record<string, () => DetectedProduct | null> = {
    amazon: extractAmazon,
    flipkart: extractFlipkart,
    walmart: extractWalmart,
    ebay: extractEbay,
    bestbuy: extractBestBuy,
    target: extractTarget,
    newegg: extractNewegg,
    aliexpress: extractAliExpress,
  };

  if (platform && extractors[platform]) {
    const result = extractors[platform]();
    if (result && result.name) {
      return result;
    }
  }

  // Fallback to generic extraction
  const generic = extractGeneric();
  if (generic && generic.name) {
    return generic;
  }

  return null;
}

// ─── Message Handling ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'DETECT_PRODUCT') {
    const product = detectProduct();
    sendResponse({ product });
  }
  return true; // Keep message channel open for async response
});

// ─── Auto-detection on page load ──────────────────────────────

function autoDetect(): void {
  const platform = detectPlatform();
  if (!platform) return;

  // Wait for page to fully render
  setTimeout(() => {
    const product = detectProduct();
    if (product && product.name && product.currentPrice > 0) {
      // Send to background script
      chrome.runtime.sendMessage({
        type: 'PRODUCT_DETECTED',
        payload: product,
      });
    }
  }, 2000);
}

// Run auto-detection
if (document.readyState === 'complete') {
  autoDetect();
} else {
  window.addEventListener('load', autoDetect);
}
