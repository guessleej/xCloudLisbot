import React, { useState, useCallback } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { AuthProvider, msalInstance, useAuth } from './contexts/AuthContext';
import OAuthButtons from './components/OAuthButtons';
import RecordingPanel from './components/RecordingPanel';
import TranscriptView from './components/TranscriptView';
import SummaryPanel from './components/SummaryPanel';
import { TranscriptSegment, MeetingSummary } from './types';
import './App.css';

// ==================== 主應用程式內容 ====================
const AppContent: React.FC = () => {
  const { user, isLoading, logout, getToken } = useAuth();

  const [meetingTitle, setMeetingTitle] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const handleTranscriptUpdate = useCallback((segment: TranscriptSegment) => {
    setTranscripts((prev) => [...prev, segment]);
  }, []);

  const handleRecordingStop = useCallback(
    async (meetingId: string) => {
      setIsRecording(false);
      setIsSummarizing(true);
      try {
        const token = await getToken();
        const fullText = transcripts
          .map((t) => `${t.speaker}: ${t.text}`)
          .join('\n');
        const speakers = [...new Set(transcripts.map((t) => t.speaker))];

        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/summarize`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ meetingId, transcript: fullText, meetingTitle, speakers }),
          }
        );
        const data = await res.json();
        setSummary({
          markdown: data.summary,
          actionItems: data.actionItems ?? [],
          keyDecisions: data.keyDecisions ?? [],
          nextMeetingTopics: data.nextMeetingTopics ?? [],
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('摘要生成失敗:', err);
      } finally {
        setIsSummarizing(false);
      }
    },
    [transcripts, meetingTitle, getToken]
  );

  const handleExport = useCallback(
    (format: 'markdown' | 'json') => {
      if (!summary) return;
      let content: string;
      let filename: string;
      let mime: string;

      if (format === 'markdown') {
        content = `# ${meetingTitle}\n\n${summary.markdown}`;
        filename = `${meetingTitle || '會議摘要'}.md`;
        mime = 'text/markdown';
      } else {
        content = JSON.stringify({ meetingTitle, ...summary }, null, 2);
        filename = `${meetingTitle || '會議摘要'}.json`;
        mime = 'application/json';
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [summary, meetingTitle]
  );

  const handleNewMeeting = useCallback(() => {
    setMeetingTitle('');
    setTranscripts([]);
    setSummary(null);
    setIsRecording(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ========== 未登入 ==========
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg">
            AI
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">xCloudLisbot</h1>
          <p className="text-gray-500 mb-8 text-sm leading-relaxed">
            AI 會議智慧記錄系統<br />
            即時語音轉錄 · 說話者分離 · GPT-4 摘要
          </p>
          <OAuthButtons />
          <p className="mt-6 text-xs text-gray-400">
            支援 Microsoft · Google · GitHub · Apple 帳號登入
          </p>
        </div>
      </div>
    );
  }

  // ========== 已登入 ==========
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 頂部導覽 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
              AI
            </div>
            <span className="font-bold text-gray-800">xCloudLisbot</span>
          </div>

          <div className="flex items-center gap-4">
            {summary && (
              <button
                onClick={handleNewMeeting}
                className="text-sm px-4 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-medium transition"
              >
                + 新會議
              </button>
            )}
            <div className="flex items-center gap-2">
              {user.avatar && (
                <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-gray-700 hidden sm:block">{user.name}</span>
            </div>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              登出
            </button>
          </div>
        </div>
      </nav>

      {/* 主要內容 */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左欄 */}
        <div className="space-y-6">
          <RecordingPanel
            meetingTitle={meetingTitle}
            onTitleChange={setMeetingTitle}
            onTranscriptUpdate={(seg) => {
              handleTranscriptUpdate(seg);
              setIsRecording(true);
            }}
            onRecordingStop={handleRecordingStop}
          />
          <TranscriptView segments={transcripts} isRecording={isRecording} />
        </div>

        {/* 右欄 */}
        <div>
          <SummaryPanel
            summary={summary}
            isLoading={isSummarizing}
            onExport={handleExport}
          />
        </div>
      </main>
    </div>
  );
};

// ==================== 根元件（含 Provider） ====================
const App: React.FC = () => (
  <MsalProvider instance={msalInstance}>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </MsalProvider>
);

export default App;
