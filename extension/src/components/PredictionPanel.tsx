import React, { useState, useEffect } from 'react';

interface Props {
  productId: string;
}

interface Prediction {
  currentPrice: number;
  expectedPriceRange: { low: number; high: number };
  dropProbability: number;
  suggestedWaitDays: number;
  confidenceScore: number;
  modelUsed: string;
  factors: {
    name: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
    description: string;
  }[];
  generatedAt: string;
}

const impactIcons: Record<string, { icon: string; color: string }> = {
  positive: { icon: '▼', color: 'text-green-400' },
  negative: { icon: '▲', color: 'text-red-400' },
  neutral: { icon: '●', color: 'text-gray-400' },
};

export default function PredictionPanel({ productId }: Props) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: 'GET_PREDICTION', payload: { productId } },
      (response) => {
        if (response?.success && response.data) {
          setPrediction(response.data);
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

  if (!prediction) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        Prediction not available. More price data needed.
      </div>
    );
  }

  const dropPct = Math.round(prediction.dropProbability * 100);
  const confPct = Math.round(prediction.confidenceScore * 100);

  return (
    <div className="p-3 space-y-3">
      {/* Drop Probability Gauge */}
      <div className="bg-[#1a1b23] rounded-lg p-4 border border-gray-800/50 text-center">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Price Drop Probability</p>
        <div className="relative w-24 h-24 mx-auto">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="40"
              fill="none" stroke="#2a2b35" strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke={dropPct > 60 ? '#40c057' : dropPct > 30 ? '#fab005' : '#fa5252'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dropPct * 2.51} 251`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{dropPct}%</span>
          </div>
        </div>
        {prediction.suggestedWaitDays > 0 && (
          <p className="text-xs text-vayu-300 mt-2">
            Suggested wait: <span className="font-semibold">{prediction.suggestedWaitDays} days</span>
          </p>
        )}
      </div>

      {/* Price Range */}
      <div className="bg-[#1a1b23] rounded-lg p-3 border border-gray-800/50">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Expected Price Range</p>
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-xs text-gray-400">Low</p>
            <p className="text-sm font-bold text-green-400">${prediction.expectedPriceRange.low}</p>
          </div>

          {/* Range visualization */}
          <div className="flex-1 mx-3 relative h-6">
            <div className="absolute inset-y-2 left-0 right-0 bg-gray-800 rounded-full">
              <div
                className="absolute inset-y-0 bg-gradient-to-r from-green-500/30 to-red-500/30 rounded-full"
                style={{
                  left: '10%',
                  right: '10%',
                }}
              />
            </div>
            {/* Current price marker */}
            <div
              className="absolute top-0 w-2 h-6 bg-vayu-500 rounded-full"
              style={{
                left: `${Math.min(90, Math.max(10,
                  ((prediction.currentPrice - prediction.expectedPriceRange.low) /
                    (prediction.expectedPriceRange.high - prediction.expectedPriceRange.low)) * 80 + 10
                ))}%`,
              }}
              title={`Current: $${prediction.currentPrice}`}
            />
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">High</p>
            <p className="text-sm font-bold text-red-400">${prediction.expectedPriceRange.high}</p>
          </div>
        </div>
        <p className="text-[10px] text-center text-gray-500 mt-1">
          Current: ${prediction.currentPrice}
        </p>
      </div>

      {/* Prediction Factors */}
      <div className="bg-[#1a1b23] rounded-lg p-3 border border-gray-800/50">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">AI Analysis Factors</p>
        <div className="space-y-1.5">
          {prediction.factors.map((factor, i) => {
            const impact = impactIcons[factor.impact] || impactIcons.neutral;
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${impact.color}`}>{impact.icon}</span>
                <div className="flex-1">
                  <p className="text-[11px] font-medium text-gray-300">{factor.name}</p>
                  <p className="text-[10px] text-gray-500">{factor.description}</p>
                </div>
                <div className="text-[9px] text-gray-600">
                  {Math.round(factor.weight * 100)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confidence & Model Info */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 px-1">
        <span>Confidence: {confPct}% • Model: {prediction.modelUsed}</span>
        <span>{new Date(prediction.generatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
