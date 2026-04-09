import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import TranscriptView from '../components/TranscriptView';
import SummaryPanel from '../components/SummaryPanel';
import { TranscriptSegment, MeetingSummary, MEETING_MODES, SPEECH_LANGUAGES } from '../types';

interface SharedMeeting {
  id: string;
  title: string;
  mode: string;
  language: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  transcripts: TranscriptSegment[];
  summary: MeetingSummary | null;
}

type Tab = 'summary' | 'transcript';

const SharedMeetingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [meeting, setMeeting] = useState<SharedMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  useEffect(() => {
    if (!token) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${backendUrl}/api/shared/${token}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : 'error');
        return res.json();
      })
      .then(data => {
        if (data.transcripts) {
          data.transcripts = data.transcripts.map((t: any) => ({
            ...t,
            timestamp: new Date(t.timestamp),
          }));
        }
        setMeeting(data);
      })
      .catch(err => {
        setError(err.message === 'not_found' ? 'not_found' : 'error');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          {error === 'not_found' ? (
            <>
              <div className="text-5xl mb-4">🔗</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">連結無效或已關閉</h1>
              <p className="text-sm text-gray-500">此分享連結可能已過期，或會議擁有者已關閉公開分享。</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">⚠️</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">無法載入會議記錄</h1>
              <p className="text-sm text-gray-500">請檢查網路連線後重試。</p>
            </>
          )}
          <a href="/" className="inline-block mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition text-sm">
            前往 xCloudLisbot
          </a>
        </div>
      </div>
    );
  }

  const modeInfo = MEETING_MODES.find(m => m.id === meeting.mode);
  const langInfo = SPEECH_LANGUAGES.find(l => l.code === meeting.language);

  const handleExport = (format: 'markdown' | 'json') => {
    if (!meeting.summary) return;
    const content = format === 'markdown'
      ? `# ${meeting.title}\n\n${meeting.summary.markdown}`
      : JSON.stringify({ meetingTitle: meeting.title, ...meeting.summary }, null, 2);
    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title}.${format === 'markdown' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-xl">{modeInfo?.icon || '🏢'}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-800 truncate">{meeting.title}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {meeting.startTime && (
                <span>{new Date(meeting.startTime).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {langInfo && <span>{langInfo.flag} {langInfo.label}</span>}
            </div>
          </div>
          <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-xs font-semibold rounded-full border border-purple-100">
            公開分享
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
          {([
            { key: 'summary' as Tab, label: '摘要', count: meeting.summary ? undefined : 0 },
            { key: 'transcript' as Tab, label: '逐字稿', count: meeting.transcripts?.length },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'summary' && (
          <SummaryPanel
            summary={meeting.summary}
            isLoading={false}
            onExport={handleExport}
          />
        )}
        {activeTab === 'transcript' && (
          <TranscriptView segments={meeting.transcripts || []} isRecording={false} />
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-8 text-xs text-gray-400">
        <p>由 <strong className="text-indigo-500">xCloudLisbot</strong> AI 會議智慧記錄系統建立</p>
        <a href="/" className="text-indigo-500 hover:text-indigo-700 mt-1 inline-block">登入使用完整功能 →</a>
      </div>
    </div>
  );
};

export default SharedMeetingPage;
