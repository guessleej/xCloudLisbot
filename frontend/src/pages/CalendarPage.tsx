import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Mic, Calendar, Link2,
  Users, MapPin, ExternalLink, RefreshCw, AlertCircle, Bot, Loader2, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CalendarEvent } from '../types';
import {
  getCalendarStatus, getConnectUrl, listCalendarEvents, scheduleEventBot, removeEventBot,
} from '../services/calendar';

// ── Helpers ────────────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

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
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewing(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <span className="text-[13px] font-semibold text-slate-800">
          {year} 年 {MONTHS[month]}
        </span>
        <button
          onClick={() => setViewing(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[11px] text-slate-400 py-1">{w}</div>
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
              className={`relative mx-auto w-7 h-7 flex items-center justify-center rounded-full text-[12px] transition-colors ${
                isSelected
                  ? 'text-white font-semibold'
                  : _isToday
                  ? 'text-[#00D4FF] font-semibold hover:bg-[#00D4FF]/10'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              style={isSelected ? { background: '#00D4FF' } : undefined}
            >
              {day.getDate()}
              {hasEvent && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00D4FF]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => { const d = toDateStr(new Date()); onSelect(d); setViewing(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }}
          className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          回到今天
        </button>
      </div>
    </div>
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
    <div className={`bg-white rounded-xl border p-4 transition-shadow hover:shadow-sm ${
      isOngoing ? 'border-[#00D4FF]/40' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Status + time */}
          <div className="flex items-center gap-2 mb-1.5">
            {isOngoing && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#00D4FF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
                進行中
              </span>
            )}
            <span className="text-[12px] text-slate-500">
              {fmtTime(event.startTime)} – {fmtTime(event.endTime)}
            </span>
            <span className="text-[11px] text-slate-400">
              {fmtDuration(event.startTime, event.endTime)}
            </span>
          </div>

          {/* Title */}
          <p className="text-[14px] font-semibold text-slate-900 truncate">{event.title}</p>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {event.attendees?.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Users size={11} strokeWidth={1.75} />
                {event.attendees.length} 人
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[160px]">
                <MapPin size={11} strokeWidth={1.75} />
                {event.location}
              </span>
            )}
            {event.meetingUrl && (
              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-[#00D4FF] hover:opacity-75 transition-opacity"
              >
                <Link2 size={11} strokeWidth={1.75} /> 加入會議
                <ExternalLink size={10} strokeWidth={2} />
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {event.meetingUrl && (
            <button
              onClick={toggleBot}
              disabled={sending}
              title={scheduled ? '取消 bot 自動加入此會議' : '讓 AI 機器人加入此線上會議錄音轉錄'}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-50 ${
                scheduled
                  ? 'border-[#00D4FF] bg-[#00D4FF]/10 text-[#0A8BA6]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {sending
                ? <Loader2 size={12} className="animate-spin" />
                : scheduled ? <Check size={12} strokeWidth={2.5} /> : <Bot size={12} strokeWidth={2} />}
              {scheduled ? 'bot 已排程' : '讓 bot 加入'}
            </button>
          )}
          <button
            onClick={() => onRecord(event)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            <Mic size={12} strokeWidth={2.25} /> 錄音
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Connect banner ─────────────────────────────────────────────
const ConnectBanner: React.FC<{ onConnect: () => void; connecting: boolean }> = ({ onConnect, connecting }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center text-center gap-3">
    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
      <Calendar size={22} strokeWidth={1.5} className="text-blue-500" />
    </div>
    <div>
      <p className="text-[14px] font-semibold text-slate-800">連接 Outlook 行事曆</p>
      <p className="text-[12px] text-slate-500 mt-1">
        連接後可直接從行事曆事件啟動錄音
      </p>
    </div>
    <button
      onClick={onConnect}
      disabled={connecting}
      className="flex items-center gap-2 h-9 px-5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50"
      style={{ background: '#0078D4', color: 'white' }}
    >
      {connecting
        ? <><RefreshCw size={13} strokeWidth={2} className="animate-spin" /> 連接中...</>
        : <><span className="text-[13px] font-bold">M</span> 連接 Microsoft 帳戶</>
      }
    </button>
  </div>
);

// ── Main ───────────────────────────────────────────────────────
const CalendarPage: React.FC = () => {
  const navigate   = useNavigate();
  const { getToken } = useAuth();

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [connected, setConnected]       = useState(false);
  const [loading, setLoading]           = useState(false);
  const [connecting, setConnecting]     = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [eventDates, setEventDates]     = useState<Set<string>>(new Set());

  // ── Check connection ──────────────────────────────────────
  const checkConnection = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return false;
      const s = await getCalendarStatus(token);
      setConnected(s.connected);
      return s.connected;
    } catch { return false; }
  }, [getToken]);

  // ── Fetch events ──────────────────────────────────────────
  const fetchEvents = useCallback(async (date: string) => {
    setLoading(true);
    setErrMsg('');
    try {
      const token = await getToken();
      const { events: list } = await listCalendarEvents(token, date);
      setEvents(list);
      // Mark dates with events
      setEventDates(prev => {
        const next = new Set(prev);
        list.forEach(e => next.add(e.startTime.split('T')[0]));
        return next;
      });
    } catch (err: any) {
      setErrMsg(err?.message ?? '無法載入行事曆');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    checkConnection().then(ok => { if (ok) fetchEvents(selectedDate); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connected) fetchEvents(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect Outlook via Recall Calendar V2 (backend OAuth redirect) ──
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const token = await getToken();
      if (!token) { setConnecting(false); return; }
      // Full-page redirect to Microsoft; the backend callback returns to /settings.
      window.location.href = await getConnectUrl(token);
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
    try {
      const token = await getToken();
      if (next) await scheduleEventBot(token, eventId);
      else await removeEventBot(token, eventId);
      setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, botScheduled: next } : e)));
    } catch (err: any) {
      setErrMsg(err?.message || (next ? '排程機器人失敗' : '取消排程失敗'));
    }
  }, [getToken]);

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
    <div className="min-h-full" style={{ background: '#F1F5F9' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">日曆</h1>
        {connected && (
          <button
            onClick={() => fetchEvents(selectedDate)}
            disabled={loading}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            重新整理
          </button>
        )}
      </div>

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
            <ConnectBanner onConnect={handleConnect} connecting={connecting} />
          ) : (
            <>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-[16px] font-semibold text-slate-800">{displayDate}</h2>
                <span className="text-[12px] text-slate-400">{selectedDate}</span>
              </div>

              {/* Error */}
              {errMsg && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-600 mb-4">
                  <AlertCircle size={13} className="flex-shrink-0" /> {errMsg}
                </div>
              )}

              {/* Loading */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <RefreshCw size={20} strokeWidth={1.75} className="text-slate-300 animate-spin" />
                  <p className="text-[12px] text-slate-400">載入行事曆...</p>
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <Calendar size={32} strokeWidth={1.25} className="text-slate-200 mb-1" />
                  <p className="text-[14px] font-medium text-slate-500">這天沒有行程</p>
                  <p className="text-[12px] text-slate-400">選擇其他日期或手動開始錄音</p>
                  <button
                    onClick={() => navigate('/record')}
                    className="mt-4 flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold"
                    style={{ background: '#00D4FF', color: '#0A0E27' }}
                  >
                    <Mic size={12} strokeWidth={2.25} /> 手動開始錄音
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {events
                    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                    .map(evt => (
                      <EventCard key={evt.id} event={evt} onRecord={handleRecord} onToggleBot={handleToggleBot} />
                    ))
                  }
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
