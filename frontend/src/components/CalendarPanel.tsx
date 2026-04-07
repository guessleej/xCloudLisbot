import React, { useCallback, useEffect, useState } from 'react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { useAuth, msalInstance } from '../contexts/AuthContext';
import { CalendarEvent, CalendarConnection, MeetingConfig, DEFAULT_MEETING_CONFIG } from '../types';

interface CalendarPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onStartMeeting: (cfg: Partial<MeetingConfig>) => void;
}

const CalendarPanel: React.FC<CalendarPanelProps> = ({ isOpen, onClose, onStartMeeting }) => {
  const { getToken } = useAuth();
  const [connections, setConnections] = useState<CalendarConnection[]>([
    { provider: 'google',     connected: false },
    { provider: 'microsoft',  connected: false },
  ]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const backendUrl = process.env.REACT_APP_BACKEND_URL!;

  // 取得行事曆連線狀態
  const fetchConnections = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/calendar/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConnections([
          { provider: 'google',    connected: data.google?.connected ?? false },
          { provider: 'microsoft', connected: data.microsoft?.connected ?? false },
        ]);
      }
    } catch { /* ignore */ }
  }, [backendUrl, getToken]);

  // Silently refresh Microsoft calendar token via MSAL
  const refreshMsCalendarToken = useCallback(async () => {
    try {
      const accounts = msalInstance.getAllAccounts();
      const request = { scopes: ['Calendars.Read'], account: accounts[0] || undefined };
      let tokenResp;
      try {
        tokenResp = await msalInstance.acquireTokenSilent(request);
      } catch {
        // Silent failed — can't refresh without user interaction
        return false;
      }
      if (!tokenResp?.accessToken) return false;
      const appToken = await getToken();
      await fetch(`${backendUrl}/api/auth/calendar/microsoft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
        body: JSON.stringify({ accessToken: tokenResp.accessToken }),
      });
      return true;
    } catch { return false; }
  }, [backendUrl, getToken]);

  // 取得行事曆活動（逐一查詢已連線的 provider）
  const fetchEvents = useCallback(async () => {
    const anyConnected = connections.some((c) => c.connected);
    if (!anyConnected) return;
    setLoading(true);
    try {
      const token = await getToken();
      const allEvents: CalendarEvent[] = [];
      for (const conn of connections) {
        if (!conn.connected) continue;
        const provider = conn.provider;
        const params = new URLSearchParams({ date: selectedDate, provider });
        let res = await fetch(`${backendUrl}/api/calendar/events?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // If Microsoft token expired, try silent refresh and retry
        if (res.ok) {
          const data = await res.json();
          if (data.error === 'token_expired' && provider === 'microsoft') {
            const refreshed = await refreshMsCalendarToken();
            if (refreshed) {
              res = await fetch(`${backendUrl}/api/calendar/events?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const retryData = await res.json();
                allEvents.push(...(retryData.events || []));
              }
            }
          } else {
            allEvents.push(...(data.events || []));
          }
        }
      }
      allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setEvents(allEvents);
    } catch { /* ignore */ }
    setLoading(false);
  }, [backendUrl, getToken, connections, selectedDate, refreshMsCalendarToken]);

  useEffect(() => {
    if (isOpen) {
      // Refresh Microsoft token silently when opening calendar
      refreshMsCalendarToken().then(() => fetchConnections());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    fetchEvents();
  }, [connections, selectedDate]);

  const connectGoogle = () => {
    const popup = window.open(`${backendUrl}/api/auth/calendar/google`, 'google_calendar', 'width=500,height=600');
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'calendar_connected' && event.data?.provider === 'google') {
        window.removeEventListener('message', handler);
        fetchConnections();
      }
    };
    window.addEventListener('message', handler);
    // fallback: poll if popup closes without postMessage
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        fetchConnections();
      }
    }, 1000);
  };

  const connectExchange = async () => {
    // Microsoft Calendar: acquireTokenSilent → fallback to interactive
    // Ref: https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token
    const calendarRequest = {
      scopes: ['Calendars.Read'],
      account: msalInstance.getAllAccounts()[0] || undefined,
    };

    try {
      const tokenResp = await msalInstance.acquireTokenSilent(calendarRequest);
      await saveCalendarToken(tokenResp.accessToken);
    } catch (error) {
      // Silent failed → use redirect (works on all devices including mobile)
      // After redirect back, handleRedirectPromise in AuthContext will resolve,
      // but we need to handle the calendar token separately.
      // Store a flag so we know to save the calendar token after redirect.
      sessionStorage.setItem('pending_calendar_connect', '1');
      await msalInstance.acquireTokenRedirect(calendarRequest);
      // Page will redirect — execution stops here
    }
  };

  const saveCalendarToken = async (accessToken: string) => {
    const token = await getToken();
    const res = await fetch(`${backendUrl}/api/auth/calendar/microsoft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accessToken }),
    });
    if (res.ok) {
      await fetchConnections();
    } else {
      alert('連結失敗，請稍後再試。');
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  };

  const isNow = (start: string, end: string) => {
    const now = Date.now();
    return new Date(start).getTime() <= now && now <= new Date(end).getTime();
  };

  const isSoon = (start: string) => {
    const diff = new Date(start).getTime() - Date.now();
    return diff > 0 && diff < 30 * 60 * 1000; // 30 分鐘內
  };

  const anyConnected = connections.some((c) => c.connected);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="w-full sm:w-80 bg-white h-full shadow-2xl border-l border-gray-200 flex flex-col modal-slide-up">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <span className="font-bold text-gray-800">行事曆</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Calendar Connections */}
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          {/* Google Calendar */}
          {(() => {
            const c = connections.find((x) => x.provider === 'google');
            return c?.connected ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-gray-600">Google 日曆</span>
                <span className="text-xs text-gray-400 truncate">{c.email}</span>
              </div>
            ) : (
              <button
                onClick={connectGoogle}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-red-300 hover:bg-red-50 text-sm text-gray-600 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                連結 Google 日曆
              </button>
            );
          })()}

          {/* Exchange / Outlook */}
          {(() => {
            const c = connections.find((x) => x.provider === 'microsoft');
            return c?.connected ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-gray-600">Outlook / Exchange</span>
                <span className="text-xs text-gray-400 truncate">{c.email}</span>
              </div>
            ) : (
              <button
                onClick={connectExchange}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 text-sm text-gray-600 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078d4">
                  <path d="M24 7.5c0-1.13-.89-2.04-2-2.04H2C.89 5.46 0 6.37 0 7.5v9c0 1.13.89 2.04 2 2.04h20c1.11 0 2-.91 2-2.04v-9zm-2 0L12 13.5 2 7.5h20z"/>
                </svg>
                連結 Outlook / Exchange
              </button>
            );
          })()}
        </div>

        {/* Date picker */}
        {anyConnected && (
          <div className="px-4 py-2 border-b border-gray-100">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        )}

        {/* Events List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!anyConnected ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-sm">請先連結行事曆</p>
              <p className="text-xs mt-1">可連結 Google 日曆或 Outlook</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">這天沒有行事曆活動</p>
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className={`p-3 rounded-xl border transition-all ${
                  isNow(evt.startTime, evt.endTime)
                    ? 'border-indigo-300 bg-indigo-50'
                    : isSoon(evt.startTime)
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isNow(evt.startTime, evt.endTime) && (
                        <span className="inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                      )}
                      {isSoon(evt.startTime) && (
                        <span className="text-xs font-semibold text-amber-600">即將開始</span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatTime(evt.startTime)} – {formatTime(evt.endTime)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {evt.provider === 'google' ? '🔴' : '🔵'}
                      </span>
                    </div>
                    <p className="font-medium text-gray-800 text-sm truncate">{evt.title}</p>
                    {evt.attendees.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        👥 {evt.attendees.slice(0, 3).map((a) => a.name || a.email).join('、')}
                        {evt.attendees.length > 3 && ` +${evt.attendees.length - 3}`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      onStartMeeting({
                        title: evt.title,
                        mode: 'meeting',
                      });
                      onClose();
                    }}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 transition"
                  >
                    <span>🎙</span> 錄製
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarPanel;
