import './content.css';

// ── Platform detection ────────────────────────────────────────────────────────

function detectPlatform(): string | null {
  const host = window.location.hostname;
  if (host.includes('teams.microsoft.com')) return 'Microsoft Teams';
  if (host.includes('zoom.us'))             return 'Zoom';
  if (host.includes('meet.google.com'))     return 'Google Meet';
  if (host.includes('webex.com'))           return 'Webex';
  return null;
}

function isInMeeting(): boolean {
  const host = window.location.hostname;
  const path = window.location.pathname;

  if (host.includes('teams.microsoft.com')) {
    return (
      document.querySelector('[data-tid="calling-screen"]') !== null ||
      document.querySelector('.ts-calling-screen') !== null ||
      path.includes('/call')
    );
  }
  if (host.includes('zoom.us')) {
    return (
      path.includes('/wc/') ||
      document.querySelector('#wc-container-right') !== null
    );
  }
  if (host.includes('meet.google.com')) {
    // A meet URL is /xxx-yyyy-zzz — at least 5 chars after /
    return path.length > 5 && !path.includes('/landing');
  }
  if (host.includes('webex.com')) {
    return document.querySelector('[data-test="meeting-widget"]') !== null;
  }
  return false;
}

// ── Floating badge ────────────────────────────────────────────────────────────

let badge: HTMLElement | null = null;

function createBadge(): void {
  if (badge) return;

  badge = document.createElement('div');
  badge.id = 'xmeet-ai-badge';
  badge.innerHTML = `
    <div class="xmeet-inner">
      <span class="xmeet-dot"></span>
      <span class="xmeet-logo">X</span>
      <span class="xmeet-name">XMeet AI</span>
      <button class="xmeet-btn" data-action="open">開啟</button>
    </div>
  `;

  document.body.appendChild(badge);

  badge.querySelector('[data-action="open"]')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_RECORDING' });
  });

  makeDraggable(badge);
}

function removeBadge(): void {
  badge?.remove();
  badge = null;
}

// ── Draggable helper ──────────────────────────────────────────────────────────

function makeDraggable(el: HTMLElement): void {
  let dragging = false;
  let ox = 0, oy = 0, left = 0, bottom = 0;

  el.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    dragging = true;
    ox = e.clientX;
    oy = e.clientY;
    left   = el.offsetLeft;
    bottom = parseInt(el.style.bottom || '80', 10);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    el.style.left   = `${left + (e.clientX - ox)}px`;
    el.style.right  = 'auto';
    el.style.bottom = `${bottom - (e.clientY - oy)}px`;
  });

  document.addEventListener('mouseup', () => { dragging = false; });
}

// ── SPA-aware observer ────────────────────────────────────────────────────────

function startObserving(): void {
  const platform = detectPlatform();
  if (!platform) return;

  const check = () => {
    isInMeeting() ? createBadge() : removeBadge();
  };

  check();

  // DOM mutations (e.g. Teams SPA navigation)
  new MutationObserver(check).observe(document.body, {
    childList: true,
    subtree:   true,
  });

  // URL polling for pushState-based SPAs
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      check();
    }
  }, 1_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}
