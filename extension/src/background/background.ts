import { storeAuth, clearAuth, getStoredAuth } from '../shared/auth';
import type { ExtMessage } from '../shared/types';

const CLIENT_ID:   string = process.env.AZURE_CLIENT_ID || '';
const BACKEND_URL: string = process.env.BACKEND_URL     || '';

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'LOGIN':
        handleLogin().then(sendResponse).catch((err: Error) =>
          sendResponse({ success: false, error: err.message })
        );
        return true;

      case 'LOGOUT':
        clearAuth().then(() => sendResponse({ success: true }));
        return true;

      case 'GET_AUTH':
        getStoredAuth().then(sendResponse);
        return true;

      case 'OPEN_APP':
        chrome.tabs.create({ url: `${BACKEND_URL}/` });
        sendResponse({ success: true });
        return false;

      case 'OPEN_RECORDING':
        chrome.tabs.create({ url: `${BACKEND_URL}/record` });
        sendResponse({ success: true });
        return false;

      case 'OPEN_UPLOAD':
        chrome.tabs.create({ url: `${BACKEND_URL}/upload` });
        sendResponse({ success: true });
        return false;
    }
  }
);

// ── Microsoft OAuth2 login ────────────────────────────────────────────────────

async function handleLogin(): Promise<{ success: boolean; error?: string }> {
  // If no client ID configured, fall back to opening the app
  if (!CLIENT_ID) {
    await chrome.tabs.create({ url: `${BACKEND_URL}/` });
    return { success: false, error: '請在 XMeet AI 應用程式中登入後重試' };
  }

  try {
    const redirectUri = chrome.identity.getRedirectURL('callback');

    const authUrl = new URL(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    );
    authUrl.searchParams.set('client_id',     CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('scope',         'openid profile email User.Read');
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('prompt',        'select_account');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url:         authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) throw new Error('授權流程已取消');

    const url   = new URL(responseUrl);
    const code  = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      throw new Error(url.searchParams.get('error_description') || oauthError);
    }
    if (!code) throw new Error('未收到授權碼');

    // Exchange code for JWT via XMeet AI backend
    const exchangeUrl =
      `${BACKEND_URL}/api/auth/microsoft/callback` +
      `?code=${encodeURIComponent(code)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&from_extension=true`;

    const res = await fetch(exchangeUrl);
    if (!res.ok) throw new Error(`Token 交換失敗 (${res.status})`);

    const data = await res.json();
    if (!data?.data?.token) throw new Error('回應中無 Token');

    await storeAuth(data.data.token, data.data.user, data.data.expires_in ?? 3600);
    return { success: true };

  } catch (err) {
    console.error('[XMeet AI] Login error:', err);
    // Graceful fallback: open the app
    await chrome.tabs.create({ url: `${BACKEND_URL}/` });
    return { success: false, error: String(err) };
  }
}

// ── Recording badge ───────────────────────────────────────────────────────────

async function updateBadge(): Promise<void> {
  const auth = await getStoredAuth();
  if (!auth) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/meetings?status=recording&limit=1`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } }
    );
    if (!res.ok) return;

    const data = await res.json();
    const count: number = (data?.data as unknown[])?.length ?? 0;

    if (count > 0) {
      chrome.action.setBadgeText({ text: '●' });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // network error — silently skip
  }
}

// Poll every 30 s for active recordings
chrome.alarms.create('check-recordings', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-recordings') updateBadge();
});

// Initial badge sync on extension startup
updateBadge();
