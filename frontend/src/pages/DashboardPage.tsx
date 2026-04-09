import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMeetings, MeetingListItem } from '../hooks/useMeetings';
import { MEETING_MODES } from '../types';
import api from '../services/api';

const MODE_ICON: Record<string, string> = Object.fromEntries(
  MEETING_MODES.map(m => [m.id, m.icon])
);

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  recording:  { label: '錄音中', cls: 'bg-red-100 text-red-600' },
  processing: { label: '處理中', cls: 'bg-amber-100 text-amber-600' },
  completed:  { label: '已完成', cls: 'bg-green-100 text-green-600' },
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.round((e - s) / 60000);
  if (mins < 60) return `${mins} 分鐘`;
  return `${Math.floor(mins / 60)} 小時 ${mins % 60} 分鐘`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `今天 ${time}`;
  if (isYesterday) return `昨天 ${time}`;
  return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) + ' ' + time;
}

// ============================================================
// iOS-style swipe-to-delete card
// ============================================================
const DELETE_BTN_WIDTH = 80;
const FULL_DELETE_RATIO = 0.45;

interface MeetingCardProps {
  meeting: MeetingListItem;
  onClick: () => void;
  onDelete: (id: string) => void;
  onSwipeOpen: () => void;
  forceClose: boolean;
  // Batch selection
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

const MeetingCard: React.FC<MeetingCardProps> = ({
  meeting, onClick, onDelete, onSwipeOpen, forceClose,
  selectMode, selected, onToggleSelect,
}) => {
  const status = STATUS_STYLE[meeting.status] || STATUS_STYLE.completed;
  const containerRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHorizontalRef = useRef<boolean | null>(null);

  React.useEffect(() => {
    if (forceClose && isOpen) { setOffsetX(0); setIsOpen(false); }
  }, [forceClose, isOpen]);

  // Reset swipe when entering select mode
  React.useEffect(() => {
    if (selectMode) { setOffsetX(0); setIsOpen(false); }
  }, [selectMode]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (selectMode || meeting.isShared) return;
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    isDraggingRef.current = false;
    isHorizontalRef.current = null;
  }, [selectMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (selectMode) return;
    const t = e.touches[0];
    const dx = t.clientX - startXRef.current;
    const dy = t.clientY - startYRef.current;
    if (isHorizontalRef.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }
    if (!isHorizontalRef.current) return;
    e.preventDefault();
    isDraggingRef.current = true;
    const base = isOpen ? -DELETE_BTN_WIDTH : 0;
    let newOffset = base + dx;
    if (newOffset > 0) newOffset = newOffset * 0.2;
    setOffsetX(newOffset);
  }, [isOpen, selectMode]);

  const handleTouchEnd = useCallback(() => {
    if (selectMode || !isDraggingRef.current) return;
    const cardWidth = containerRef.current?.offsetWidth || 320;
    if (offsetX < -(cardWidth * FULL_DELETE_RATIO)) {
      setRemoving(true);
      setOffsetX(-cardWidth);
      setTimeout(() => onDelete(meeting.id), 350);
      return;
    }
    if (offsetX < -(DELETE_BTN_WIDTH * 0.4)) {
      setOffsetX(-DELETE_BTN_WIDTH);
      setIsOpen(true);
      onSwipeOpen();
    } else {
      setOffsetX(0);
      setIsOpen(false);
    }
  }, [offsetX, meeting.id, onDelete, onSwipeOpen, selectMode]);

  const handleDeleteClick = useCallback(() => {
    const cardWidth = containerRef.current?.offsetWidth || 320;
    setRemoving(true);
    setOffsetX(-cardWidth);
    setTimeout(() => onDelete(meeting.id), 350);
  }, [meeting.id, onDelete]);

  const handleCardClick = useCallback(() => {
    if (selectMode) { onToggleSelect(meeting.id); return; }
    if (isOpen) { setOffsetX(0); setIsOpen(false); return; }
    onClick();
  }, [isOpen, onClick, selectMode, meeting.id, onToggleSelect]);

  const isAnimating = !isDraggingRef.current || removing;
  const transition = isAnimating ? 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl"
      style={{
        transition: removing ? 'max-height 0.3s 0.15s ease-out, opacity 0.25s ease-out, margin 0.3s 0.15s ease-out' : undefined,
        maxHeight: removing ? 0 : 200,
        opacity: removing ? 0 : 1,
        marginBottom: removing ? 0 : undefined,
      }}
    >
      {/* Delete action background */}
      {!selectMode && (
        <div className="absolute inset-0 flex items-stretch justify-end">
          <button onClick={handleDeleteClick}
            className="flex flex-col items-center justify-center text-white font-semibold text-xs gap-1 min-h-[auto] min-w-[auto]"
            style={{ width: Math.max(DELETE_BTN_WIDTH, Math.abs(Math.min(offsetX, 0))), background: '#E5484D', transition }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            刪除
          </button>
        </div>
      )}

      {/* Foreground card */}
      <div
        style={{ transform: selectMode ? 'none' : `translateX(${offsetX}px)`, transition }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button onClick={handleCardClick}
          className={`w-full text-left p-4 bg-white border shadow-sm flex items-center gap-3 ${
            selected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100'
          }`}
          style={{ borderRadius: !selectMode && offsetX < 0 ? '16px 0 0 16px' : '16px' }}>

          {/* Checkbox in select mode */}
          {selectMode && (
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
            }`}>
              {selected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{MODE_ICON[meeting.mode] || '🏢'}</span>
              <h3 className="font-semibold text-gray-800 truncate text-sm">{meeting.title}</h3>
              {meeting.isShared && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 bg-purple-100 text-purple-600">
                  {meeting.sharedBy ? `${meeting.sharedBy} 分享` : '已分享'}
                </span>
              )}
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${status.cls}`}>
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{formatDate(meeting.startTime)}</span>
              {meeting.endTime && <span>· {formatDuration(meeting.startTime, meeting.endTime)}</span>}
              {meeting.hasSummary && (
                <span className="text-indigo-500 font-medium ml-auto">AI 摘要</span>
              )}
            </div>
            {meeting.snippetText && (
              <p className="text-xs text-gray-500 line-clamp-1 leading-relaxed mt-1.5">{meeting.snippetText}</p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};

// ============================================================
// Empty state
// ============================================================
const EmptyDashboard: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mb-6">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">開始你的第一次會議記錄</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        錄製會議或上傳音檔，AI 將自動產生逐字稿與智慧摘要
      </p>
      <div className="flex gap-3">
        <button onClick={() => navigate('/record')}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
          style={{ background: 'var(--primary)', boxShadow: '0 4px 12px rgba(91,95,230,0.3)' }}>
          開始錄音
        </button>
        <button onClick={() => navigate('/upload')}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          上傳音檔
        </button>
      </div>
    </div>
  );
};

// ============================================================
// Dashboard page
// ============================================================
const DashboardPage: React.FC = () => {
  const { meetings, loading, error, refetch } = useMeetings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') || '';
  const [localSearch, setLocalSearch] = useState(queryFromUrl);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Batch selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/api/meetings/${id}`);
      refetch();
    } catch (err: any) {
      console.warn('刪除失敗:', err.message);
    } finally {
      setDeleting(null);
    }
  }, [refetch]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    // Inline filter to avoid dependency on `filtered` (declared after this hook)
    const list = localSearch.trim()
      ? meetings.filter(m => m.title.toLowerCase().includes(localSearch.toLowerCase())
          || (m.snippetText && m.snippetText.toLowerCase().includes(localSearch.toLowerCase())))
      : meetings;
    const allIds = list.map(m => m.id);
    setSelectedIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  }, [meetings, localSearch]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`確定要刪除 ${selectedIds.size} 個會議嗎？\n刪除後無法復原。`)) return;
    setBatchDeleting(true);
    try {
      await api.post('/api/meetings/batch-delete', { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      setSelectMode(false);
      refetch();
    } catch (err: any) {
      console.warn('批量刪除失敗:', err.message);
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedIds, refetch]);

  const filtered = useMemo(() => {
    if (!localSearch.trim()) return meetings;
    const q = localSearch.toLowerCase();
    return meetings.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.snippetText && m.snippetText.toLowerCase().includes(q))
    );
  }, [meetings, localSearch]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  if (meetings.length === 0) {
    return <EmptyDashboard />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {selectMode ? (
          <>
            <button onClick={exitSelectMode}
              className="text-sm text-gray-500 hover:text-gray-700 transition font-medium min-h-[auto]">
              取消
            </button>
            <span className="text-sm font-semibold text-gray-700">
              已選取 {selectedIds.size} 個
            </span>
            <button onClick={selectAll}
              className="text-sm font-medium min-h-[auto]"
              style={{ color: 'var(--primary)' }}>
              {selectedIds.size === filtered.length ? '取消全選' : '全選'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-800">我的會議</h1>
            <div className="flex gap-2">
              {meetings.length > 1 && (
                <button onClick={() => setSelectMode(true)}
                  className="px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  選取
                </button>
              )}
              <button onClick={() => navigate('/record')}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                style={{ background: 'var(--primary)' }}>
                + 新錄音
              </button>
            </div>
          </>
        )}
      </div>

      {/* Search (mobile-visible) */}
      {!selectMode && (
        <div className="mb-4 md:hidden">
          <input type="text" placeholder="搜尋會議..." value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
      )}

      {/* Meeting list */}
      <div className="space-y-3">
        {filtered.map(m => (
          <div key={m.id} className={deleting === m.id ? 'pointer-events-none' : ''}>
            <MeetingCard
              meeting={m}
              onClick={() => navigate(`/meeting/${m.id}`)}
              onDelete={handleDelete}
              onSwipeOpen={() => setOpenCardId(m.id)}
              forceClose={openCardId !== m.id && openCardId !== null}
              selectMode={selectMode}
              selected={selectedIds.has(m.id)}
              onToggleSelect={toggleSelect}
            />
          </div>
        ))}
        {filtered.length === 0 && localSearch && (
          <p className="text-center text-sm text-gray-400 py-8">找不到符合「{localSearch}」的會議</p>
        )}
      </div>

      {/* Batch delete bottom bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 md:pl-[252px]"
          style={{ paddingBottom: 'calc(16px + var(--sab))', background: 'rgba(255,255,255,0.95)', borderTop: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          <button onClick={handleBatchDelete} disabled={batchDeleting}
            className="w-full max-w-3xl mx-auto flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: '#E5484D' }}>
            {batchDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                刪除中...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                刪除 {selectedIds.size} 個會議
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
