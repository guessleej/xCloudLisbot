import './popup.css';
import { getStoredAuth, clearAuth } from '../shared/auth';
import type { ExtMeeting } from '../shared/types';

const BACKEND_URL: string = process.env.BACKEND_URL || '';

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $  = (id: string) => document.getElementById(id) as HTMLElement;
const show = (id: string) => $(id).classList.remove('hidden');
const hide = (id: string) => $(id).classList.add('hidden');

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const auth = await getStoredAuth();
  if (!auth) {
    renderAuthGate();
  } else {
    renderMainView(auth.user.name, auth.user.email);
    loadMeetings(auth.accessToken);
    checkCurrentTab();
  }
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

function renderAuthGate(): void {
  show('auth-gate');
  hide('main-view');

  $('btn-login').addEventListener('click', async () => {
    const btn = $('btn-login') as HTMLButtonElement;
    btn.disabled    = true;
    btn.textContent = '登入中…';

    const result = await chrome.runtime.sendMessage({ type: 'LOGIN' }) as
      { success: boolean; error?: string };

    if (result?.success) {
      location.reload();
    } else {
      btn.disabled    = false;
      btn.innerHTML   = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        使用 Microsoft 帳號登入`;
      // Only show error toast if it's not a "go to app" fallback message
      if (result?.error && !result.error.includes('應用程式')) {
        toast('登入失敗，請重試', 'error');
      }
    }
  });

  $('link-open-app').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'OPEN_APP' });
  });
}

// ── Main view ─────────────────────────────────────────────────────────────────

function renderMainView(name: string, email: string): void {
  hide('auth-gate');
  show('main-view');

  const initial = name ? name[0].toUpperCase() : (email ? email[0].toUpperCase() : 'U');
  $('user-avatar').textContent  = initial;
  $('menu-name').textContent    = name  || '—';
  $('menu-email').textContent   = email || '—';

  // Avatar dropdown
  $('avatar-wrap').addEventListener('click', (e) => {
    e.stopPropagation();
    $('avatar-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', () => $('avatar-menu').classList.add('hidden'));

  // Open full app
  $('btn-open-app').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_APP' });
  });

  // Quick actions
  $('btn-record').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_RECORDING' });
    window.close();
  });
  $('btn-upload').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_UPLOAD' });
    window.close();
  });
  $('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: `${BACKEND_URL}/` });
    window.close();
  });
  $('btn-view-all').addEventListener('click', () => {
    chrome.tabs.create({ url: `${BACKEND_URL}/` });
    window.close();
  });
  $('btn-record-now').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_RECORDING' });
    window.close();
  });

  // Logout
  $('btn-logout').addEventListener('click', async () => {
    await clearAuth();
    location.reload();
  });
}

// ── Active meeting detection ──────────────────────────────────────────────────

async function checkCurrentTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const hosts = ['teams.microsoft.com', 'zoom.us', 'meet.google.com', 'webex.com'];
    if (hosts.some(h => tab.url!.includes(h))) show('meeting-banner');
  } catch { /* permission not granted for this tab */ }
}

// ── Recent meetings ───────────────────────────────────────────────────────────

async function loadMeetings(token: string): Promise<void> {
  const list = $('meetings-list');

  try {
    const res = await fetch(`${BACKEND_URL}/api/meetings?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);

    const data  = await res.json() as { data?: ExtMeeting[] };
    const items: ExtMeeting[] = data.data ?? [];

    if (items.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <p>尚無會議記錄</p>
          <p class="empty-hint">開始錄音或上傳音檔來建立第一筆記錄</p>
        </div>`;
      return;
    }

    list.innerHTML = items.map(m => `
      <a href="${BACKEND_URL}/meeting/${m.id}" target="_blank" class="meeting-row">
        <span class="status-dot ${m.status}"></span>
        <div class="meeting-info">
          <div class="meeting-title">${esc(m.title || '未命名會議')}</div>
          <div class="meeting-meta">${relTime(m.created_at)}</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>
    `).join('');

  } catch {
    list.innerHTML = `
      <div class="empty">
        <p class="err">無法載入會議資料</p>
        <button id="btn-retry" class="link-btn">重試</button>
      </div>`;
    $('btn-retry')?.addEventListener('click', () => {
      list.innerHTML = '<div class="loading"><div class="spinner"></div><span>載入中…</span></div>';
      loadMeetings(token);
    });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  if (d === 1) return '昨天';
  if (d < 7)   return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toast(msg: string, type: 'error' | 'success' = 'success'): void {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3_000);
}

init();
