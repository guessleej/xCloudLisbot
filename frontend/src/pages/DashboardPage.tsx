import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Upload, RefreshCw, MoreHorizontal, FolderClosed,
  Mic, FileText, Search, X, ChevronDown, ChevronRight,
  Trash2, CalendarDays, Lock, Radio, Bot, Check, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFolders } from '../contexts/FolderContext';
import { Meeting, CalendarEvent } from '../types';
import { listCalendarEvents, scheduleEventBot, removeEventBot } from '../services/calendar';
import CopilotPanel from '../components/CopilotPanel';
import RecallBotModal from '../components/RecallBotModal';

// ── Helpers ────────────────────────────────────────────────────

const padTime = (n: number) => String(n).padStart(2, '0');

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - dd.getTime()) / 86400000);
  const weekday = ['週日','週一','週二','週三','週四','週五','週六'][d.getDay()];
  const hhmm = `${padTime(d.getHours())}:${padTime(d.getMinutes())}`;
  if (diff === 0) return `今天 ${hhmm}`;
  if (diff === 1) return `昨天 ${hhmm}`;
  return `${d.getMonth()+1}月${d.getDate()}日 ${weekday} • ${hhmm}`;
};

const fmtCalTime = (iso: string) => {
  const d = new Date(iso);
  return `${padTime(d.getHours())}:${padTime(d.getMinutes())}`;
};

const groupByTime = (list: Meeting[]) => {
  const now = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo  = new Date(today); weekAgo.setDate(today.getDate() - 6);
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets: Record<string, Meeting[]> = {};
  list.forEach(m => {
    const d = new Date(m.createdAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const label =
      day >= today ? '今天' :
      day >= weekAgo ? '本週' :
      day >= monthAgo ? '本月' :
      `${d.getFullYear()} 年 ${d.getMonth()+1} 月`;
    (buckets[label] ??= []).push(m);
  });

  const order = ['今天','本週','本月'];
  return Object.entries(buckets)
    .sort(([a],[b]) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      return ai !== -1 ? -1 : bi !== -1 ? 1 : b.localeCompare(a);
    })
    .map(([label, items]) => ({ label, items }));
};

// ── XMeet score (heuristic) ─────────────────────────────────────
function calcScore(m: Meeting): number | null {
  if (m.status === 'recording' || m.status === 'idle') return null;
  const hash = m.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (m.status === 'completed') return 67 + (hash % 28);   // 67–94
  if (m.status === 'processing') return 50 + (hash % 20);  // 50–69
  return null;
}

const scoreColor = (s: number) =>
  s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444';

// ── Meeting thumbnail ───────────────────────────────────────────
const MeetingThumb: React.FC<{ meeting: Meeting }> = ({ meeting }) => {
  const src = meeting.source?.toLowerCase() || 'recording';
  const isTeams = src === 'teams';
  const isMeet  = src === 'meet';
  return (
    <div className="relative w-14 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center">
      {isTeams ? (
        <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[13px] font-bold" style={{ background: '#5059C9' }}>T</div>
      ) : isMeet ? (
        <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[13px] font-bold" style={{ background: '#00897B' }}>G</div>
      ) : (
        <Mic size={16} strokeWidth={1.75} className="text-slate-400" />
      )}
      {/* Platform badge */}
      {(isTeams || isMeet) && (
        <div
          className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded text-white text-[8px] font-bold flex items-center justify-center"
          style={{ background: isTeams ? '#5059C9' : '#00897B' }}
        >
          {isTeams ? 'T' : 'G'}
        </div>
      )}
    </div>
  );
};

// ── Folder chip ────────────────────────────────────────────────
const FolderChip: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-slate-500 bg-slate-100 font-medium whitespace-nowrap">
    <FolderClosed size={9} strokeWidth={1.75} /> {label}
    <Lock size={8} strokeWidth={2} className="text-slate-400 ml-0.5" />
  </span>
);

// ── Filter pill ────────────────────────────────────────────────
const FilterPill: React.FC<{
  label: string; active?: boolean; onClick: () => void; onClear?: () => void;
}> = ({ label, active, onClick, onClear }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1 h-7 px-3 rounded-full text-[12px] border transition-colors ${
      active
        ? 'border-[#7B2FFF] text-[#7B2FFF] bg-[#7B2FFF]/[0.07]'
        : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300 hover:bg-slate-50'
    }`}
  >
    <span>{label}</span>
    {active && onClear
      ? <X size={10} strokeWidth={2.5} onClick={e => { e.stopPropagation(); onClear(); }} />
      : <ChevronDown size={10} strokeWidth={2} />}
  </button>
);

// ── Row context menu ───────────────────────────────────────────
const RowMenu: React.FC<{
  meeting: Meeting;
  folders: string[];
  onAssign: (folder: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ meeting, folders, onAssign, onDelete, onClose }) => {
  const [sub, setSub] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref}
         className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1 fade-in"
         onClick={e => e.stopPropagation()}>
      <button
        onMouseEnter={() => setSub(true)}
        onMouseLeave={() => setSub(false)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors relative"
      >
        <span className="flex items-center gap-2">
          <FolderClosed size={13} strokeWidth={1.75} className="text-slate-400" />
          移至文件夾
        </span>
        <ChevronRight size={12} strokeWidth={2} className="text-slate-400" />
        {sub && (
          <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {meeting.folder && (
              <button onClick={() => { onAssign(null); onClose(); }}
                      className="w-full px-3 py-1.5 text-[12px] text-left text-slate-500 hover:bg-slate-50 italic">
                移除文件夾
              </button>
            )}
            {folders.map(f => (
              <button key={f} onClick={() => { onAssign(f); onClose(); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-slate-50 transition-colors ${
                        meeting.folder === f ? 'text-[#7B2FFF] font-medium' : 'text-slate-700'
                      }`}>
                {meeting.folder === f && <span className="w-1 h-1 rounded-full bg-[#7B2FFF]" />}
                {f}
              </button>
            ))}
          </div>
        )}
      </button>
      <div className="my-1 border-t border-slate-100" />
      <button onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-500 hover:bg-red-50 transition-colors">
        <Trash2 size={13} strokeWidth={1.75} /> 刪除
      </button>
    </div>
  );
};

// ── Section card wrapper ────────────────────────────────────────
const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, action, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#7B2FFF]/10 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[14px] font-semibold text-slate-800">{title}</span>
      </div>
      {action}
    </div>
    {children}
  </div>
);

// ── Calendar bot toggle (compact, for upcoming-meeting rows) ────
const CalBotToggle: React.FC<{
  event: CalendarEvent;
  onToggle: (e: CalendarEvent, next: boolean) => Promise<void>;
}> = ({ event, onToggle }) => {
  const [busy, setBusy] = useState(false);
  const scheduled = !!event.botScheduled;
  return (
    <button
      onClick={async (e) => { e.stopPropagation(); setBusy(true); try { await onToggle(event, !scheduled); } finally { setBusy(false); } }}
      disabled={busy}
      aria-pressed={scheduled}
      title={scheduled ? '取消 bot 自動加入此會議' : '讓 AI 機器人加入此線上會議錄音轉錄'}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-50 ${
        scheduled ? 'border-[#00D4FF] bg-[#00D4FF]/10 text-[#0A8BA6]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : scheduled ? <Check size={12} strokeWidth={2.5} /> : <Bot size={12} strokeWidth={2} />}
      {scheduled ? 'bot 已排程' : '讓 bot 加入'}
    </button>
  );
};

// ── Dashboard ──────────────────────────────────────────────────
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getToken, user } = useAuth();
  const { folders } = useFolders();

  const [meetings, setMeetings]           = useState<Meeting[]>([]);
  const [fetchError, setFetchError]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [page, setPage]                   = useState(1);
  const [hasMore, setHasMore]             = useState(false);
  const [total, setTotal]                 = useState(0);
  const [calEvents, setCalEvents]         = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading]       = useState(true);
  const [calConnected, setCalConnected]   = useState(false);
  const [folderFilter, setFolderFilter]   = useState<string | null>(searchParams.get('folder'));
  const [searchQuery, setSearchQuery]     = useState(searchParams.get('q') || '');
  const [copilotOpen, setCopilotOpen]     = useState(true);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [showFolderDrop, setShowFolderDrop]   = useState(false);
  const [openMenuId, setOpenMenuId]           = useState<string | null>(null);
  const [showRecall, setShowRecall]           = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // ── Fetch calendar events for today ──────────────────────────
  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      // Local calendar day (NOT toISOString, which is UTC and off-by-one for UTC+8).
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const { events, connected } = await listCalendarEvents(token, today);
      setCalEvents(events.slice(0, 5));
      setCalConnected(connected);
    } catch {
      // calendar not connected — silently ignore
    } finally {
      setCalLoading(false);
    }
  }, [getToken]);

  // Toggle a recall.ai recording bot for an upcoming online meeting (shared V2 source).
  const handleToggleBot = useCallback(async (evt: CalendarEvent, next: boolean) => {
    const eventId = evt.recallEventId || evt.id;
    if (!eventId) return;
    setCalEvents(prev => prev.map(e => (e.id === evt.id ? { ...e, botScheduled: next } : e)));
    try {
      const token = await getToken();
      if (next) await scheduleEventBot(token, eventId);
      else await removeEventBot(token, eventId);
    } catch {
      setCalEvents(prev => prev.map(e => (e.id === evt.id ? { ...e, botScheduled: !next } : e)));
    }
  }, [getToken]);

  // ── Fetch meetings ────────────────────────────────────────────
  const fetchMeetings = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setPage(1); } else setLoadingMore(true);
    setFetchError(false);
    const nextPage = reset ? 1 : page + 1;
    try {
      const token = await getToken();
      if (!token) { setFetchError(true); return; }
      const res = await fetch(`${backendUrl}/api/meetings?page=${nextPage}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json();
        const payload = body.data ?? body;
        const list: Meeting[] = payload.meetings ?? (Array.isArray(payload) ? payload : []);
        setMeetings(prev => reset ? list : [...prev, ...list]);
        setHasMore(payload.hasMore ?? false);
        setTotal(payload.total ?? list.length);
        if (!reset) setPage(nextPage);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [backendUrl, getToken, page]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMeetings(true); fetchCalendar(); }, [backendUrl, getToken]);

  useEffect(() => {
    setFolderFilter(searchParams.get('folder'));
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const assignFolder = useCallback(async (id: string, folder: string | null) => {
    setMeetings(ms => ms.map(m => m.id === id ? { ...m, folder: folder ?? undefined } : m));
    try {
      const token = await getToken();
      await fetch(`${backendUrl}/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ folder }),
      });
    } catch {}
  }, [backendUrl, getToken]);

  const deleteMeeting = useCallback(async (id: string) => {
    setMeetings(ms => ms.filter(m => m.id !== id));
    try {
      const token = await getToken();
      await fetch(`${backendUrl}/api/meetings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [backendUrl, getToken]);

  const filtered = meetings.filter(m => {
    if (folderFilter && m.folder !== folderFilter) return false;
    if (searchQuery) return m.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });
  const groups = groupByTime(filtered);

  // ── Greeting ──────────────────────────────────────────────────
  const firstName = user?.name?.split(' ')[0] || user?.name || '您';
  const nowHour   = new Date().getHours();
  const greeting  = nowHour < 12 ? '早安' : nowHour < 18 ? '嗨' : '晚安';

  // ── Is event happening now ─────────────────────────────────────
  const isOngoing = (evt: CalendarEvent) => {
    const now = Date.now();
    return new Date(evt.startTime).getTime() <= now && new Date(evt.endTime).getTime() >= now;
  };

  return (
    <div className="flex h-full" onClick={() => { setOpenMenuId(null); setShowFolderDrop(false); }}>
      {/* ── Main content ────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 overflow-y-auto transition-all duration-300 ${copilotExpanded ? 'hidden' : ''}`} style={{ background: '#F1F5F9' }}>
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-10">

          {/* ── Greeting ──────────────────────────────────── */}
          <div className="mb-6">
            <h1 className="text-[24px] font-bold text-slate-900 tracking-tight">
              {greeting} {firstName} 👋
            </h1>
            <p className="text-[14px] text-slate-500 mt-1">這就是您今天會議的進展情況</p>
            {fetchError && (
              <span className="inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">
                無法連線至後端
              </span>
            )}
          </div>

          {/* ── Upcoming meetings ──────────────────────────── */}
          <SectionCard
            icon={<CalendarDays size={16} strokeWidth={1.75} className="text-[#7B2FFF]" />}
            title="即將召開的會議"
            action={
              <button onClick={() => navigate('/calendar')}
                      className="text-[12px] text-[#7B2FFF] font-medium hover:underline flex items-center gap-1">
                日曆 <ChevronRight size={13} strokeWidth={2} />
              </button>
            }
          >
            {calLoading ? (
              <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-slate-400">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 animate-spin" style={{ borderTopColor: '#7B2FFF' }} />
                載入行事曆…
              </div>
            ) : calEvents.length === 0 ? (
              <div className="px-5 py-5 text-center">
                {calConnected ? (
                  <>
                    <p className="text-[13px] text-slate-400">今天沒有排定的會議</p>
                    <button onClick={() => navigate('/calendar')}
                            className="mt-2 text-[12px] text-[#7B2FFF] font-medium hover:underline">
                      查看日曆 →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-slate-400">尚未連接行事曆</p>
                    <button onClick={() => navigate('/calendar')}
                            className="mt-2 text-[12px] text-[#7B2FFF] font-medium hover:underline">
                      連結 Outlook 行事曆 →
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                {calEvents.map((evt, idx) => {
                  const ongoing = isOngoing(evt);
                  return (
                    <div key={evt.id}
                         className={`flex items-center gap-4 px-5 py-3.5 ${idx !== calEvents.length - 1 ? 'border-b border-slate-100' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-800 truncate">{evt.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[12px] text-slate-400">
                            {fmtCalTime(evt.startTime)}–{fmtCalTime(evt.endTime)}
                          </span>
                          {ongoing && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7B2FFF]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7B2FFF] animate-pulse" />
                              進行中
                            </span>
                          )}
                        </div>
                      </div>
                      {evt.meetingUrl ? (
                        <CalBotToggle event={evt} onToggle={handleToggleBot} />
                      ) : (
                        <button
                          onClick={() => navigate('/record')}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold text-white"
                          style={{ background: '#7B2FFF' }}
                        >
                          <Radio size={12} strokeWidth={2} />
                          錄製
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ── Recent reports ─────────────────────────────── */}
          <SectionCard
            icon={<FileText size={16} strokeWidth={1.75} className="text-[#7B2FFF]" />}
            title="最近的報告"
            action={
              <button onClick={() => navigate('/?all=1')}
                      className="text-[12px] text-[#7B2FFF] font-medium hover:underline flex items-center gap-1">
                查看全部 <ChevronRight size={13} strokeWidth={2} />
              </button>
            }
          >
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap"
                 onClick={e => e.stopPropagation()}>
              <div className="relative">
                <Search size={11} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜尋報告…"
                  className="h-7 pl-7 pr-3 rounded-full text-[12px] border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 w-36"
                />
              </div>

              <FilterPill label="全部報告"
                active={!folderFilter && !searchQuery}
                onClick={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }} />

              <div className="relative">
                <FilterPill
                  label={folderFilter || '文件夾'}
                  active={!!folderFilter}
                  onClick={() => setShowFolderDrop(o => !o)}
                  onClear={() => { setFolderFilter(null); setSearchParams(p => { p.delete('folder'); return p; }); }}
                />
                {showFolderDrop && (
                  <div className="absolute top-[calc(100%+4px)] left-0 w-44 bg-white border border-slate-200 rounded-lg shadow-md z-20 py-1 fade-in">
                    {folders.map(f => (
                      <button key={f}
                              onClick={() => { setFolderFilter(f); setSearchParams({ folder: f }); setShowFolderDrop(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-slate-50 text-left transition-colors ${
                                folderFilter === f ? 'text-[#7B2FFF] font-medium' : 'text-slate-700'
                              }`}>
                        <FolderClosed size={12} strokeWidth={1.75} className="flex-shrink-0" /> {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setShowRecall(true)}
                        className="h-7 px-3 flex items-center gap-1 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                  <Bot size={11} strokeWidth={2} /> 線上會議
                </button>
                <button onClick={() => navigate('/upload')}
                        className="h-7 px-3 flex items-center gap-1 rounded-lg text-[12px] font-semibold text-white"
                        style={{ background: '#7B2FFF' }}>
                  <Upload size={11} strokeWidth={2} /> 上傳
                </button>
                <button onClick={() => fetchMeetings(true)} disabled={loading}
                        className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                  <RefreshCw size={12} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Meeting list */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-slate-200 animate-spin" style={{ borderTopColor: '#7B2FFF' }} />
                <p className="text-[13px] text-slate-400">載入中…</p>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                hasFilter={!!(folderFilter || searchQuery)}
                onClear={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }}
                onRecord={() => navigate('/record')}
                onUpload={() => navigate('/upload')}
              />
            ) : (
              <div>
                {groups.map(({ label, items }) => (
                  <div key={label}>
                    {/* Time group label */}
                    <div className="px-5 py-2 bg-slate-50/80 border-b border-slate-100">
                      <span className="text-[11px] font-medium text-slate-500">{label}</span>
                    </div>

                    {items.map((m, idx) => {
                      const score = calcScore(m);
                      return (
                        <div
                          key={m.id}
                          onClick={() => navigate(`/meeting/${m.id}`)}
                          className={`group relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 cursor-pointer ${
                            idx !== items.length - 1 ? 'border-b border-slate-100' : ''
                          }`}
                        >
                          {/* Thumbnail */}
                          <MeetingThumb meeting={m} />

                          {/* Title + folder */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 truncate">
                              {m.title || '未命名會議'}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {m.folder && <FolderChip label={m.folder} />}
                              {!m.folder && (
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(m.id); }}
                                  className="text-[11px] text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  + 添加到文件夾
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Date + score + owner */}
                          <div className="text-right flex-shrink-0 min-w-[140px]">
                            <p className="text-[12px] text-slate-500">{fmtDate(m.createdAt)}</p>
                            <div className="flex items-center justify-end gap-2 mt-1">
                              {score !== null && (
                                <span className="text-[12px] font-semibold" style={{ color: scoreColor(score) }}>
                                  {score} xCloud Lisbot 評分
                                </span>
                              )}
                              {m.status === 'recording' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  錄音中
                                </span>
                              )}
                              {m.status === 'processing' && (
                                <span className="text-[11px] text-amber-500 font-medium">處理中</span>
                              )}
                            </div>
                            {user?.name && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                由 {user.name} 擁有
                              </p>
                            )}
                          </div>

                          {/* More menu */}
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setOpenMenuId(id => id === m.id ? null : m.id)}
                              className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 transition-all"
                            >
                              <MoreHorizontal size={14} strokeWidth={1.75} />
                            </button>
                            {openMenuId === m.id && (
                              <RowMenu
                                meeting={m}
                                folders={folders}
                                onAssign={f => assignFolder(m.id, f)}
                                onDelete={() => deleteMeeting(m.id)}
                                onClose={() => setOpenMenuId(null)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="flex flex-col items-center gap-1 py-5 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400">已顯示 {meetings.length} / {total} 筆</span>
                    <button
                      onClick={() => fetchMeetings(false)}
                      disabled={loadingMore}
                      className="h-8 px-4 text-[12px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                      {loadingMore && <RefreshCw size={12} strokeWidth={1.75} className="animate-spin" />}
                      {loadingMore ? '載入中…' : '載入更多'}
                    </button>
                  </div>
                )}
                {!hasMore && meetings.length > 0 && (
                  <p className="text-center text-[11px] text-slate-300 py-3 border-t border-slate-100">
                    共 {total} 筆，已全部載入
                  </p>
                )}
              </div>
            )}
          </SectionCard>

        </div>
      </div>{/* end main content */}

      {/* ── Copilot panel ────────────────────────────────────── */}
      {copilotOpen && (
        <div
          className={`flex-shrink-0 border-l overflow-hidden transition-all duration-300 ${
            copilotExpanded ? 'fixed inset-0 z-40' : 'hidden lg:flex flex-col'
          }`}
          style={{
            width: copilotExpanded ? '100%' : '320px',
            borderColor: 'rgba(255,255,255,0.07)',
            background: '#0B0F23',
          }}
        >
          <CopilotPanel
            expanded={copilotExpanded}
            onToggleExpand={() => setCopilotExpanded(e => !e)}
            onClose={() => setCopilotOpen(false)}
          />
        </div>
      )}

      {showRecall && (
        <RecallBotModal
          onClose={() => setShowRecall(false)}
          onCreated={(meetingId) => navigate(`/meeting/${meetingId}`)}
        />
      )}
    </div>
  );
};

// ── Empty state ─────────────────────────────────────────────────
const EmptyState: React.FC<{
  hasFilter: boolean; onClear: () => void; onRecord: () => void; onUpload: () => void;
}> = ({ hasFilter, onClear, onRecord, onUpload }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
      <FileText size={22} strokeWidth={1.5} className="text-slate-400" />
    </div>
    {hasFilter ? (
      <>
        <p className="text-[14px] font-medium text-slate-700 mb-1">沒有符合條件的報告</p>
        <p className="text-[12px] text-slate-400 mb-5">試著清除篩選條件</p>
        <button onClick={onClear}
                className="h-8 px-4 rounded-lg text-[12px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          清除篩選
        </button>
      </>
    ) : (
      <>
        <p className="text-[14px] font-medium text-slate-700 mb-1">尚無會議記錄</p>
        <p className="text-[12px] text-slate-400 mb-6">開始錄音或上傳音檔以產生報告</p>
        <div className="flex gap-3">
          <button onClick={onRecord}
                  className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white"
                  style={{ background: '#7B2FFF' }}>
            開始錄音
          </button>
          <button onClick={onUpload}
                  className="h-9 px-4 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            上傳音檔
          </button>
        </div>
      </>
    )}
  </div>
);

export default DashboardPage;
