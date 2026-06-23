import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Upload, RefreshCw, MoreHorizontal, FolderClosed,
  Mic, FileText, Search, X, ChevronDown, ChevronRight,
  Trash2, CalendarDays, Radio, Bot, Check, Loader2, Video,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFolders } from '../contexts/FolderContext';
import { Meeting, CalendarEvent } from '../types';
import { listCalendarEvents, scheduleEventBot, removeEventBot } from '../services/calendar';
import RecallBotModal from '../components/RecallBotModal';
import { Card, Badge, Button, EmptyState, Spinner } from '../components/ui';

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

// ── Score (heuristic) ───────────────────────────────────────────
function calcScore(m: Meeting): number | null {
  if (m.status === 'recording' || m.status === 'idle') return null;
  const hash = m.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (m.status === 'completed') return 67 + (hash % 28);   // 67–94
  if (m.status === 'processing') return 50 + (hash % 20);  // 50–69
  return null;
}

// ── Meeting thumbnail ───────────────────────────────────────────
const MeetingThumb: React.FC<{ meeting: Meeting }> = ({ meeting }) => {
  const src = meeting.source?.toLowerCase() || 'recording';
  const isTeams = src === 'teams';
  const isMeet  = src === 'meet';
  return (
    <div className="relative w-12 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-stone-100 flex items-center justify-center">
      {isTeams ? (
        <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: '#5059C9' }}>T</div>
      ) : isMeet ? (
        <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: '#00897B' }}>G</div>
      ) : (
        <Mic size={15} strokeWidth={1.75} className="text-stone-400" />
      )}
    </div>
  );
};

// ── Filter pill ────────────────────────────────────────────────
const FilterPill: React.FC<{
  label: string; active?: boolean; onClick: () => void; onClear?: () => void;
}> = ({ label, active, onClick, onClear }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs border transition-colors ${
      active
        ? 'border-teal-600 text-teal-700 bg-teal-50'
        : 'border-stone-200 text-stone-600 bg-white hover:border-stone-300 hover:bg-stone-50'
    }`}
  >
    <span>{label}</span>
    {active && onClear
      ? <X size={11} strokeWidth={1.75} onClick={e => { e.stopPropagation(); onClear(); }} />
      : <ChevronDown size={11} strokeWidth={1.75} />}
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
         className="absolute right-0 top-full mt-1 w-44 bg-white border border-stone-200 rounded-lg shadow-pop z-30 py-1 fade-in"
         onClick={e => e.stopPropagation()}>
      <button
        onMouseEnter={() => setSub(true)}
        onMouseLeave={() => setSub(false)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-stone-700 hover:bg-stone-50 transition-colors relative"
      >
        <span className="flex items-center gap-2">
          <FolderClosed size={13} strokeWidth={1.75} className="text-stone-400" />
          移至文件夾
        </span>
        <ChevronRight size={12} strokeWidth={1.75} className="text-stone-400" />
        {sub && (
          <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-stone-200 rounded-lg shadow-pop py-1">
            {meeting.folder && (
              <button onClick={() => { onAssign(null); onClose(); }}
                      className="w-full px-3 py-1.5 text-xs text-left text-stone-500 hover:bg-stone-50 italic">
                移除文件夾
              </button>
            )}
            {folders.map(f => (
              <button key={f} onClick={() => { onAssign(f); onClose(); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-stone-50 transition-colors ${
                        meeting.folder === f ? 'text-teal-700 font-medium' : 'text-stone-700'
                      }`}>
                {meeting.folder === f && <span className="w-1 h-1 rounded-full bg-teal-600" />}
                {f}
              </button>
            ))}
          </div>
        )}
      </button>
      <div className="my-1 border-t border-stone-100" />
      <button onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
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
  <Card className="overflow-hidden mb-4">
    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
          {icon}
        </div>
        <span className="text-sm font-semibold text-stone-800">{title}</span>
      </div>
      {action}
    </div>
    {children}
  </Card>
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
      className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
        scheduled ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" strokeWidth={1.75} /> : scheduled ? <Check size={12} strokeWidth={1.75} /> : <Bot size={12} strokeWidth={1.75} />}
      {busy ? '排程中…' : scheduled ? 'bot 已排程' : '讓 bot 加入'}
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
  const [showFolderDrop, setShowFolderDrop]   = useState(false);
  const [openMenuId, setOpenMenuId]           = useState<string | null>(null);
  const [showRecall, setShowRecall]           = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // Open the online-meeting (recall bot) modal when arriving via the sidebar action.
  useEffect(() => {
    if (searchParams.get('compose') === 'online') {
      setShowRecall(true);
      setSearchParams(p => { p.delete('compose'); return p; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ── Fetch calendar events for today ──────────────────────────
  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
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
  const greeting  = nowHour < 12 ? '早安' : nowHour < 18 ? '午安' : '晚安';
  const subtitle  = calLoading
    ? '正在整理今天的會議…'
    : calConnected
      ? `今天有 ${calEvents.length} 場會議${total ? ` · 共 ${total} 份報告` : ''}`
      : '連接行事曆，讓 AI 助理自動加入並記錄你的線上會議';

  const isOngoing = (evt: CalendarEvent) => {
    const now = Date.now();
    return new Date(evt.startTime).getTime() <= now && new Date(evt.endTime).getTime() >= now;
  };

  return (
    <div className="h-full overflow-y-auto bg-stone-50" onClick={() => { setOpenMenuId(null); setShowFolderDrop(false); }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12">

        {/* ── Greeting ──────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {greeting}，{firstName} 👋
          </h1>
          <p className="text-sm text-stone-500 mt-1">{subtitle}</p>
          {fetchError && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-100">
              無法連線至後端，請稍後重試
            </span>
          )}
        </div>

        {/* ── Upcoming meetings ──────────────────────────── */}
        <SectionCard
          icon={<CalendarDays size={16} strokeWidth={1.75} />}
          title="即將召開的會議"
          action={
            <button onClick={() => navigate('/calendar')}
                    className="text-xs text-teal-700 font-medium hover:text-teal-800 flex items-center gap-1">
              日曆 <ChevronRight size={13} strokeWidth={1.75} />
            </button>
          }
        >
          {calLoading ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-stone-400">
              <Spinner size={15} /> 載入行事曆…
            </div>
          ) : calEvents.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-stone-400">{calConnected ? '今天沒有排定的會議' : '尚未連接行事曆'}</p>
              <button onClick={() => navigate('/calendar')}
                      className="mt-2 text-xs text-teal-700 font-medium hover:text-teal-800">
                {calConnected ? '查看日曆 →' : '連結 Outlook 行事曆 →'}
              </button>
            </div>
          ) : (
            <div>
              {calEvents.map((evt, idx) => {
                const ongoing = isOngoing(evt);
                return (
                  <div key={evt.id}
                       className={`flex items-center gap-4 px-5 py-3.5 ${idx !== calEvents.length - 1 ? 'border-b border-stone-100' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{evt.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-stone-400">
                          {fmtCalTime(evt.startTime)}–{fmtCalTime(evt.endTime)}
                        </span>
                        {ongoing && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                            進行中
                          </span>
                        )}
                      </div>
                    </div>
                    {evt.meetingUrl ? (
                      <CalBotToggle event={evt} onToggle={handleToggleBot} />
                    ) : (
                      <Button variant="primary" size="sm" icon={<Radio size={12} strokeWidth={1.75} />} onClick={() => navigate('/record')}>
                        錄製
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ── Recent reports ─────────────────────────────── */}
        <SectionCard
          icon={<FileText size={16} strokeWidth={1.75} />}
          title="最近的報告"
          action={
            <button onClick={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }}
                    className="text-xs text-teal-700 font-medium hover:text-teal-800 flex items-center gap-1">
              查看全部 <ChevronRight size={13} strokeWidth={1.75} />
            </button>
          }
        >
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 flex-wrap"
               onClick={e => e.stopPropagation()}>
            <div className="relative">
              <Search size={13} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜尋報告…"
                className="h-8 pl-8 pr-3 rounded-full text-xs border border-stone-200 bg-white text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 w-40 transition-colors"
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
                <div className="absolute top-[calc(100%+4px)] left-0 w-44 bg-white border border-stone-200 rounded-lg shadow-pop z-20 py-1 fade-in">
                  {folders.map(f => (
                    <button key={f}
                            onClick={() => { setFolderFilter(f); setSearchParams({ folder: f }); setShowFolderDrop(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-stone-50 text-left transition-colors ${
                              folderFilter === f ? 'text-teal-700 font-medium' : 'text-stone-700'
                            }`}>
                      <FolderClosed size={12} strokeWidth={1.75} className="flex-shrink-0" /> {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Video size={13} strokeWidth={1.75} />} onClick={() => setShowRecall(true)}>
                線上會議
              </Button>
              <button onClick={() => fetchMeetings(true)} disabled={loading}
                      aria-label="重新整理"
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 disabled:opacity-50 transition-colors">
                <RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Meeting list */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <Spinner size={20} />
              <p className="text-sm text-stone-400">載入中…</p>
            </div>
          ) : filtered.length === 0 ? (
            (folderFilter || searchQuery) ? (
              <EmptyState
                icon={<FileText size={26} strokeWidth={1.75} />}
                title="沒有符合條件的報告"
                description="試著清除篩選條件"
                action={<Button variant="secondary" size="sm" onClick={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }}>清除篩選</Button>}
              />
            ) : (
              <EmptyState
                icon={<FileText size={26} strokeWidth={1.75} />}
                title="尚無會議記錄"
                description="開始錄音、加入線上會議或上傳音檔以產生報告"
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" size="md" icon={<Mic size={14} strokeWidth={1.75} />} onClick={() => navigate('/record')}>開始錄音</Button>
                    <Button variant="secondary" size="md" icon={<Upload size={14} strokeWidth={1.75} />} onClick={() => navigate('/upload')}>上傳音檔</Button>
                  </div>
                }
              />
            )
          ) : (
            <div>
              {groups.map(({ label, items }) => (
                <div key={label}>
                  <div className="px-5 py-2 bg-stone-50 border-b border-stone-100">
                    <span className="text-xs font-medium text-stone-500">{label}</span>
                  </div>

                  {items.map((m, idx) => {
                    const score = calcScore(m);
                    return (
                      <div
                        key={m.id}
                        onClick={() => navigate(`/meeting/${m.id}`)}
                        className={`group relative flex items-center gap-4 px-5 py-3.5 border-l-2 border-transparent transition-colors hover:bg-stone-50 hover:border-teal-600 cursor-pointer ${
                          idx !== items.length - 1 ? 'border-b border-b-stone-100' : ''
                        }`}
                      >
                        <MeetingThumb meeting={m} />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">
                            {m.title || '未命名會議'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {m.folder && (
                              <Badge tone="neutral">
                                <FolderClosed size={10} strokeWidth={1.75} /> {m.folder}
                              </Badge>
                            )}
                            {!m.folder && (
                              <button
                                onClick={e => { e.stopPropagation(); setOpenMenuId(m.id); }}
                                className="text-xs text-stone-400 hover:text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                + 添加到文件夾
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 min-w-[130px]">
                          <p className="text-xs text-stone-500">{fmtDate(m.createdAt)}</p>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            {score !== null && <Badge tone="accent">{score} 分</Badge>}
                            {m.status === 'recording' && (
                              <Badge tone="error">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> 錄音中
                              </Badge>
                            )}
                            {m.status === 'processing' && <Badge tone="warning">處理中</Badge>}
                          </div>
                        </div>

                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenMenuId(id => id === m.id ? null : m.id)}
                            aria-label="更多選項"
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 transition-all"
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

              {hasMore && (
                <div className="flex flex-col items-center gap-1.5 py-5 border-t border-stone-100">
                  <span className="text-xs text-stone-400">已顯示 {meetings.length} / {total} 筆</span>
                  <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => fetchMeetings(false)}>
                    {loadingMore ? '載入中…' : '載入更多'}
                  </Button>
                </div>
              )}
              {!hasMore && meetings.length > 0 && (
                <p className="text-center text-xs text-stone-300 py-3 border-t border-stone-100">
                  共 {total} 筆，已全部載入
                </p>
              )}
            </div>
          )}
        </SectionCard>

      </div>

      {showRecall && (
        <RecallBotModal
          onClose={() => setShowRecall(false)}
          onCreated={(meetingId) => navigate(`/meeting/${meetingId}`)}
        />
      )}
    </div>
  );
};

export default DashboardPage;
