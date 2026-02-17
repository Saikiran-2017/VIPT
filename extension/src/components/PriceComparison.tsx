import React, { useState, useEffect } from 'react';

interface Props {
  productId: string;
}

interface Listing {
  platform: string;
  currentPrice: number;
  shippingCost: number;
  totalEffectivePrice: number;
  discountPercent?: number;
  deliveryEstimate?: string;
  inStock: boolean;
  url: string;
  lastUpdated: string;
}

interface ComparisonData {
  productName: string;
  listings: Listing[];
  lowestPrice: Listing;
  antiManipulation: {
    isGenuineDiscount: boolean;
    confidence: number;
    flags: string[];
  };
}

interface CrossPlatformResult {
  platform: string;
  platformName: string;
  searchUrl: string;
  scrapedPrice?: number;
  scrapedProductName?: string;
  currency?: string;
  available: boolean;
  method: 'scraped' | 'search_link';
  confidence: number;
}

interface CrossPlatformData {
  productName: string;
  currentPlatform: string;
  currentPrice: number;
  results: CrossPlatformResult[];
}

const platformColors: Record<string, string> = {
  amazon: '#FF9900',
  flipkart: '#2874F0',
  walmart: '#0071DC',
  ebay: '#E53238',
  bestbuy: '#0046BE',
  target: '#CC0000',
  newegg: '#D16106',
  aliexpress: '#E43225',
};

const platformIcons: Record<string, string> = {
  amazon: '📦',
  flipkart: '🛍️',
  walmart: '🏬',
  ebay: '🏷️',
  bestbuy: '💻',
  target: '🎯',
  newegg: '🖥️',
  aliexpress: '🌏',
};

export default function PriceComparison({ productId }: Props) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [crossPlatform, setCrossPlatform] = useState<CrossPlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Fetch both comparison and cross-platform data in parallel
    let comparisonDone = false;
    let crossPlatformDone = false;

    const checkDone = () => {
      if (comparisonDone && crossPlatformDone) setLoading(false);
    };

    chrome.runtime.sendMessage(
      { type: 'GET_COMPARISON', payload: { productId } },
      (response) => {
        if (chrome.runtime.lastError) {
          setError('Failed to connect to backend server.');
        } else if (response?.success && response.data) {
          setData(response.data);
        } else if (response?.error) {
          setError(response.error);
        }
        comparisonDone = true;
        checkDone();
      }
    );

    chrome.runtime.sendMessage(
      { type: 'GET_CROSS_PLATFORM', payload: { productId } },
      (response) => {
        if (!chrome.runtime.lastError && response?.success && response.data) {
          setCrossPlatform(response.data);
        }
        crossPlatformDone = true;
        checkDone();
      }
    );
  }, [productId]);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-vayu-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!productId) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        <p>Connect the backend server to see price comparisons.</p>
      </div>
    );
  }

  if (!data || data.listings.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        {error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <>
            <p>No price comparisons available yet.</p>
            <p className="text-xs mt-1">Browse this product on other platforms to build comparison data.</p>
          </>
        )}
      </div>
    );
  }

  // Combine tracked listings with cross-platform results
  const trackedPlatforms = data.listings.map(l => l.platform);
  const crossPlatformResults = crossPlatform?.results?.filter(
    r => !trackedPlatforms.includes(r.platform)
  ) || [];
  const scrapedResults = crossPlatformResults.filter(r => r.method === 'scraped' && r.scrapedPrice);
  const searchLinkResults = crossPlatformResults.filter(r => r.method === 'search_link' || !r.scrapedPrice);

  // Find overall lowest price (including scraped cross-platform)
  let overallLowest = data.lowestPrice.totalEffectivePrice;
  scrapedResults.forEach(r => {
    if (r.scrapedPrice && r.scrapedPrice < overallLowest) {
      overallLowest = r.scrapedPrice;
    }
  });

  return (
    <div className="p-3 space-y-2">
      {/* Anti-manipulation warning */}
      {data.antiManipulation && !data.antiManipulation.isGenuineDiscount && (
        <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-2.5 flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <p className="text-xs font-medium text-red-400">Discount may not be genuine</p>
            <p className="text-[10px] text-red-400/70 mt-0.5">
              {data.antiManipulation.flags.map(f => f.replace(/_/g, ' ')).join(' • ')}
            </p>
          </div>
        </div>
      )}

      {/* Tracked platform listings */}
      {data.listings.map((listing, i) => {
        const isLowest = listing.totalEffectivePrice === overallLowest;
        const color = platformColors[listing.platform] || '#666';

        return (
          <div
            key={`tracked-${i}`}
            className={`rounded-lg p-3 transition-all cursor-pointer hover:bg-gray-800/80
              ${isLowest ? 'bg-vayu-900/20 border border-vayu-700/30' : 'bg-[#1a1b23] border border-gray-800/50'}`}
            onClick={() => listing.url && window.open(listing.url, '_blank')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium capitalize">{listing.platform}</span>
                {isLowest && (
                  <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                    LOWEST
                  </span>
                )}
                {!listing.inStock && (
                  <span className="text-[9px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full">
                    OUT OF STOCK
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${isLowest ? 'text-green-400' : 'text-white'}`}>
                  ${listing.totalEffectivePrice.toFixed(2)}
                </span>
                {listing.discountPercent && listing.discountPercent > 0 && (
                  <span className="text-[10px] text-green-500 ml-1">
                    -{listing.discountPercent.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-500">
              <span>
                Price: ${listing.currentPrice.toFixed(2)}
                {listing.shippingCost > 0 && ` + $${listing.shippingCost.toFixed(2)} shipping`}
                {listing.shippingCost === 0 && ' • Free shipping'}
              </span>
              {listing.deliveryEstimate && (
                <span>{listing.deliveryEstimate}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Cross-platform scraped prices */}
      {scrapedResults.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px bg-gray-800 flex-1" />
            <span className="text-[9px] text-gray-500 uppercase tracking-wider">Other platforms</span>
            <div className="h-px bg-gray-800 flex-1" />
          </div>
          {scrapedResults.map((result, i) => {
            const isLowest = result.scrapedPrice === overallLowest;
            const color = platformColors[result.platform] || '#666';
            const icon = platformIcons[result.platform] || '🛒';
            const confPct = Math.round(result.confidence * 100);

            return (
              <div
                key={`scraped-${i}`}
                className={`rounded-lg p-3 transition-all cursor-pointer hover:bg-gray-800/80
                  ${isLowest ? 'bg-green-900/10 border border-green-800/30' : 'bg-[#1a1b23] border border-gray-800/50'}`}
                onClick={() => window.open(result.searchUrl, '_blank')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span className="text-xs font-medium">{result.platformName}</span>
                    {isLowest && (
                      <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                        LOWEST
                      </span>
                    )}
                    <span className="text-[9px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">
                      {confPct}% match
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${isLowest ? 'text-green-400' : 'text-white'}`}>
                    ${result.scrapedPrice!.toFixed(2)}
                  </span>
                </div>
                {result.scrapedProductName && (
                  <p className="text-[10px] text-gray-500 mt-1 truncate">
                    {result.scrapedProductName}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Search links for platforms without scraped prices */}
      {searchLinkResults.length > 0 && (
        <div className="bg-[#1a1b23] rounded-lg p-2.5 border border-gray-800/50">
          <p className="text-[10px] text-gray-400 font-medium mb-1.5">🔍 Search on other platforms</p>
          <div className="flex flex-wrap gap-1.5">
            {searchLinkResults.map((result, i) => {
              const icon = platformIcons[result.platform] || '🛒';
              return (
                <button
                  key={`link-${i}`}
                  onClick={() => window.open(result.searchUrl, '_blank')}
                  className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-all flex items-center gap-1"
                >
                  <span>{icon}</span>
                  {result.platformName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Savings tip */}
      {overallLowest < data.lowestPrice.totalEffectivePrice && (
        <div className="bg-green-900/15 border border-green-800/30 rounded-lg p-2.5">
          <p className="text-[10px] text-green-400 font-medium">
            💰 Save ${(data.lowestPrice.totalEffectivePrice - overallLowest).toFixed(2)} on another platform!
          </p>
        </div>
      )}

      {/* Freshness indicator */}
      <div className="text-center text-[10px] text-gray-600 pt-1">
        Last updated: {new Date().toLocaleTimeString()} • Tracking {trackedPlatforms.length} platform{trackedPlatforms.length !== 1 ? 's' : ''}
        {scrapedResults.length > 0 && ` + ${scrapedResults.length} found`}
      </div>
    </div>
  );
}
