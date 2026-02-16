import React from 'react';

interface Props {
  message: string;
  onRetry?: () => void;
}

export default function EmptyState({ message, onRetry }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </div>
      <p className="text-sm text-gray-400 mb-1">{message}</p>
      <p className="text-xs text-gray-600 mb-4">
        Navigate to a product page on Amazon, Flipkart, Walmart, eBay, or Best Buy
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-vayu-700 hover:bg-vayu-600 text-white text-xs rounded-lg font-medium transition-colors"
        >
          Retry Detection
        </button>
      )}
    </div>
  );
}
