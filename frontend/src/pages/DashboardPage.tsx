import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, Upload, Trash2, Check, Sparkles, Users, FileAudio, Plus } from 'lucide-react';
import { useMeetings, MeetingListItem } from '../hooks/useMeetings';
import api from '../services/api';

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  recording:  { label: '錄音中', cls: 'bg-red-50 text-red-700 border border-red-100' },
  processing: { label: '處理中', cls: 'bg-amber-50 text-amber-700 border border-amber-100' },
  completed:  { label: '已完成', cls: 'bg-stone-100 text-stone-600 border border-stone-200' },
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
// iOS-style swipe-to-delete list item (dense list style)
// ============================================================
const DELETE_BTN_WIDTH = 72;
const FULL_DELETE_RATIO = 0.45;

interface MeetingItemProps {
  meeting: MeetingListItem;
  onClick: () => void;
  onDelete: (id: string) => void;
  onSwipeOpen: () => void;
  forceClose: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  isLast: boolean;
}

const MeetingItem: React.FC<MeetingItemProps> = ({
  meeting, onClick, onDelete, onSwipeOpen, forceClose,
  selectMode, selected, onToggleSelect, isLast,
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
  }, [selectMode, meeting.isShared]);

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
      setTimeout(() => onDelete(meeting.id), 300);
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
    setTimeout(() => onDelete(meeting.id), 300);
  }, [meeting.id, onDelete]);

  const handleCardClick = useCallback(() => {
    if (selectMode) { onToggleSelect(meeting.id); return; }
    if (isOpen) { setOffsetX(0); setIsOpen(false); return; }
    onClick();
  }, [isOpen, onClick, selectMode, meeting.id, onToggleSelect]);

  const isAnimating = !isDraggingRef.current || removing;
  const transition = isAnimating ? 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        transition: removing ? 'max-height 0.25s 0.1s ease-out, opacity 0.2s ease-out' : undefined,
        maxHeight: removing ? 0 : 200,
        opacity: removing ? 0 : 1,
      }}
    >
      {/* Delete action background */}
      {!selectMode && (
        <div className="absolute inset-0 flex items-stretch justify-end">
          <button
            onClick={handleDeleteClick}
            className="flex flex-col items-center justify-center text-white text-xs gap-1 min-h-0 min-w-0"
            style={{
              width: Math.max(DELETE_BTN_WIDTH, Math.abs(Math.min(offsetX, 0))),
              background: '#B91C1C',
              transition,
            }}
          >
            <Trash2 size={16} strokeWidth={1.75} />
            刪除
          </button>
        </div>
      )}

      {/* Foreground item */}
      <div
        style={{ transform: selectMode ? 'none' : `translateX(${offsetX}px)`, transition }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={handleCardClick}
          className={`w-full text-left px-4 py-3.5 bg-white flex items-center gap-3 transition-colors min-h-0 min-w-0 ${
            !isLast ? 'border-b border-stone-200' : ''
          } ${selected ? 'bg-teal-50/40' : 'hover:bg-stone-50'}`}
        >
          {/* Checkbox in select mode */}
          {selectMode && (
            <div
              className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                selected ? 'bg-stone-900 border-stone-900' : 'border-stone-300 bg-white'
              }`}
            >
              {selected && <Check size={12} strokeWidth={3} className="text-white" />}
            </div>
          )}

          {/* Icon */}
          <div className="w-9 h-9 rounded-md bg-stone-100 flex items-center justify-center flex-shrink-0">
            <FileAudio size={16} strokeWidth={1.75} className="text-stone-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-medium text-stone-900 truncate text-[14px]">{meeting.title}</h3>
              {meeting.isShared && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-stone-100 text-stone-600 border border-stone-200 inline-flex items-center gap-1">
                  <Users size={10} strokeWidth={1.75} />
                  {meeting.sharedBy ? meeting.sharedBy : '分享'}
                </span>
              )}
              <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${status.cls}`}>
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-stone-500">
              <span>{formatDate(meeting.startTime)}</span>
              {meeting.endTime && <span>· {formatDuration(meeting.startTime, meeting.endTime)}</span>}
              {meeting.hasSummary && (
                <span className="inline-flex items-center gap-1 text-teal-700 font-medium ml-auto">
                  <Sparkles size={11} strokeWidth={1.75} />
                  AI 摘要
                </span>
              )}
            </div>
            {meeting.snippetText && (
              <p className="text-[12px] text-stone-400 line-clamp-1 leading-relaxed mt-1">{meeting.snippetText}</p>
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
      <div className="w-12 h-12 bg-stone-100 rounded-md flex items-center justify-center mb-5">
        <Mic size={22} strokeWidth={1.5} className="text-stone-500" />
      </div>
      <h2 className="text-lg font-semibold text-stone-900 mb-2">開始你的第一次會議記錄</h2>
      <p className="text-sm text-stone-500 mb-6 max-w-sm">
        錄製會議或上傳音檔，AI 將自動產生逐字稿與摘要
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => navigate('/record')}
          className="h-9 px-4 rounded-md text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 transition-colors inline-flex items-center gap-2 min-h-0"
        >
          <Mic size={16} strokeWidth={1.75} />
          開始錄音
        </button>
        <button
          onClick={() => navigate('/upload')}
          className="h-9 px-4 rounded-md text-sm font-medium bg-white text-stone-900 border border-stone-300 hover:bg-stone-50 transition-colors inline-flex items-center gap-2 min-h-0"
        >
          <Upload size={16} strokeWidth={1.75} />
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
      <div className="max-w-[760px] mx-auto px-4 py-8">
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-stone-100 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[760px] mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-100 rounded-md text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (meetings.length === 0) {
    return <EmptyDashboard />;
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {selectMode ? (
          <>
            <button
              onClick={exitSelectMode}
              className="text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium min-h-0 min-w-0"
            >
              取消
            </button>
            <span className="text-sm font-semibold text-stone-900">
              已選取 {selectedIds.size} 個
            </span>
            <button
              onClick={selectAll}
              className="text-sm font-medium text-stone-900 min-h-0 min-w-0"
            >
              {selectedIds.size === filtered.length ? '取消全選' : '全選'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold text-stone-900 tracking-tight">會議記錄</h1>
            <div className="flex gap-2">
              {meetings.length > 1 && (
                <button
                  onClick={() => setSelectMode(true)}
                  className="h-9 px-3 rounded-md text-sm font-medium text-stone-700 border border-stone-300 hover:bg-stone-50 transition-colors min-h-0"
                >
                  選取
                </button>
              )}
              <button
                onClick={() => navigate('/record')}
                className="h-9 px-4 rounded-md text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 transition-colors inline-flex items-center gap-1.5 min-h-0"
              >
                <Plus size={15} strokeWidth={2} />
                新錄音
              </button>
            </div>
          </>
        )}
      </div>

      {/* Search (mobile-visible) */}
      {!selectMode && (
        <div className="mb-4 md:hidden">
          <input
            type="text"
            placeholder="搜尋會議..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            className="w-full h-9 px-3 rounded-md text-sm bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-500"
          />
        </div>
      )}

      {/* Meeting list — dense list style */}
      <div className="bg-white rounded-md border border-stone-200 overflow-hidden">
        {filtered.map((m, idx) => (
          <div key={m.id} className={deleting === m.id ? 'pointer-events-none' : ''}>
            <MeetingItem
              meeting={m}
              onClick={() => navigate(`/meeting/${m.id}`)}
              onDelete={handleDelete}
              onSwipeOpen={() => setOpenCardId(m.id)}
              forceClose={openCardId !== m.id && openCardId !== null}
              selectMode={selectMode}
              selected={selectedIds.has(m.id)}
              onToggleSelect={toggleSelect}
              isLast={idx === filtered.length - 1}
            />
          </div>
        ))}
        {filtered.length === 0 && localSearch && (
          <p className="text-center text-sm text-stone-400 py-8">找不到符合「{localSearch}」的會議</p>
        )}
      </div>

      {/* Batch delete bottom bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-white border-t border-stone-200"
          style={{ paddingBottom: 'calc(16px + var(--sab))' }}
        >
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleting}
            className="w-full max-w-[760px] mx-auto flex items-center justify-center gap-2 h-10 rounded-md text-sm font-medium text-white bg-red-700 hover:bg-red-800 transition-colors disabled:opacity-50 min-h-0"
          >
            {batchDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                刪除中...
              </>
            ) : (
              <>
                <Trash2 size={16} strokeWidth={1.75} />
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
