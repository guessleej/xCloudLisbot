import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingDetail } from '../hooks/useMeetingDetail';
import TranscriptView from '../components/TranscriptView';
import SummaryPanel from '../components/SummaryPanel';
import api from '../services/api';
import ShareMeetingModal from '../components/ShareMeetingModal';
import { MEETING_MODES, SPEECH_LANGUAGES } from '../types';

type DetailTab = 'summary' | 'transcript';

const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, loading, error, updateTitle } = useMeetingDetail(id);

  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [showShare, setShowShare] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const handleDelete = useCallback(async () => {
    if (!id || !meeting) return;
    if (!window.confirm(`確定要刪除「${meeting.title}」嗎？\n刪除後無法復原。`)) return;
    try {
      await api.delete(`/api/meetings/${id}`);
      navigate('/');
    } catch (err: any) {
      alert(`刪除失敗: ${err.message}`);
    }
  }, [id, meeting, navigate]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-12 w-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-96 bg-white rounded-2xl border border-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error || '找不到此會議'}
        </div>
        <button onClick={() => navigate('/')}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 transition">
          返回首頁
        </button>
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
      alert(`標題儲存失敗: ${err.message}`);
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
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back button */}
      <button onClick={() => navigate('/')}
        className="text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1 mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        返回
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex gap-2 items-center">
                <input type="text" value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                  className="text-xl font-bold text-gray-800 border-b-2 border-indigo-400 outline-none bg-transparent flex-1"
                  autoFocus />
                <button onClick={handleTitleSave}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-medium min-h-[auto] min-w-[auto]">
                  儲存
                </button>
              </div>
            ) : (
              <h1 className="text-xl font-bold text-gray-800 cursor-pointer hover:text-indigo-600 transition"
                onClick={() => { setEditTitle(meeting.title); setIsEditingTitle(true); }}>
                {modeInfo?.icon} {meeting.title}
              </h1>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-400">
              {meeting.startTime && (
                <span>
                  {new Date(meeting.startTime).toLocaleString('zh-TW', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              {meeting.endTime && <span>· {formatDuration()}</span>}
              {langInfo && <span>{langInfo.flag} {langInfo.label}</span>}
              {modeInfo && (
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                  {modeInfo.label}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            {meeting.summary && (
              <>
                <button onClick={() => handleExport('markdown')}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition min-h-[auto] min-w-[auto]">
                  MD
                </button>
                <button onClick={() => handleExport('json')}
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition min-h-[auto] min-w-[auto]">
                  JSON
                </button>
              </>
            )}
            <button onClick={() => setShowShare(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-100 transition min-h-[auto] min-w-[auto]">
              分享
            </button>
            <button onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 transition min-h-[auto] min-w-[auto]">
              刪除
            </button>
          </div>
        </div>

        {/* Audio playback */}
        {meeting.audioUrl && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <audio controls className="w-full h-10" src={meeting.audioUrl}>
              <track kind="captions" />
            </audio>
          </div>
        )}
      </div>

      {/* Content tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
        {([
          { key: 'summary' as DetailTab, label: '摘要', count: meeting.summary ? undefined : 0 },
          { key: 'transcript' as DetailTab, label: '逐字稿', count: meeting.transcripts?.length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop: two-column layout */}
      <div className="grid lg:grid-cols-[1fr,360px] gap-6">
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">✅</span>
                  待辦事項
                  <span className="ml-auto px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs font-semibold">
                    {meeting.summary.actionItems.length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {meeting.summary.actionItems.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition">
                      <p className="text-sm text-gray-800">{item.task}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>{item.assignee}</span>
                        {item.deadline && <span>· {item.deadline}</span>}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.priority === '高' ? 'bg-red-100 text-red-600' :
                          item.priority === '中' ? 'bg-amber-100 text-amber-600' :
                          'bg-green-100 text-green-600'
                        }`}>{item.priority}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Decisions */}
            {meeting.summary.keyDecisions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-xs">⚖️</span>
                  決議事項
                </h3>
                <div className="space-y-2">
                  {meeting.summary.keyDecisions.map((d, i) => (
                    <div key={i} className="flex gap-2 p-2.5 rounded-xl bg-green-50 border border-green-100">
                      <span className="text-green-500 text-xs flex-shrink-0 mt-0.5">✓</span>
                      <p className="text-xs text-gray-700 leading-relaxed">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Topics */}
            {meeting.summary.nextMeetingTopics.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-xs">📌</span>
                  下次議題
                </h3>
                <div className="space-y-2">
                  {meeting.summary.nextMeetingTopics.map((t, i) => (
                    <div key={i} className="flex gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                      <span className="text-blue-400 text-xs flex-shrink-0 mt-0.5">→</span>
                      <p className="text-xs text-gray-700 leading-relaxed">{t}</p>
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
