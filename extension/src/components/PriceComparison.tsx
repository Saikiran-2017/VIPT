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

export default function PriceComparison({ productId }: Props) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
        setLoading(false);
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

  // Determine which platforms are tracked and which aren't
  const allPlatforms = ['amazon', 'walmart', 'target', 'ebay', 'bestbuy', 'flipkart', 'newegg', 'aliexpress'];
  const trackedPlatforms = data ? data.listings.map(l => l.platform) : [];
  const untrackedPlatforms = allPlatforms.filter(p => !trackedPlatforms.includes(p));

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

      {/* Price listings */}
      {data.listings.map((listing, i) => {
        const isLowest = listing.totalEffectivePrice === data.lowestPrice.totalEffectivePrice;
        const color = platformColors[listing.platform] || '#666';

        return (
          <div
            key={i}
            className={`rounded-lg p-3 transition-all cursor-pointer hover:bg-gray-800/80
              ${isLowest ? 'bg-vayu-900/20 border border-vayu-700/30' : 'bg-[#1a1b23] border border-gray-800/50'}`}
            onClick={() => listing.url && window.open(listing.url, '_blank')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
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

      {/* Untracked platforms hint */}
      {data.listings.length === 1 && (
        <div className="bg-[#1a1b23] rounded-lg p-2.5 border border-gray-800/50">
          <p className="text-[10px] text-gray-400 font-medium mb-1.5">📊 Track more platforms for comparison</p>
          <div className="flex flex-wrap gap-1">
            {untrackedPlatforms.slice(0, 5).map(p => (
              <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 capitalize">
                {p}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-gray-600 mt-1.5">
            Search for this product on other stores and open the VIPT extension to add their prices.
          </p>
        </div>
      )}

      {/* Freshness indicator */}
      <div className="text-center text-[10px] text-gray-600 pt-1">
        Last updated: {new Date().toLocaleTimeString()} • Tracking {trackedPlatforms.length} platform{trackedPlatforms.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
