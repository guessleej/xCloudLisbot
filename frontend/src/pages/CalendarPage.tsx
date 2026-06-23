import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Mic, Calendar, Link2,
  Users, MapPin, ExternalLink, RefreshCw, AlertCircle, Bot, Check, WifiOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CalendarEvent } from '../types';
import {
  getCalendarStatus, getConnectUrl, listCalendarEvents, scheduleEventBot, removeEventBot,
} from '../services/calendar';
import { Button, Card, EmptyState, Spinner, IconButton, useToast } from '../components/ui';

// ── Helpers ────────────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// Local calendar day (YYYY-MM-DD). Must NOT use toISOString() — that returns the
// UTC day, which for UTC+8 users is off by one before 08:00, mis-selecting the day
// and misaligning event dots / the backend date query.
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const fmtDuration = (start: string, end: string) => {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins} 分鐘`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
};

const isToday = (d: Date) => toDateStr(d) === toDateStr(new Date());

// ── Mini calendar ──────────────────────────────────────────────
const MiniCalendar: React.FC<{
  selected: string;
  onSelect: (d: string) => void;
  eventDates: Set<string>;
}> = ({ selected, onSelect, eventDates }) => {
  const [viewing, setViewing] = useState(() => {
    const d = new Date(selected);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year  = viewing.getFullYear();
  const month = viewing.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <IconButton
          onClick={() => setViewing(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          aria-label="上個月"
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <span className="text-sm font-semibold text-stone-900">
          {year} 年 {MONTHS[month]}
        </span>
        <IconButton
          onClick={() => setViewing(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          aria-label="下個月"
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </IconButton>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-xs text-stone-400 py-1">{w}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = toDateStr(day);
          const isSelected = ds === selected;
          const hasEvent   = eventDates.has(ds);
          const _isToday   = isToday(day);

          return (
            <button
              key={i}
              onClick={() => onSelect(ds)}
              aria-label={ds}
              aria-pressed={isSelected}
              className={`relative mx-auto w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 ${
                isSelected
                  ? 'bg-teal-700 text-white font-semibold'
                  : _isToday
                  ? 'text-teal-700 font-semibold hover:bg-teal-50'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {day.getDate()}
              {hasEvent && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
      <div className="mt-3 pt-3 border-t border-stone-100">
        <button
          onClick={() => { const d = toDateStr(new Date()); onSelect(d); setViewing(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }}
          className="w-full text-center text-xs text-stone-400 hover:text-stone-600 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
        >
          回到今天
        </button>
      </div>
    </Card>
  );
};

// ── Event card ─────────────────────────────────────────────────
const EventCard: React.FC<{
  event: CalendarEvent;
  onRecord: (event: CalendarEvent) => void;
  onToggleBot: (event: CalendarEvent, next: boolean) => Promise<void>;
}> = ({ event, onRecord, onToggleBot }) => {
  const [sending, setSending] = useState(false);
  const scheduled = !!event.botScheduled;
  const isOngoing = (() => {
    const now = Date.now();
    return new Date(event.startTime).getTime() <= now && new Date(event.endTime).getTime() >= now;
  })();
  const toggleBot = async () => {
    setSending(true);
    try { await onToggleBot(event, !scheduled); } finally { setSending(false); }
  };

  return (
    <Card className={`p-4 transition-shadow hover:shadow-pop ${isOngoing ? 'border-teal-300' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Status + time */}
          <div className="flex items-center gap-2 mb-1.5">
            {isOngoing && (
              <span className="flex items-center gap-1 text-xs font-semibold text-teal-700">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                進行中
              </span>
            )}
            <span className="text-xs text-stone-600">
              {fmtTime(event.startTime)} – {fmtTime(event.endTime)}
            </span>
            <span className="text-xs text-stone-400">
              {fmtDuration(event.startTime, event.endTime)}
            </span>
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-stone-900 truncate">{event.title}</p>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {event.attendees?.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-stone-400">
                <Users size={12} strokeWidth={1.75} />
                {event.attendees.length} 人
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1 text-xs text-stone-400 truncate max-w-[160px]">
                <MapPin size={12} strokeWidth={1.75} />
                {event.location}
              </span>
            )}
            {event.meetingUrl && (
              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
              >
                <Link2 size={12} strokeWidth={1.75} /> 加入會議
                <ExternalLink size={11} strokeWidth={1.75} />
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {event.meetingUrl && (
            <Button
              variant={scheduled ? 'primary' : 'secondary'}
              size="sm"
              onClick={toggleBot}
              loading={sending}
              aria-pressed={scheduled}
              icon={!sending && (scheduled ? <Check size={14} strokeWidth={1.75} /> : <Bot size={14} strokeWidth={1.75} />)}
              title={scheduled ? '取消 bot 自動加入此會議' : '讓 AI 機器人加入此線上會議錄音轉錄'}
              className={scheduled ? 'bg-teal-50 text-teal-700 border border-teal-600 hover:bg-teal-100' : ''}
            >
              {sending ? (scheduled ? '取消中…' : '排程中…') : scheduled ? 'bot 已排程' : '讓 bot 加入'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onRecord(event)}
            icon={<Mic size={14} strokeWidth={1.75} />}
          >
            錄音
          </Button>
        </div>
      </div>
    </Card>
  );
};

// ── Connect banner ─────────────────────────────────────────────
const ConnectBanner: React.FC<{ onConnect: () => void; connecting: boolean }> = ({ onConnect, connecting }) => (
  <Card className="p-6 flex flex-col items-center text-center gap-3">
    <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
      <Calendar size={22} strokeWidth={1.75} className="text-teal-700" />
    </div>
    <div>
      <p className="text-sm font-semibold text-stone-900">連接 Outlook 行事曆</p>
      <p className="text-xs text-stone-600 mt-1 max-w-xs leading-relaxed">
        連接後,AI 機器人可自動加入並錄音轉錄你的 Teams / 線上會議,結束後自動生成摘要。
      </p>
    </div>
    <Button
      size="md"
      onClick={onConnect}
      loading={connecting}
      icon={!connecting && <span className="text-sm font-bold">M</span>}
      style={{ background: '#0078D4', color: 'white' }}
      className="hover:opacity-90"
    >
      {connecting ? '連接中…' : '連接 Microsoft 帳戶'}
    </Button>
  </Card>
);

// ── Status-unknown banner (transient failure determining connection) ──
const StatusErrorBanner: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Card className="p-6 flex flex-col items-center text-center gap-3">
    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
      <WifiOff size={22} strokeWidth={1.75} className="text-amber-700" />
    </div>
    <div>
      <p className="text-sm font-semibold text-stone-900">無法確認行事曆連線狀態</p>
      <p className="text-xs text-stone-600 mt-1">伺服器暫時無回應,請稍後重試。</p>
    </div>
    <Button variant="secondary" size="md" onClick={onRetry} icon={<RefreshCw size={14} strokeWidth={1.75} />}>
      重試
    </Button>
  </Card>
);

// ── Main ───────────────────────────────────────────────────────
const CalendarPage: React.FC = () => {
  const navigate   = useNavigate();
  const { getToken } = useAuth();
  const { show } = useToast();

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [connected, setConnected]       = useState(false);
  const [statusError, setStatusError]   = useState(false);  // could not determine connection
  const [loading, setLoading]           = useState(false);
  const [connecting, setConnecting]     = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [notice, setNotice]             = useState('');      // transient success notice
  const [eventDates, setEventDates]     = useState<Set<string>>(new Set());
  const reqIdRef = useRef(0);  // guards against out-of-order fetchEvents responses

  // ── Check connection ──────────────────────────────────────
  // Returns true/false when known, or null when the status call itself failed
  // (transient) — callers must NOT treat null as "not connected".
  const checkConnection = useCallback(async (): Promise<boolean | null> => {
    try {
      const token = await getToken();
      if (!token) return false;
      const s = await getCalendarStatus(token);
      setConnected(s.connected);
      setStatusError(false);
      return s.connected;
    } catch {
      setStatusError(true);
      return null;
    }
  }, [getToken]);

  // ── Fetch events (race-guarded) ────────────────────────────
  const fetchEvents = useCallback(async (date: string) => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setErrMsg('');
    try {
      const token = await getToken();
      const { events: list } = await listCalendarEvents(token, date);
      if (myReq !== reqIdRef.current) return;  // a newer request superseded this one
      setEvents(list);
      setEventDates(prev => {
        const next = new Set(prev);
        list.forEach(e => next.add(toDateStr(new Date(e.startTime))));
        return next;
      });
    } catch (err: any) {
      if (myReq !== reqIdRef.current) return;
      setErrMsg(err?.message ?? '無法載入行事曆');
      setEvents([]);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [getToken]);

  // ── Mount: handle OAuth round-trip result + initial load ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cal = params.get('calendar');
    if (cal) {
      window.history.replaceState({}, '', window.location.pathname);
      if (cal === 'connected') setNotice('行事曆已連接');
      else if (cal === 'error') { setErrMsg('行事曆連接失敗,請再試一次。'); }
    }
    // Authoritative status decides both connected state and whether to load events.
    checkConnection().then(ok => { if (ok) fetchEvents(toDateStr(new Date())); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connected) fetchEvents(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-clear the success notice
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Connect Outlook via Recall Calendar V2 (backend OAuth redirect) ──
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const token = await getToken();
      if (!token) { setConnecting(false); return; }
      // Full-page redirect to Microsoft; backend callback returns to /calendar.
      window.location.href = await getConnectUrl(token, 'calendar');
    } catch {
      setErrMsg('連接失敗，請稍後再試。');
      setConnecting(false);
    }
  }, [getToken]);

  // ── Start recording from event ─────────────────────────────
  const handleRecord = useCallback((event: CalendarEvent) => {
    const params = new URLSearchParams({ title: event.title });
    navigate(`/record?${params.toString()}`);
  }, [navigate]);

  // ── Toggle a recall.ai recording bot for a calendar event ──
  const handleToggleBot = useCallback(async (event: CalendarEvent, next: boolean) => {
    const eventId = event.recallEventId || event.id;
    if (!eventId) return;
    setErrMsg('');
    // optimistic
    setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, botScheduled: next } : e)));
    try {
      const token = await getToken();
      if (next) await scheduleEventBot(token, eventId);
      else await removeEventBot(token, eventId);
      show(next ? 'bot 已排程加入此會議' : '已取消 bot 排程', 'success');
    } catch (err: any) {
      // rollback on failure
      setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, botScheduled: !next } : e)));
      const msg = err?.message || (next ? '排程機器人失敗' : '取消排程失敗');
      setErrMsg(msg);
      show(msg, 'error');
    }
  }, [getToken, show]);

  // ── Display date label ─────────────────────────────────────
  const displayDate = (() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const today = toDateStr(new Date());
    const tomorrow = toDateStr(new Date(Date.now() + 86400000));
    if (selectedDate === today) return '今天';
    if (selectedDate === tomorrow) return '明天';
    return `${d.getMonth()+1} 月 ${d.getDate()} 日 ${'日一二三四五六'[d.getDay()]}`;
  })();

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">日曆</h1>
        {connected && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchEvents(selectedDate)}
            disabled={loading}
            icon={<RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />}
          >
            重新整理
          </Button>
        )}
      </div>

      {/* Success notice (e.g. just connected) */}
      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700 mb-4 fade-in">
          <Check size={14} strokeWidth={1.75} className="flex-shrink-0" /> {notice}
        </div>
      )}

      {/* Error (shown regardless of connection state — e.g. connect failure) */}
      {errMsg && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 mb-4">
          <AlertCircle size={14} strokeWidth={1.75} className="flex-shrink-0" /> {errMsg}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 max-w-5xl">
        {/* Left: Mini calendar */}
        <div className="lg:w-64 flex-shrink-0">
          <MiniCalendar
            selected={selectedDate}
            onSelect={setSelectedDate}
            eventDates={eventDates}
          />
        </div>

        {/* Right: Events */}
        <div className="flex-1 min-w-0">
          {!connected ? (
            statusError
              ? <StatusErrorBanner onRetry={() => checkConnection().then(ok => { if (ok) fetchEvents(selectedDate); })} />
              : <ConnectBanner onConnect={handleConnect} connecting={connecting} />
          ) : (
            <>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-stone-900">{displayDate}</h2>
                <span className="text-xs text-stone-400">{selectedDate}</span>
              </div>

              {/* Loading */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Spinner size={22} />
                  <p className="text-xs text-stone-400">載入行事曆...</p>
                </div>
              ) : events.length === 0 ? (
                <EmptyState
                  icon={<Calendar size={32} strokeWidth={1.75} />}
                  title="這天沒有行程"
                  description="選擇其他日期或手動開始錄音"
                  action={
                    <Button size="sm" onClick={() => navigate('/record')} icon={<Mic size={14} strokeWidth={1.75} />}>
                      手動開始錄音
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {events.map(evt => (
                    <EventCard key={evt.id} event={evt} onRecord={handleRecord} onToggleBot={handleToggleBot} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default CalendarPage;
