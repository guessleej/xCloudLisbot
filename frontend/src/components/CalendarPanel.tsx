import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, X, Mic } from 'lucide-react';
import { useAuth, msalInstance } from '../contexts/AuthContext';
import { CalendarEvent, CalendarConnection, MeetingConfig, DEFAULT_MEETING_CONFIG } from '../types';

interface CalendarPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onStartMeeting: (cfg: Partial<MeetingConfig>) => void;
}

const CalendarPanel: React.FC<CalendarPanelProps> = ({ isOpen, onClose, onStartMeeting }) => {
  const { getToken, user } = useAuth();
  const [connections, setConnections] = useState<CalendarConnection[]>([
    { provider: 'google',     connected: false },
    { provider: 'microsoft',  connected: false },
  ]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

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
    } catch (err: any) {
      console.warn('行事曆連線狀態載入失敗:', err.message);
    }
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
    } catch (err: any) {
      console.warn('行事曆事件載入失敗:', err.message);
    }
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
  }, [fetchEvents, selectedDate]);

  // Cleanup popup listeners on unmount
  useEffect(() => {
    return () => {
      if (popupCheckRef.current) clearInterval(popupCheckRef.current);
      if (popupHandlerRef.current) window.removeEventListener('message', popupHandlerRef.current);
    };
  }, []);

  const connectGoogle = async () => {
    // Clean up any previous popup listeners
    if (popupCheckRef.current) clearInterval(popupCheckRef.current);
    if (popupHandlerRef.current) window.removeEventListener('message', popupHandlerRef.current);

    // Get auth token so the calendar login endpoint can verify the user
    const token = await getToken();
    const res = await fetch(`${backendUrl}/api/auth/calendar/google`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
    });
    // The endpoint returns a 307 redirect — extract the Location URL and open as popup
    const redirectUrl = res.headers.get('Location') || `${backendUrl}/api/auth/calendar/google`;
    const popup = window.open(redirectUrl, 'google_calendar', 'width=500,height=600');
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'calendar_connected' && event.data?.provider === 'google') {
        window.removeEventListener('message', handler);
        if (popupCheckRef.current) clearInterval(popupCheckRef.current);
        popupHandlerRef.current = null;
        popupCheckRef.current = null;
        fetchConnections();
      }
    };
    popupHandlerRef.current = handler;
    window.addEventListener('message', handler);
    // fallback: poll if popup closes without postMessage
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        popupHandlerRef.current = null;
        popupCheckRef.current = null;
        fetchConnections();
      }
    }, 1000);
    popupCheckRef.current = checkClosed;
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
      console.warn('Calendar 連結失敗');
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-stone-900/40 fade-in" onClick={onClose}>
      {/* Modal */}
      <div className="bg-white rounded-t-lg sm:rounded-lg border border-stone-200 w-full sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] flex flex-col modal-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} strokeWidth={1.75} className="text-stone-500" />
            <span className="text-base font-semibold text-stone-900">行事曆</span>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors min-h-0 min-w-0">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Calendar Connections */}
        <div className="px-5 py-3 border-b border-stone-200 space-y-2">
          {/* Google Calendar */}
          {(() => {
            const c = connections.find((x) => x.provider === 'google');
            return c?.connected ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full" />
                <span className="text-stone-700">Google 日曆</span>
                <span className="text-xs text-stone-500 truncate">{c.email}</span>
              </div>
            ) : (
              <button
                onClick={connectGoogle}
                className="w-full flex items-center gap-2 h-9 px-3 border border-stone-300 rounded-md hover:bg-stone-50 text-sm text-stone-700 transition-colors min-h-0 min-w-0"
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
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full" />
                <span className="text-stone-700">Outlook / Exchange</span>
                <span className="text-xs text-stone-500 truncate">{c.email}</span>
              </div>
            ) : (
              <button
                onClick={connectExchange}
                className="w-full flex items-center gap-2 h-9 px-3 border border-stone-300 rounded-md hover:bg-stone-50 text-sm text-stone-700 transition-colors min-h-0 min-w-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0078d4">
                  <path d="M24 7.5c0-1.13-.89-2.04-2-2.04H2C.89 5.46 0 6.37 0 7.5v9c0 1.13.89 2.04 2 2.04h20c1.11 0 2-.91 2-2.04v-9zm-2 0L12 13.5 2 7.5h20z"/>
                </svg>
                連結 Outlook / Exchange
              </button>
            );
          })()}
        </div>

        {/* Date picker */}
        {anyConnected && (
          <div className="px-5 py-3 border-b border-stone-200">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-stone-300 rounded-md focus:outline-none focus:border-stone-500 transition-colors"
            />
          </div>
        )}

        {/* Events List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {!anyConnected ? (
            <div className="text-center py-12 text-stone-400">
              <Calendar size={28} strokeWidth={1.5} className="mx-auto mb-3" />
              <p className="text-sm text-stone-500">請先連結行事曆</p>
              <p className="text-xs mt-1 text-stone-400">可連結 Google 日曆或 Outlook</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-stone-400">
              <p className="text-sm">這天沒有行事曆活動</p>
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className={`p-3 rounded-md border transition-colors ${
                  isNow(evt.startTime, evt.endTime)
                    ? 'border-teal-300 bg-teal-50/40'
                    : isSoon(evt.startTime)
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isNow(evt.startTime, evt.endTime) && (
                        <span className="inline-block w-1.5 h-1.5 bg-teal-600 rounded-full animate-pulse" />
                      )}
                      {isSoon(evt.startTime) && (
                        <span className="text-[11px] font-semibold text-amber-700">即將開始</span>
                      )}
                      <span className="text-xs text-stone-500">
                        {formatTime(evt.startTime)} – {formatTime(evt.endTime)}
                      </span>
                    </div>
                    <p className="font-medium text-stone-900 text-sm truncate">{evt.title}</p>
                    {evt.attendees.length > 0 && (
                      <p className="text-xs text-stone-500 mt-0.5 truncate">
                        {evt.attendees.slice(0, 3).map((a) => a.name || a.email).join('、')}
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
                    className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2.5 bg-stone-900 text-white text-xs rounded-md hover:bg-stone-800 transition-colors min-h-0 min-w-0"
                  >
                    <Mic size={11} strokeWidth={1.75} />
                    錄製
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
