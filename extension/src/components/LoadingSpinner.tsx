import React from 'react';

export default function LoadingSpinner() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="relative">
        <div className="w-12 h-12 border-[3px] border-gray-800 rounded-full" />
        <div className="w-12 h-12 border-[3px] border-vayu-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
      </div>
      <p className="text-xs text-gray-500 mt-4">Detecting product...</p>
      <p className="text-[10px] text-gray-600 mt-1">Analyzing page data</p>
    </div>
  );
}
