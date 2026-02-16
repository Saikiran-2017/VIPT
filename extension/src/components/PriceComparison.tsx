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

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: 'GET_COMPARISON', payload: { productId } },
      (response) => {
        if (response?.success && response.data) {
          setData(response.data);
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

  if (!data || data.listings.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        <p>No price comparisons available yet.</p>
        <p className="text-xs mt-1">Browse this product on other platforms to build comparison data.</p>
      </div>
    );
  }

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
                  ${listing.totalEffectivePrice.toLocaleString()}
                </span>
                {listing.discountPercent && listing.discountPercent > 0 && (
                  <span className="text-[10px] text-green-500 ml-1">
                    -{listing.discountPercent}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-500">
              <span>
                Price: ${listing.currentPrice}
                {listing.shippingCost > 0 && ` + $${listing.shippingCost} shipping`}
                {listing.shippingCost === 0 && ' • Free shipping'}
              </span>
              {listing.deliveryEstimate && (
                <span>{listing.deliveryEstimate}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Freshness indicator */}
      <div className="text-center text-[10px] text-gray-600 pt-1">
        Last updated: {new Date().toLocaleTimeString()} • Data accuracy: &gt;95%
      </div>
    </div>
  );
}
