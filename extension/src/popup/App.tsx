import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import PriceComparison from '../components/PriceComparison';
import PriceHistory from '../components/PriceHistory';
import PredictionPanel from '../components/PredictionPanel';
import RecommendationBadge from '../components/RecommendationBadge';
import AlertPanel from '../components/AlertPanel';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';

type Tab = 'compare' | 'history' | 'predict' | 'alerts';

interface ProductData {
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
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('compare');
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadCurrentProduct();
  }, []);

  async function loadCurrentProduct() {
    setLoading(true);
    setError(null);
    setBackendConnected(false);

    // Helper to send DETECT_PRODUCT message with timeout
    function tryDetect(tabId: number): Promise<any> {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 3000);
        chrome.tabs.sendMessage(tabId, { type: 'DETECT_PRODUCT' }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response?.product || null);
          }
        });
      });
    }

    try {
      // First try to get from storage (cached from content script)
      const stored = await chrome.storage.local.get('currentProduct');
      if (stored.currentProduct && stored.currentProduct.id && (Date.now() - (stored.currentProduct.timestamp || 0)) < 60000) {
        setProduct(stored.currentProduct);
        setBackendConnected(true);
        setLoading(false);
        return;
      }

      // If no cached product, ask content script to detect
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setError('No active tab found');
        setLoading(false);
        return;
      }

      // Try to message the content script, with fallback injection
      let detected = await tryDetect(tab.id!);

      // If content script not injected yet, inject it programmatically and retry
      if (!detected) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['content.js'],
          });
          // Wait a moment for script to initialize
          await new Promise(r => setTimeout(r, 500));
          detected = await tryDetect(tab.id!);
        } catch (injectErr) {
          console.error('Failed to inject content script:', injectErr);
        }
      }

      if (!detected) {
        setError('No product detected on this page. Visit a product page on Amazon, Flipkart, Walmart, etc.');
        setLoading(false);
        return;
      }

      // Show detected product info immediately while backend resolves
      setProduct({
        id: '',
        name: detected.name,
        brand: detected.brand,
        imageUrl: detected.imageUrl,
        detection: {
          currentPrice: detected.currentPrice,
          currency: detected.currency,
          platform: detected.platform,
        },
      });
      setLoading(false);

      // Send to backend for full resolution (non-blocking)
      const result = await new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 8000);
        chrome.runtime.sendMessage(
          { type: 'PRODUCT_DETECTED', payload: detected },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(res);
            }
          }
        );
      });

      if (result?.data?.product) {
        setBackendConnected(true);
        setProduct({
          ...result.data.product,
          detection: detected,
        });
      }
    } catch (err) {
      setError('Failed to detect product');
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: 'Compare', icon: '⚖️' },
    { key: 'history', label: 'History', icon: '📈' },
    { key: 'predict', label: 'AI Predict', icon: '🤖' },
    { key: 'alerts', label: 'Alerts', icon: '🔔' },
  ];

  return (
    <div className="min-h-[500px] bg-[#0f1117] text-white flex flex-col">
      <Header onSettingsClick={() => setShowSettings(!showSettings)} />

      {loading && <LoadingSpinner />}

      {error && !loading && <EmptyState message={error} onRetry={loadCurrentProduct} />}

      {showSettings && !loading && (
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold mb-3">Settings</h3>
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex justify-between items-center">
              <span>API Server</span>
              <span className="text-vayu-400">localhost:3000</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Auto-detect products</span>
              <span className="text-green-400">Enabled</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Version</span>
              <span className="text-gray-500">1.0.0</span>
            </div>
            <button
              onClick={() => {
                chrome.storage.local.clear();
                setShowSettings(false);
                loadCurrentProduct();
              }}
              className="w-full mt-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              Clear Cache & Reload
            </button>
          </div>
        </div>
      )}

      {product && !loading && (
        <>
          <ProductCard product={product} />

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-800 px-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-xs font-medium transition-all relative
                  ${activeTab === tab.key
                    ? 'text-vayu-400'
                    : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-vayu-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {!product.id && (
              <div className="p-4 mx-3 mt-3 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
                <p className="text-xs font-medium text-yellow-400">Backend server not connected</p>
                <p className="text-[10px] text-yellow-400/70 mt-1">
                  Start the backend server to enable price comparison, history, predictions, and alerts.
                  Run: <span className="font-mono bg-yellow-900/30 px-1 rounded">docker compose up -d</span> then <span className="font-mono bg-yellow-900/30 px-1 rounded">npm run dev</span> in /backend
                </p>
              </div>
            )}
            {activeTab === 'compare' && <PriceComparison productId={product.id} />}
            {activeTab === 'history' && <PriceHistory productId={product.id} />}
            {activeTab === 'predict' && <PredictionPanel productId={product.id} />}
            {activeTab === 'alerts' && <AlertPanel productId={product.id} />}
          </div>
        </>
      )}
    </div>
  );
}
