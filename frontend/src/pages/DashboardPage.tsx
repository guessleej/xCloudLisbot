import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Upload, RefreshCw, MoreHorizontal, FolderClosed,
  Mic, FileText, Search, X, ChevronDown, ChevronRight, Trash2, Bot,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFolders } from '../contexts/FolderContext';
import { Meeting } from '../types';
import CopilotPanel from '../components/CopilotPanel';

// ── Mock data (shown when API is unavailable) ──────────────────
const MOCK: Meeting[] = [
  {
    id: 'm1', userId: 'u1', title: '研華企業解決方案合作討論', createdAt: new Date().toISOString(),
    startTime: new Date().toISOString(), status: 'completed',
    source: 'teams', participants: 4, folder: '客戶會議', transcripts: [],
  },
  {
    id: 'm2', userId: 'u1', title: '馬祖專案週進度同步', createdAt: new Date().toISOString(),
    startTime: new Date().toISOString(), status: 'completed',
    source: 'teams', participants: 2, folder: '計劃會議', transcripts: [],
  },
  {
    id: 'm3', userId: 'u1', title: 'LINE Public System Development',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    startTime: new Date(Date.now() - 86400000).toISOString(), status: 'completed',
    source: 'meet', participants: 5, transcripts: [],
  },
  {
    id: 'm4', userId: 'u1', title: '每日摘要',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    startTime: new Date(Date.now() - 86400000).toISOString(), status: 'completed',
    source: 'teams', participants: 1, transcripts: [],
  },
  {
    id: 'm5', userId: 'u1', title: '【線上會議】昇恆昌品牌策略規劃',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    startTime: new Date(Date.now() - 2 * 86400000).toISOString(), status: 'completed',
    source: 'meet', participants: 3, folder: '銷售討論', transcripts: [],
  },
  {
    id: 'm6', userId: 'u1', title: '產品路線圖腦力激盪',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    startTime: new Date(Date.now() - 3 * 86400000).toISOString(), status: 'completed',
    source: 'recording', participants: 6, folder: '腦力激盪', transcripts: [],
  },
];

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
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日${weekday} ${hhmm}`;
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
    const label = day >= today ? '今天' : day >= weekAgo ? '本週' : day >= monthAgo ? '本月' : `${d.getFullYear()} 年 ${d.getMonth()+1} 月`;
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

// ── Source badge ───────────────────────────────────────────────
const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
  const s = source?.toLowerCase() || 'recording';
  if (s === 'teams')
    return <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold" style={{ background: '#5059C9' }}>T</div>;
  if (s === 'meet')
    return <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold" style={{ background: '#00897B' }}>G</div>;
  return (
    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-slate-100">
      <Mic size={14} strokeWidth={1.75} className="text-slate-500" />
    </div>
  );
};

// ── Folder chip ────────────────────────────────────────────────
const FolderChip: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-500 bg-slate-100 font-medium whitespace-nowrap">
    <FolderClosed size={10} strokeWidth={1.75} /> {label}
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
        ? 'border-[#00D4FF] text-[#00D4FF] bg-[#00D4FF]/[0.08]'
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
      {/* Assign folder */}
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

        {/* Submenu */}
        {sub && (
          <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {meeting.folder && (
              <button
                onClick={() => { onAssign(null); onClose(); }}
                className="w-full px-3 py-1.5 text-[12px] text-left text-slate-500 hover:bg-slate-50 italic"
              >
                移除文件夾
              </button>
            )}
            {folders.map(f => (
              <button
                key={f}
                onClick={() => { onAssign(f); onClose(); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-slate-50 transition-colors ${
                  meeting.folder === f ? 'text-[#00D4FF] font-medium' : 'text-slate-700'
                }`}
              >
                {meeting.folder === f && <span className="w-1 h-1 rounded-full bg-[#00D4FF]" />}
                {f}
              </button>
            ))}
          </div>
        )}
      </button>

      <div className="my-1 border-t border-slate-100" />

      {/* Delete */}
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={13} strokeWidth={1.75} /> 刪除
      </button>
    </div>
  );
};

// ── Dashboard ──────────────────────────────────────────────────
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getToken } = useAuth();
  const { folders } = useFolders();

  const [meetings, setMeetings]       = useState<Meeting[]>([]);
  const [useMock, setUseMock]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [tab, setTab]                 = useState<'reports' | 'incomplete'>('reports');
  const [folderFilter, setFolderFilter] = useState<string | null>(searchParams.get('folder'));
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [showFolderDrop, setShowFolderDrop] = useState(false);
  const [openMenuId, setOpenMenuId]   = useState<string | null>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) { setMeetings(MOCK); setUseMock(true); return; }
      const res = await fetch(`${backendUrl}/api/meetings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.data ?? data.meetings ?? data;
        const list: Meeting[] = Array.isArray(raw) ? raw : [];
        setMeetings(list);
        setUseMock(false);
      } else {
        setMeetings(MOCK); setUseMock(true);
      }
    } catch {
      setMeetings(MOCK); setUseMock(true);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  // Sync URL params → state
  useEffect(() => {
    setFolderFilter(searchParams.get('folder'));
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  // Assign folder (local + API)
  const assignFolder = useCallback(async (id: string, folder: string | null) => {
    setMeetings(ms => ms.map(m => m.id === id ? { ...m, folder: folder ?? undefined } : m));
    if (!useMock) {
      try {
        const token = await getToken();
        await fetch(`${backendUrl}/api/meetings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ folder }),
        });
      } catch {}
    }
  }, [backendUrl, getToken, useMock]);

  // Delete meeting (local + API)
  const deleteMeeting = useCallback(async (id: string) => {
    setMeetings(ms => ms.filter(m => m.id !== id));
    if (!useMock) {
      try {
        const token = await getToken();
        await fetch(`${backendUrl}/api/meetings/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
  }, [backendUrl, getToken, useMock]);

  // Filtered + grouped
  const filtered = meetings.filter(m => {
    if (folderFilter && m.folder !== folderFilter) return false;
    if (tab === 'incomplete' && m.status === 'completed') return false;
    if (searchQuery) return m.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });
  const groups = groupByTime(filtered);

  const fmtRefresh = `${padTime(lastRefresh.getHours())}:${padTime(lastRefresh.getMinutes())}`;

  return (
    <div className="flex h-full" onClick={() => { setOpenMenuId(null); setShowFolderDrop(false); }}>
      {/* Main content */}
      <div className={`flex-1 min-w-0 overflow-y-auto transition-all duration-300 ${copilotExpanded ? 'hidden' : ''}`}>
      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">報告</h1>
            {useMock && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                預覽模式
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-400 hidden sm:block">上次刷新 {fmtRefresh}</span>
            <button onClick={() => fetchMeetings()} disabled={loading}
                    className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => navigate('/upload')}
                    className="h-8 px-3 flex items-center gap-1.5 rounded-md text-[12px] font-semibold"
                    style={{ background: '#00D4FF', color: '#0A0E27' }}>
              <Upload size={13} strokeWidth={2} /> 上傳
            </button>
            {/* Copilot toggle (mobile + desktop without panel) */}
            <button
              onClick={() => setCopilotOpen(o => !o)}
              className={`h-8 w-8 flex items-center justify-center rounded-md border transition-colors ${
                copilotOpen
                  ? 'border-[#7B2FFF] bg-[#7B2FFF]/10 text-purple-400'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
              title="搜尋助手"
            >
              <Bot size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex border-b border-slate-200 mb-4">
          {(['reports','incomplete'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-1 pb-2.5 mr-5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                      tab === t ? 'border-[#00D4FF] text-[#00D4FF]' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}>
              {t === 'reports' ? '報告' : '未完成'}
              {t === 'incomplete' && (
                <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {meetings.filter(m => m.status !== 'completed').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-5" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <Search size={12} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="按報告標題篩選..."
              className="h-7 pl-7 pr-3 rounded-full text-[12px] border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 w-44"
            />
          </div>

          <FilterPill label="所有報告" active={!folderFilter && !searchQuery} onClick={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }} />

          {/* Folder filter */}
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
                            folderFilter === f ? 'text-[#00D4FF] font-medium' : 'text-slate-700'
                          }`}>
                    <FolderClosed size={12} strokeWidth={1.75} className="flex-shrink-0" /> {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-slate-200 animate-spin" style={{ borderTopColor: '#00D4FF' }} />
            <p className="text-[13px] text-slate-400">載入中...</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasFilter={!!(folderFilter || searchQuery)}
            onClear={() => { setFolderFilter(null); setSearchQuery(''); setSearchParams({}); }}
            onRecord={() => navigate('/record')}
            onUpload={() => navigate('/upload')}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-visible">
            {/* Header row */}
            <div className="hidden md:grid grid-cols-[36px_1fr_180px_148px_40px] gap-4 px-4 py-2.5 border-b border-slate-100">
              <div />
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">報告</span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">日期和時間</span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">文件夾</span>
              <div />
            </div>

            {groups.map(({ label, items }) => (
              <div key={label}>
                <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100">
                  <span className="text-[11px] font-medium text-slate-500">{label}</span>
                </div>
                {items.map((m, idx) => (
                  <div
                    key={m.id}
                    onClick={() => !useMock && navigate(`/meeting/${m.id}`)}
                    className={`group relative transition-colors hover:bg-slate-50 ${
                      !useMock ? 'cursor-pointer' : 'cursor-default'
                    } ${idx !== items.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    {/* Desktop */}
                    <div className="hidden md:grid grid-cols-[36px_1fr_180px_148px_40px] gap-4 items-center px-4 py-3">
                      <SourceBadge source={m.source} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 truncate">{m.title || '未命名會議'}</p>
                        {(m.participants ?? 0) > 0 && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{m.participants} 位參與者</p>
                        )}
                      </div>
                      <span className="text-[12px] text-slate-500">{fmtDate(m.createdAt)}</span>
                      <div className="min-w-0">
                        {m.folder ? <FolderChip label={m.folder} /> : null}
                      </div>
                      {/* More button */}
                      <div className="relative flex justify-end" onClick={e => e.stopPropagation()}>
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

                    {/* Mobile */}
                    <div className="md:hidden flex items-center gap-3 px-4 py-3">
                      <SourceBadge source={m.source} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-slate-900 truncate">{m.title || '未命名會議'}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(m.createdAt)}</p>
                      </div>
                      {m.folder && <FolderChip label={m.folder} />}
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenuId(id => id === m.id ? null : m.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
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
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>{/* end main content */}

      {/* Copilot panel — right side */}
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
    </div>
  );
};

// ── Empty state ────────────────────────────────────────────────
const EmptyState: React.FC<{
  hasFilter: boolean; onClear: () => void; onRecord: () => void; onUpload: () => void;
}> = ({ hasFilter, onClear, onRecord, onUpload }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
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
                  className="h-9 px-4 rounded-lg text-[13px] font-semibold"
                  style={{ background: '#00D4FF', color: '#0A0E27' }}>
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
