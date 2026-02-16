import React, { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';

interface Props {
  productId: string;
}

interface HistoryData {
  allTimeLow: number;
  allTimeHigh: number;
  averagePrice: number;
  volatilityIndex: string;
  standardDeviation: number;
  priceHistory: {
    price: number;
    platform: string;
    timestamp: string;
  }[];
}

const volatilityColors: Record<string, { bg: string; text: string; label: string }> = {
  stable: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'Stable' },
  moderate: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: 'Moderate' },
  highly_volatile: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'Highly Volatile' },
};

export default function PriceHistory({ productId }: Props) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage(
      { type: 'GET_HISTORY', payload: { productId, days } },
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
  }, [productId, days]);

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
        Connect the backend server to see price history.
      </div>
    );
  }

  if (!data || data.priceHistory.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        {error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          'No price history available yet.'
        )}
      </div>
    );
  }

  const chartData = data.priceHistory.map((entry) => ({
    date: new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    fullDate: new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    price: entry.price,
    platform: entry.platform,
  }));

  const showDots = chartData.length <= 10; // Show dots when sparse data

  const vol = volatilityColors[data.volatilityIndex] || volatilityColors.stable;

  return (
    <div className="p-3 space-y-3">
      {/* Sparse data notice */}
      {data.priceHistory.length < 5 && (
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-2.5">
          <p className="text-[10px] text-blue-400 font-medium">Building price history...</p>
          <p className="text-[10px] text-blue-400/70 mt-0.5">
            {data.priceHistory.length} data point{data.priceHistory.length !== 1 ? 's' : ''} recorded. 
            Visit this product regularly to build a comprehensive price chart. 
            VIPT records prices each time you open the extension on a product page.
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="All-Time Low" value={`$${data.allTimeLow.toFixed(2)}`} color="text-green-400" />
        <StatCard label="All-Time High" value={`$${data.allTimeHigh.toFixed(2)}`} color="text-red-400" />
        <StatCard label="Average" value={`$${data.averagePrice.toFixed(2)}`} color="text-gray-300" />
        <div className={`rounded-lg p-2 text-center ${vol.bg}`}>
          <p className="text-[9px] text-gray-400">Volatility</p>
          <p className={`text-[11px] font-bold ${vol.text}`}>{vol.label}</p>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-1.5 justify-center">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-[10px] px-3 py-1 rounded-full transition-all
              ${days === d
                ? 'bg-vayu-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            {d}D
          </button>
        ))}
      </div>

      {/* Price Chart */}
      <div className="bg-[#1a1b23] rounded-lg p-3 border border-gray-800/50">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4c6ef5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4c6ef5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2b35" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 9 }}
              axisLine={{ stroke: '#2a2b35' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 9 }}
              axisLine={{ stroke: '#2a2b35' }}
              tickLine={false}
              domain={['dataMin - 10', 'dataMax + 10']}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: '#1e1f2e',
                border: '1px solid #3b3d4a',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#e4e5e7',
              }}
              formatter={(value: number) => [`$${Number(value).toFixed(2)}`, 'Price']}
              labelFormatter={(label: string, payload: any[]) => {
                if (payload?.[0]?.payload?.fullDate) return payload[0].payload.fullDate;
                return label;
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#4c6ef5"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={showDots ? { r: 4, fill: '#4c6ef5', stroke: '#fff', strokeWidth: 2 } : false}
              activeDot={{ r: 4, fill: '#4c6ef5', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Average line indicator */}
      <div className="text-center text-[10px] text-gray-500">
        Avg: ${data.averagePrice.toFixed(2)} • Std Dev: ±${data.standardDeviation.toFixed(2)} • {data.priceHistory.length} data point{data.priceHistory.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#1a1b23] rounded-lg p-2 text-center border border-gray-800/50">
      <p className="text-[9px] text-gray-400">{label}</p>
      <p className={`text-[11px] font-bold ${color}`}>{value}</p>
    </div>
  );
}
