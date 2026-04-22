import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Waves, Link2, AlertCircle, FileText } from 'lucide-react';
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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-stone-200 p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-4 rounded-md bg-stone-100 flex items-center justify-center">
            {error === 'not_found' ? (
              <Link2 size={18} strokeWidth={1.5} className="text-stone-500" />
            ) : (
              <AlertCircle size={18} strokeWidth={1.5} className="text-stone-500" />
            )}
          </div>
          <h1 className="text-lg font-semibold text-stone-900 mb-2">
            {error === 'not_found' ? '連結無效或已關閉' : '無法載入會議記錄'}
          </h1>
          <p className="text-sm text-stone-500">
            {error === 'not_found'
              ? '此分享連結可能已過期，或會議擁有者已關閉公開分享。'
              : '請檢查網路連線後重試。'}
          </p>
          <a
            href="/"
            className="inline-flex h-9 px-5 items-center mt-6 bg-stone-900 text-white rounded-md font-medium hover:bg-stone-800 transition-colors text-sm"
          >
            前往 XMeet AI
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
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-[920px] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-stone-900 rounded-md flex items-center justify-center flex-shrink-0">
            <Waves className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-stone-900 truncate text-[15px]">{meeting.title}</h1>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              {meeting.startTime && (
                <span>
                  {new Date(meeting.startTime).toLocaleString('zh-TW', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              {langInfo && <span>· {langInfo.label}</span>}
              {modeInfo && <span>· {modeInfo.label}</span>}
            </div>
          </div>
          <span className="px-2 py-1 bg-stone-100 text-stone-600 text-[11px] font-medium rounded border border-stone-200 inline-flex items-center gap-1 flex-shrink-0">
            <Link2 size={11} strokeWidth={1.75} />
            公開分享
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[920px] mx-auto px-4 py-6">
        {/* Tabs — underline style */}
        <div className="border-b border-stone-200 mb-5 flex gap-6">
          {([
            { key: 'summary' as Tab, label: '摘要' },
            { key: 'transcript' as Tab, label: '逐字稿', count: meeting.transcripts?.length },
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
                <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-medium">
                  {tab.count}
                </span>
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
      <div className="text-center py-8 text-xs text-stone-400 border-t border-stone-200 mt-8">
        <p className="inline-flex items-center gap-1.5">
          <Waves size={12} strokeWidth={1.75} />
          由 <strong className="text-stone-700 font-medium">XMeet AI</strong> 建立
        </p>
        <a href="/" className="text-stone-500 hover:text-stone-900 mt-1 inline-block">
          登入使用完整功能 →
        </a>
      </div>
    </div>
  );
};

export default SharedMeetingPage;
