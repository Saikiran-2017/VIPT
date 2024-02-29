/**
 * VIPT (Vayu Intelligence Price Tracker) - Background Service Worker
 * 
 * Handles:
 * - Communication between content script and popup
 * - API calls to backend
 * - Alert checking via alarms
 * - Product data caching
 */

/** Set at build time via `VITE_API_BASE_URL` (see `extension/.env.example`). */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || '';

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) h['X-API-Key'] = API_KEY;
  return h;
}

/** Extension anonymous user id — required for `/alerts` routes (ownership). */
function apiHeadersWithUser(userId: string): Record<string, string> {
  const h = apiHeaders();
  h['X-User-Id'] = userId;
  return h;
}

function apiOriginHint(): string {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return 'the configured API';
  }
}

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

    case 'GET_CROSS_PLATFORM':
      return apiGet(`/prices/cross-platform/${message.payload.productId}`);

    case 'GET_HISTORY':
      return apiGet(`/prices/history/${message.payload.productId}?days=${message.payload.days || 90}`);

    case 'GET_PREDICTION':
      return apiGet(`/predictions/${message.payload.productId}`);

    case 'GET_RECOMMENDATION':
      return apiGet(`/recommendation/${message.payload.productId}`);

    case 'GET_EVENTS':
      return apiGet('/events/upcoming?days=60');

    case 'SET_ALERT': {
      const uid = await getStoredUserId();
      if (!uid) {
        return { success: false, error: 'User ID not found. Try reinstalling the extension.' };
      }
      const { productId, type, targetPrice } = message.payload;
      return apiPost(
        '/alerts',
        { productId, type, targetPrice },
        uid
      );
    }

    case 'GET_ALERTS': {
      const uid = await getStoredUserId();
      if (!uid) {
        return { success: false, error: 'User ID not found. Try reinstalling the extension.' };
      }
      return apiGet('/alerts/me', uid);
    }

    case 'DELETE_ALERT': {
      const uid = await getStoredUserId();
      if (!uid) {
        return { success: false, error: 'User ID not found. Try reinstalling the extension.' };
      }
      return apiDelete(`/alerts/${message.payload.alertId}`, uid);
    }

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

async function getStoredUserId(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get('userId');
  return typeof stored.userId === 'string' ? stored.userId : undefined;
}

async function apiGet(endpoint: string, extensionUserId?: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: extensionUserId ? apiHeadersWithUser(extensionUserId) : apiHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API GET ${endpoint} failed:`, error);
    return {
      success: false,
      error: `Cannot connect to backend (${apiOriginHint()}). Check URL, API key, and network.`,
    };
  }
}

async function apiPost(endpoint: string, data: any, extensionUserId?: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: extensionUserId ? apiHeadersWithUser(extensionUserId) : apiHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API POST ${endpoint} failed:`, error);
    return {
      success: false,
      error: `Cannot connect to backend (${apiOriginHint()}). Check URL, API key, and network.`,
    };
  }
}

async function apiDelete(endpoint: string, extensionUserId?: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: extensionUserId ? apiHeadersWithUser(extensionUserId) : apiHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.error || `Server error (${response.status})` };
    }
    return response.json();
  } catch (error) {
    console.error(`API DELETE ${endpoint} failed:`, error);
    return {
      success: false,
      error: `Cannot connect to backend (${apiOriginHint()}). Check URL, API key, and network.`,
    };
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
