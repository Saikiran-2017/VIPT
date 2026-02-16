import React from 'react';
import RecommendationBadge from './RecommendationBadge';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    brand?: string;
    modelNumber?: string;
    imageUrl?: string;
    detection?: {
      currentPrice: number;
      currency: string;
      platform: string;
    };
  };
}

const currencySymbols: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£',
};

export default function ProductCard({ product }: ProductCardProps) {
  const price = product.detection?.currentPrice;
  const currency = product.detection?.currency || 'USD';
  const symbol = currencySymbols[currency] || '$';
  const platform = product.detection?.platform;

  return (
    <div className="px-4 py-3 bg-[#151620] border-b border-gray-800">
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="w-16 h-16 bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white leading-tight line-clamp-2">
            {product.name}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {product.brand && (
              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                {product.brand}
              </span>
            )}
            {platform && (
              <span className="text-[10px] text-vayu-300 bg-vayu-900/30 px-1.5 py-0.5 rounded capitalize">
                {platform}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            {price && (
              <span className="text-lg font-bold text-white">
                {symbol}{price.toLocaleString()}
              </span>
            )}
            <RecommendationBadge productId={product.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
