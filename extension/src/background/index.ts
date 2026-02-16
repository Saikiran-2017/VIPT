/**
 * VIPT (Vayu Intelligence Price Tracker) - Background Service Worker
 * 
 * Handles:
 * - Communication between content script and popup
 * - API calls to backend
 * - Alert checking via alarms
 * - Product data caching
 */

const API_BASE = 'http://localhost:3000/api/v1';

// ─── Message Handling ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async
});

async function handleMessage(message: any, _sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'PRODUCT_DETECTED':
      return handleProductDetected(message.payload);

    case 'GET_COMPARISON':
      return apiGet(`/prices/compare/${message.payload.productId}`);

    case 'GET_HISTORY':
      return apiGet(`/prices/history/${message.payload.productId}?days=${message.payload.days || 90}`);

    case 'GET_PREDICTION':
      return apiGet(`/predictions/${message.payload.productId}`);

    case 'GET_RECOMMENDATION':
      return apiGet(`/recommendation/${message.payload.productId}`);

    case 'GET_EVENTS':
      return apiGet('/events/upcoming?days=60');

    case 'SET_ALERT':
      return apiPost('/alerts', message.payload);

    case 'GET_ALERTS':
      return apiGet(`/alerts/user/${message.payload.userId}`);

    case 'DELETE_ALERT':
      return apiDelete(`/alerts/${message.payload.alertId}?userId=${message.payload.userId}`);

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── Product Detection Handler ────────────────────────────────

async function handleProductDetected(product: any): Promise<any> {
  try {
    // Send to backend for identification
    const result = await apiPost('/products/detect', product);

    // Cache the product data for quick access
    if (result?.data?.product) {
      await chrome.storage.local.set({
        currentProduct: {
          ...result.data.product,
          detection: product,
          timestamp: Date.now(),
        },
      });
    }

    // Update badge to show product detected
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#40c057' });

    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 3000);

    return result;
  } catch (error) {
    console.error('Product detection failed:', error);
    return { error: 'Detection failed' };
  }
}

// ─── API Helpers ──────────────────────────────────────────────

async function apiGet(endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API GET ${endpoint} failed:`, error);
    return { success: false, error: 'Cannot connect to backend server. Is it running on localhost:3000?' };
  }
}

async function apiPost(endpoint: string, data: any): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API POST ${endpoint} failed:`, error);
    return { success: false, error: 'Cannot connect to backend server. Is it running on localhost:3000?' };
  }
}

async function apiDelete(endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API DELETE ${endpoint} failed:`, error);
    return { success: false, error: 'Cannot connect to backend server. Is it running on localhost:3000?' };
  }
}

// ─── Alarms for periodic alert checking ───────────────────────

chrome.alarms.create('checkAlerts', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkAlerts') {
    console.log('Checking price alerts...');
    // In a full implementation, this would check all active alerts
    // and trigger notifications for matching conditions
  }
});

// ─── Extension Install Handler ────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`VIPT ${details.reason}`);
  // Always ensure userId exists (install, update, or dev reload)
  await ensureUserId();
});

// Also ensure userId on every service worker startup (in case storage was cleared)
ensureUserId();

async function ensureUserId(): Promise<void> {
  const stored = await chrome.storage.local.get(['userId', 'installedAt', 'tier']);
  if (!stored.userId) {
    await chrome.storage.local.set({
      userId: crypto.randomUUID(),
      installedAt: stored.installedAt || Date.now(),
      tier: stored.tier || 'free',
    });
    console.log('VIPT: Generated new anonymous userId');
  }
}
