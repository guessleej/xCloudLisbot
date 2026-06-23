import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, FolderClosed, ChevronDown, Bot, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Meeting, MEETING_MODES } from '../types';
import TranscriptView from '../components/TranscriptView';
import SummaryPanel from '../components/SummaryPanel';
import ShareMeetingModal from '../components/ShareMeetingModal';
import { getRecallStatus, reingestTranscript } from '../services/recall';
import { Button, Badge, Spinner, IconButton, EmptyState, useToast } from '../components/ui';

type Tab = 'summary' | 'transcript';

const FOLDERS = ['計劃會議', '客戶會議', '銷售討論'];

// Recall bot lifecycle → human label.
const RECALL_STATUS_LABEL: Record<string, string> = {
  'bot.joining_call': '機器人加入中',
  'bot.in_waiting_room': '等待主持人允許',
  'bot.in_call_not_recording': '已加入，尚未錄製',
  'bot.in_call_recording': '機器人錄製中',
  'bot.call_ended': '會議結束，轉錄中',
  'bot.done': '轉錄中',
  'transcript.done': '已完成',
  'bot.fatal': '機器人錯誤',
  'bot.recording_permission_denied': '錄製被拒絕',
};

const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { show } = useToast();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [showShare, setShowShare] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [recallLive, setRecallLive] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reingesting, setReingesting] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const loadMeeting = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/meetings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const body = await res.json(); setMeeting(body.data ?? body); }
      else if (res.status === 404) { setMeeting(null); }
      else { setLoadError(true); }   // transient (500/401/…) — distinguish from "not found"
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [id, backendUrl, getToken]);

  useEffect(() => { loadMeeting(); }, [loadMeeting]);

  // Poll while a recording/transcription is in progress — for recall bots AND for
  // uploaded audio (batch transcription), so leaving and returning still shows progress.
  useEffect(() => {
    if (!id || !meeting) return;
    if (!['pending', 'recording', 'processing'].includes(meeting.status)) return;
    const isRecall = meeting.source === 'recall';

    let cancelled = false;
    const tick = async () => {
      try {
        const token = await getToken();
        let terminal = false;
        if (isRecall) {
          const s = await getRecallStatus(token, id);
          if (cancelled) return;
          setRecallLive(s.recallStatus);
          terminal = s.status === 'completed' || s.status === 'error';
        }
        // Re-fetch to pick up transcripts/summary/status. recall: on terminal only;
        // upload/other: every tick to reflect batch-transcription progress.
        if (terminal || !isRecall) {
          const res = await fetch(`${backendUrl}/api/meetings/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok && !cancelled) { const body = await res.json(); setMeeting(body.data ?? body); }
        }
      } catch {/* transient */}
    };
    tick();
    const timer = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id, meeting?.source, meeting?.status]); // eslint-disable-line

  const assignFolder = async (folder: string) => {
    setShowFolderMenu(false);
    if (!meeting) return;
    setMeeting(m => m ? { ...m, folder } : m);
    try {
      const token = await getToken();
      await fetch(`${backendUrl}/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ folder }),
      });
      show(`已移至「${folder}」`, 'success');
    } catch { show('文件夾指派失敗,請稍後重試', 'error'); }
  };

  // Re-pull the transcript from Recall and re-parse it with the latest parser.
  const handleReingest = async () => {
    if (!meeting) return;
    setReingesting(true);
    try {
      const token = await getToken();
      const r = await reingestTranscript(token, meeting.id);
      await loadMeeting();
      show(`已重新整理逐字稿（${r.segments} 句）`, 'success');
    } catch {
      show('重新整理失敗,請稍後再試', 'error');
    } finally {
      setReingesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={22} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-16">
        <EmptyState
          icon={<FileText size={26} strokeWidth={1.75} />}
          title="無法載入會議"
          description="可能是網路或伺服器暫時問題。"
          action={<Button variant="secondary" size="sm" onClick={loadMeeting}>重試</Button>}
        />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="py-16">
        <EmptyState
          icon={<FileText size={26} strokeWidth={1.75} />}
          title="找不到會議記錄"
          description="這份報告可能已被刪除或連結無效。"
          action={<Button variant="secondary" size="sm" onClick={() => navigate('/')}>返回首頁</Button>}
        />
      </div>
    );
  }

  const modeLabel = MEETING_MODES.find(m => m.id === meeting.mode)?.label;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="min-h-full bg-stone-50">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="flex items-start gap-3">
          <IconButton aria-label="返回" onClick={() => navigate('/')} className="mt-0.5 flex-shrink-0">
            <ArrowLeft size={18} strokeWidth={1.75} />
          </IconButton>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-stone-900 truncate leading-tight">
              {meeting.title || '未命名會議'}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {modeLabel && (
                <Badge tone="neutral">{modeLabel}</Badge>
              )}
              {meeting.startTime && (
                <span className="text-xs text-stone-400">{fmtDate(meeting.startTime)}</span>
              )}
              {meeting.folder && (
                <Badge tone="neutral">
                  <FolderClosed size={10} strokeWidth={1.75} />{meeting.folder}
                </Badge>
              )}
              {meeting.source === 'recall' && meeting.status !== 'completed' && (
                <Badge tone="accent">
                  <Bot size={10} strokeWidth={1.75} className="animate-pulse" />
                  {RECALL_STATUS_LABEL[recallLive || meeting.recallStatus || ''] || '機器人處理中'}
                </Badge>
              )}
              {meeting.source !== 'recall' && (meeting.status === 'processing' || meeting.status === 'recording') && (
                <Badge tone="warning">
                  <Bot size={10} strokeWidth={1.75} className="animate-pulse" /> 轉錄中…
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Folder assign */}
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                icon={<FolderClosed size={13} strokeWidth={1.75} />}
                onClick={() => setShowFolderMenu(o => !o)}
                aria-haspopup="menu"
                aria-expanded={showFolderMenu}
              >
                <span className="hidden sm:inline">{meeting.folder || '文件夾'}</span>
                <ChevronDown size={11} strokeWidth={1.75} />
              </Button>
              {showFolderMenu && (
                <div className="absolute right-0 top-[calc(100%+4px)] w-36 bg-white border border-stone-200 rounded-lg shadow-pop z-20 py-1 fade-in">
                  {FOLDERS.map(f => (
                    <button
                      key={f}
                      onClick={() => assignFolder(f)}
                      className={`w-full px-3 py-1.5 text-xs text-left hover:bg-stone-100 transition-colors ${
                        meeting.folder === f ? 'text-teal-700 font-medium' : 'text-stone-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Share2 size={13} strokeWidth={1.75} />}
              onClick={() => setShowShare(true)}
              aria-label="分享此會議"
            >
              <span className="hidden sm:inline">分享</span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 -mb-[1px]">
          {(['summary', 'transcript'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-selected={tab === t}
              className={`px-1 pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 rounded-sm ${
                tab === t
                  ? 'border-teal-700 text-teal-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {t === 'summary' ? '摘要' : '逐字稿'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {tab === 'summary' ? (
          <SummaryPanel summary={meeting.summary || null} meetingId={meeting.id} />
        ) : (
          <>
            {meeting.source === 'recall' && meeting.recallBotId && (
              <div className="flex justify-end mb-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={reingesting}
                  icon={<RefreshCw size={13} strokeWidth={1.75} />}
                  onClick={handleReingest}
                >
                  重新整理逐字稿
                </Button>
              </div>
            )}
            <TranscriptView segments={meeting.transcripts || []} />
          </>
        )}
      </div>

      {showShare && (
        <ShareMeetingModal meetingId={meeting.id} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
};

export default MeetingDetailPage;
