import React from 'react';

interface HeaderProps {
  onSettingsClick?: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  return (
    <div className="bg-gradient-to-r from-vayu-700 to-vayu-900 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center text-sm font-bold">
          V
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">VIPT</h1>
          <p className="text-[10px] text-vayu-200 -mt-0.5">Vayu Intelligence Price Tracker</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] bg-vayu-600/50 px-2 py-0.5 rounded-full text-vayu-200">
          FREE
        </span>
        <button onClick={onSettingsClick} className="text-vayu-200 hover:text-white transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
