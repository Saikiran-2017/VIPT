import React, { useState, useEffect } from 'react';

interface Props {
  productId: string;
}

interface Alert {
  id: string;
  type: string;
  targetPrice?: number;
  isActive: boolean;
  createdAt: string;
  triggeredAt?: string;
}

const alertTypeLabels: Record<string, { label: string; icon: string }> = {
  target_price: { label: 'Target Price', icon: '🎯' },
  sudden_drop: { label: 'Sudden Drop', icon: '📉' },
  prediction_trigger: { label: 'AI Prediction', icon: '🤖' },
  event_based: { label: 'Sale Event', icon: '🏷️' },
};

export default function AlertPanel({ productId }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [alertType, setAlertType] = useState('target_price');
  const [targetPrice, setTargetPrice] = useState('');
  const [createStatus, setCreateStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    loadAlerts();
  }, [productId]);

  async function loadAlerts() {
    const stored = await chrome.storage.local.get('userId');
    const userId = stored.userId;

    chrome.runtime.sendMessage(
      { type: 'GET_ALERTS', payload: { userId } },
      (response) => {
        if (response?.success && response.data) {
          setAlerts(response.data.filter((a: Alert & { productId: string }) => a.productId === productId));
        }
        setLoading(false);
      }
    );
  }

  async function createAlert() {
    if (!productId) {
      setCreateStatus({ type: 'error', message: 'Backend server not connected. Cannot create alerts.' });
      return;
    }
    if (alertType === 'target_price' && (!targetPrice || parseFloat(targetPrice) <= 0)) {
      setCreateStatus({ type: 'error', message: 'Please enter a valid target price.' });
      return;
    }
    setCreateStatus(null);
    const stored = await chrome.storage.local.get('userId');
    const userId = stored.userId;

    if (!userId) {
      setCreateStatus({ type: 'error', message: 'User ID not found. Try reinstalling the extension.' });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'SET_ALERT',
        payload: {
          userId,
          productId,
          type: alertType,
          targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          setCreateStatus({ type: 'error', message: 'Failed to connect to server.' });
          return;
        }
        if (response?.success) {
          setCreateStatus({ type: 'success', message: 'Alert created successfully!' });
          setShowCreate(false);
          setTargetPrice('');
          loadAlerts();
          setTimeout(() => setCreateStatus(null), 3000);
        } else {
          setCreateStatus({ type: 'error', message: response?.error || 'Failed to create alert. Check backend server.' });
        }
      }
    );
  }

  async function deleteAlert(alertId: string) {
    const stored = await chrome.storage.local.get('userId');
    const userId = stored.userId;

    chrome.runtime.sendMessage(
      { type: 'DELETE_ALERT', payload: { alertId, userId } },
      (response) => {
        if (response?.success) {
          loadAlerts();
        }
      }
    );
  }

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
        Connect the backend server to create and manage alerts.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Status message */}
      {createStatus && (
        <div className={`p-2.5 rounded-lg text-xs font-medium ${
          createStatus.type === 'success'
            ? 'bg-green-900/20 border border-green-800/30 text-green-400'
            : 'bg-red-900/20 border border-red-800/30 text-red-400'
        }`}>
          {createStatus.message}
        </div>
      )}

      {/* Create Alert Button */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full py-2.5 rounded-lg bg-vayu-700 hover:bg-vayu-600 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
      >
        <span>+</span> Create New Alert
      </button>

      {/* Create Alert Form */}
      {showCreate && (
        <div className="bg-[#1a1b23] rounded-lg p-3 border border-gray-800/50 space-y-2.5">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Alert Type</label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-vayu-500 outline-none"
            >
              {Object.entries(alertTypeLabels).map(([key, { label, icon }]) => (
                <option key={key} value={key}>{icon} {label}</option>
              ))}
            </select>
          </div>

          {alertType === 'target_price' && (
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Target Price ($)</label>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Enter target price..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-vayu-500 outline-none placeholder-gray-600"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={createAlert}
              className="flex-1 py-1.5 rounded-lg bg-vayu-600 hover:bg-vayu-500 text-white text-xs font-medium transition-colors"
            >
              Create Alert
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Alerts */}
      {alerts.length === 0 && !showCreate && (
        <div className="text-center text-gray-500 text-sm py-4">
          <p>No alerts set for this product.</p>
          <p className="text-xs mt-1">Create one to get notified of price changes!</p>
        </div>
      )}

      {alerts.map((alert) => {
        const typeInfo = alertTypeLabels[alert.type] || { label: alert.type, icon: '🔔' };
        return (
          <div
            key={alert.id}
            className={`bg-[#1a1b23] rounded-lg p-3 border transition-all
              ${alert.isActive
                ? 'border-gray-800/50'
                : 'border-gray-800/30 opacity-60'
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{typeInfo.icon}</span>
                <div>
                  <p className="text-xs font-medium text-gray-300">{typeInfo.label}</p>
                  {alert.targetPrice && (
                    <p className="text-[10px] text-gray-500">Target: ${alert.targetPrice}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {alert.triggeredAt && (
                  <span className="text-[9px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded-full">
                    Triggered
                  </span>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  alert.isActive ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'
                }`}>
                  {alert.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
