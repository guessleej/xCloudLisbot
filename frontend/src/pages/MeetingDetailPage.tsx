import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Lock, FileText, Share2, Trash2, Download,
  CheckSquare, Scale, ArrowRight, Check, FileAudio,
} from 'lucide-react';
import { useMeetingDetail } from '../hooks/useMeetingDetail';
import api from '../services/api';
import TranscriptView from '../components/TranscriptView';
import SummaryPanel from '../components/SummaryPanel';
import ShareMeetingModal from '../components/ShareMeetingModal';
import { MEETING_MODES, SPEECH_LANGUAGES } from '../types';

type DetailTab = 'summary' | 'transcript';

const PRIORITY_CLS: Record<string, string> = {
  '高': 'bg-red-50 text-red-700 border border-red-100',
  '中': 'bg-amber-50 text-amber-700 border border-amber-100',
  '低': 'bg-stone-100 text-stone-600 border border-stone-200',
};

const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, loading, error, updateTitle } = useMeetingDetail(id);

  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [showShare, setShowShare] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [toast, setToast] = useState('');
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (meeting?.audioUrl && id) {
      api.get<{ url: string }>(`/api/meetings/${id}/audio-url`)
        .then(d => setAudioPlaybackUrl(d.url))
        .catch(() => setAudioPlaybackUrl(null));
    }
  }, [meeting?.audioUrl, id]);

  const handleDelete = useCallback(async () => {
    if (!id || !meeting) return;
    if (!window.confirm(`確定要刪除「${meeting.title}」嗎？\n刪除後無法復原。`)) return;
    try {
      await api.delete(`/api/meetings/${id}`);
      navigate('/');
    } catch (err: any) {
      setToast(`刪除失敗: ${err.message}`);
      setTimeout(() => setToast(''), 4000);
    }
  }, [id, meeting, navigate]);

  if (loading) {
    return (
      <div className="max-w-[920px] mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-64 bg-stone-100 rounded animate-pulse" />
          <div className="h-64 bg-stone-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    const is403 = error?.includes('權限');
    return (
      <div className="max-w-[920px] mx-auto px-4 py-16 flex justify-center">
        <div className="max-w-sm w-full bg-white rounded-lg border border-stone-200 p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-4 rounded-md bg-stone-100 flex items-center justify-center">
            {is403 ? (
              <Lock size={18} strokeWidth={1.5} className="text-stone-500" />
            ) : (
              <FileText size={18} strokeWidth={1.5} className="text-stone-500" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">
            {is403 ? '沒有存取權限' : '找不到會議記錄'}
          </h2>
          <p className="text-sm text-stone-500 mb-6">
            {is403 ? '您沒有權限查看此會議記錄。' : '此會議記錄不存在或已被刪除。'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="h-9 px-5 bg-stone-900 text-white rounded-md font-medium hover:bg-stone-800 transition-colors text-sm"
          >
            返回首頁
          </button>
        </div>
      </div>
    );
  }

  const modeInfo = MEETING_MODES.find(m => m.id === meeting.mode);
  const langInfo = SPEECH_LANGUAGES.find(l => l.code === meeting.language);

  const handleTitleSave = async () => {
    try {
      if (editTitle.trim() && editTitle !== meeting.title) {
        await updateTitle(editTitle.trim());
      }
      setIsEditingTitle(false);
    } catch (err: any) {
      setToast(`標題儲存失敗: ${err.message}`);
      setTimeout(() => setToast(''), 4000);
    }
  };

  const handleExport = (format: 'markdown' | 'json') => {
    if (!meeting.summary) return;
    const title = meeting.title || '會議摘要';
    const content = format === 'markdown'
      ? `# ${title}\n\n${meeting.summary.markdown}`
      : JSON.stringify({ meetingTitle: title, ...meeting.summary }, null, 2);
    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.${format === 'markdown' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = () => {
    if (!meeting.startTime) return '';
    const s = new Date(meeting.startTime).getTime();
    const e = meeting.endTime ? new Date(meeting.endTime).getTime() : Date.now();
    const mins = Math.round((e - s) / 60000);
    if (mins < 60) return `${mins} 分鐘`;
    return `${Math.floor(mins / 60)} 小時 ${mins % 60} 分鐘`;
  };

  return (
    <div className="max-w-[920px] mx-auto px-4 py-6">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-white text-red-700 border border-red-200 rounded-md text-sm fade-in">
          {toast}
        </div>
      )}

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="text-sm text-stone-500 hover:text-stone-900 transition-colors inline-flex items-center gap-1 mb-4 min-h-0 min-w-0"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                  className="text-[22px] font-semibold text-stone-900 border-b border-stone-400 outline-none bg-transparent flex-1 h-10"
                  autoFocus
                />
                <button
                  onClick={handleTitleSave}
                  className="h-8 px-3 rounded-md bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 min-h-0 min-w-0"
                >
                  儲存
                </button>
              </div>
            ) : (
              <h1
                className="text-[22px] font-semibold text-stone-900 tracking-tight cursor-pointer hover:text-stone-600 transition-colors"
                onClick={() => { setEditTitle(meeting.title); setIsEditingTitle(true); }}
              >
                {meeting.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-stone-500">
              {meeting.startTime && (
                <span>
                  {new Date(meeting.startTime).toLocaleString('zh-TW', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              {meeting.endTime && <span>· {formatDuration()}</span>}
              {langInfo && <span>· {langInfo.label}</span>}
              {modeInfo && <span>· {modeInfo.label}</span>}
            </div>
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            {meeting.summary && (
              <>
                <button
                  onClick={() => handleExport('markdown')}
                  className="h-8 px-3 text-xs font-medium bg-white text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors inline-flex items-center gap-1 min-h-0 min-w-0"
                  title="匯出 Markdown"
                >
                  <Download size={13} strokeWidth={1.75} />
                  MD
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="h-8 px-3 text-xs font-medium bg-white text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors min-h-0 min-w-0"
                  title="匯出 JSON"
                >
                  JSON
                </button>
              </>
            )}
            <button
              onClick={() => setShowShare(true)}
              className="h-8 px-3 text-xs font-medium bg-white text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors inline-flex items-center gap-1 min-h-0 min-w-0"
            >
              <Share2 size={13} strokeWidth={1.75} />
              分享
            </button>
            <button
              onClick={handleDelete}
              className="h-8 px-3 text-xs font-medium bg-white text-red-700 border border-red-200 rounded-md hover:bg-red-50 transition-colors inline-flex items-center gap-1 min-h-0 min-w-0"
            >
              <Trash2 size={13} strokeWidth={1.75} />
              刪除
            </button>
          </div>
        </div>

        {/* Audio playback */}
        {audioPlaybackUrl && (
          <div className="bg-white rounded-md border border-stone-200 p-3 flex items-center gap-3">
            <FileAudio size={16} strokeWidth={1.75} className="text-stone-500 flex-shrink-0" />
            <audio controls className="w-full h-8" src={audioPlaybackUrl}>
              <track kind="captions" />
            </audio>
          </div>
        )}
      </div>

      {/* Content tabs — underline style */}
      <div className="border-b border-stone-200 mb-5 flex gap-6">
        {([
          { key: 'summary' as DetailTab, label: '摘要', count: meeting.summary ? undefined : 0 },
          { key: 'transcript' as DetailTab, label: '逐字稿', count: meeting.transcripts?.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px py-3 text-sm font-medium transition-colors min-h-0 min-w-0 inline-flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'text-stone-900 border-b-2 border-stone-900'
                : 'text-stone-500 hover:text-stone-700 border-b-2 border-transparent'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                activeTab === tab.key ? 'bg-stone-100 text-stone-700' : 'bg-stone-100 text-stone-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop: two-column layout */}
      <div className="grid lg:grid-cols-[1fr,320px] gap-6">
        {/* Main content */}
        <div>
          {activeTab === 'summary' && (
            <SummaryPanel
              summary={meeting.summary}
              isLoading={meeting.status === 'processing'}
              meetingId={meeting.id}
              meetingTitle={meeting.title}
              onExport={handleExport}
              onShare={() => setShowShare(true)}
            />
          )}
          {activeTab === 'transcript' && (
            <TranscriptView
              segments={meeting.transcripts || []}
              isRecording={false}
            />
          )}
        </div>

        {/* Action sidebar (desktop only) */}
        {meeting.summary && (
          <div className="hidden lg:block space-y-4">
            {/* Action Items */}
            {meeting.summary.actionItems.length > 0 && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-xs font-semibold text-stone-900 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <CheckSquare size={14} strokeWidth={1.75} className="text-stone-500" />
                  待辦事項
                  <span className="ml-auto px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] font-medium normal-case tracking-normal">
                    {meeting.summary.actionItems.length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {meeting.summary.actionItems.map((item, i) => (
                    <div key={i} className="p-2.5 rounded-md border border-stone-200 hover:bg-stone-50 transition-colors">
                      <p className="text-[13px] text-stone-900 leading-snug">{item.task}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-stone-500">
                        <span>{item.assignee}</span>
                        {item.deadline && <span>· {item.deadline}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_CLS[item.priority]}`}>
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Decisions */}
            {meeting.summary.keyDecisions.length > 0 && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-xs font-semibold text-stone-900 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <Scale size={14} strokeWidth={1.75} className="text-stone-500" />
                  決議事項
                </h3>
                <div className="space-y-1.5">
                  {meeting.summary.keyDecisions.map((d, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <Check size={13} strokeWidth={2} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[12px] text-stone-700 leading-relaxed">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Topics */}
            {meeting.summary.nextMeetingTopics.length > 0 && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-xs font-semibold text-stone-900 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <ArrowRight size={14} strokeWidth={1.75} className="text-stone-500" />
                  下次議題
                </h3>
                <div className="space-y-1.5">
                  {meeting.summary.nextMeetingTopics.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-stone-300 text-xs mt-1">•</span>
                      <p className="text-[12px] text-stone-700 leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShare && meeting && (
        <ShareMeetingModal
          isOpen={showShare}
          onClose={() => setShowShare(false)}
          meetingId={meeting.id}
          meetingTitle={meeting.title}
        />
      )}
    </div>
  );
};

export default MeetingDetailPage;
