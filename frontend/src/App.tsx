import React, { useState, useCallback } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { AuthProvider, msalInstance, useAuth } from './contexts/AuthContext';
import OAuthButtons from './components/OAuthButtons';
import RecordingPanel from './components/RecordingPanel';
import TranscriptView from './components/TranscriptView';
import SummaryPanel from './components/SummaryPanel';
import AudioUploadPanel from './components/AudioUploadPanel';
import CalendarPanel from './components/CalendarPanel';
import TermDictionaryModal from './components/TermDictionaryModal';
import SummaryTemplateModal from './components/SummaryTemplateModal';
import ShareMeetingModal from './components/ShareMeetingModal';
import {
  TranscriptSegment, MeetingSummary, MeetingConfig, DEFAULT_MEETING_CONFIG,
  SummaryTemplate, TermDictionary, BUILTIN_TEMPLATES,
} from './types';
import './App.css';

type InputTab = 'record' | 'upload';

// ==================== 主應用程式內容 ====================
const AppContent: React.FC = () => {
  const { user, isLoading, logout, getToken } = useAuth();

  // ── 核心狀態 ──
  const [inputTab, setInputTab] = useState<InputTab>('record');
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig>({ ...DEFAULT_MEETING_CONFIG });
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  // ── 功能模態視窗 ──
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // ── 使用者資料 ──
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [termDicts, setTermDicts] = useState<TermDictionary[]>([]);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  // ── 逐字稿更新 ──
  const handleTranscriptUpdate = useCallback((segment: TranscriptSegment) => {
    setTranscripts((prev) => [...prev, segment]);
    setIsRecording(true);
  }, []);

  // ── 停止錄音 → 呼叫摘要 ──
  const handleRecordingStop = useCallback(
    async (meetingId: string, title: string, templateId: string) => {
      setIsRecording(false);
      setCurrentMeetingId(meetingId);
      setIsSummarizing(true);
      try {
        const token = await getToken();
        const fullText = transcripts.map((t) => `${t.speaker}: ${t.text}`).join('\n');
        const speakers = [...new Set(transcripts.map((t) => t.speaker))];

        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            meetingId,
            transcript: fullText,
            meetingTitle: title,
            speakers,
            templateId,
            mode: meetingConfig.mode,
            language: meetingConfig.language,
          }),
        });
        const data = await res.json();
        setSummary({
          markdown: data.summary,
          actionItems: data.actionItems ?? [],
          keyDecisions: data.keyDecisions ?? [],
          nextMeetingTopics: data.nextMeetingTopics ?? [],
          generatedAt: new Date().toISOString(),
          templateId,
          templateName: allTemplates.find((t) => t.id === templateId)?.name,
          language: meetingConfig.language,
        });
      } catch (err) {
        console.error('摘要生成失敗:', err);
      } finally {
        setIsSummarizing(false);
      }
    },
    [transcripts, meetingConfig, getToken, allTemplates]
  );

  // ── 音檔上傳完成 ──
  const handleUploadDone = useCallback(
    (uploadedSummary: MeetingSummary, uploadedTranscripts: TranscriptSegment[], title: string) => {
      setTranscripts(uploadedTranscripts);
      setSummary(uploadedSummary);
      setMeetingConfig((prev) => ({ ...prev, title }));
    },
    []
  );

  // ── 匯出 ──
  const handleExport = useCallback(
    (format: 'markdown' | 'json') => {
      if (!summary) return;
      const title = meetingConfig.title || '會議摘要';
      let content: string;
      let filename: string;
      let mime: string;

      if (format === 'markdown') {
        content = `# ${title}\n\n${summary.markdown}`;
        filename = `${title}.md`;
        mime = 'text/markdown';
      } else {
        content = JSON.stringify({ meetingTitle: title, ...summary }, null, 2);
        filename = `${title}.json`;
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
    [summary, meetingConfig.title]
  );

  const handleNewMeeting = useCallback(() => {
    setMeetingConfig({ ...DEFAULT_MEETING_CONFIG });
    setTranscripts([]);
    setSummary(null);
    setIsRecording(false);
    setCurrentMeetingId(null);
  }, []);

  // ── 從行事曆啟動 ──
  const handleCalendarStart = useCallback((partialConfig: Partial<MeetingConfig>) => {
    setMeetingConfig((prev) => ({ ...prev, ...partialConfig }));
    setInputTab('record');
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ========== 未登入頁面 ==========
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg">
            AI
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">xCloudLisbot</h1>
          <p className="text-gray-500 mb-3 text-sm leading-relaxed">
            AI 會議智慧記錄系統
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center mb-6 text-xs text-gray-400">
            {['即時字幕', '語者辨識', 'GPT-4 摘要', '台語客語', '日曆整合', '團隊協作'].map((f) => (
              <span key={f} className="px-2 py-1 bg-gray-50 border border-gray-100 rounded-full">{f}</span>
            ))}
          </div>
          <OAuthButtons />
          <p className="mt-6 text-xs text-gray-400">
            支援 Microsoft · Google · GitHub · Apple 帳號登入
          </p>
        </div>
      </div>
    );
  }

  // ========== 已登入主介面 ==========
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ==================== 頂部導覽 ==================== */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
              AI
            </div>
            <span className="font-bold text-gray-800">xCloudLisbot</span>
          </div>

          {/* Feature Nav */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setShowCalendar(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            >
              📅 日曆
            </button>
            <button
              onClick={() => setInputTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition ${
                inputTab === 'upload' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              📁 上傳音檔
            </button>
            <button
              onClick={() => setShowTermModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
            >
              📚 術語辭典
            </button>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
            >
              📋 摘要範本
            </button>
          </div>

          {/* Right: Actions + User */}
          <div className="flex items-center gap-3">
            {summary && (
              <button
                onClick={handleNewMeeting}
                className="text-sm px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-medium transition"
              >
                + 新會議
              </button>
            )}
            <div className="flex items-center gap-2">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {user.name[0].toUpperCase()}
                </div>
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

      {/* ==================== 主要內容 ==================== */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-6">
        {/* ── 左欄 ── */}
        <div className="space-y-5">
          {/* Input Mode Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setInputTab('record')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                inputTab === 'record'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🎙️ 即時錄音
            </button>
            <button
              onClick={() => setInputTab('upload')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                inputTab === 'upload'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📁 上傳音檔
            </button>
          </div>

          {/* Input Panel */}
          {inputTab === 'record' ? (
            <RecordingPanel
              config={meetingConfig}
              onConfigChange={setMeetingConfig}
              customTemplates={customTemplates}
              termDicts={termDicts}
              onTranscriptUpdate={handleTranscriptUpdate}
              onRecordingStop={handleRecordingStop}
            />
          ) : (
            <AudioUploadPanel
              customTemplates={customTemplates}
              onSummaryReady={handleUploadDone}
            />
          )}

          {/* Transcript */}
          <TranscriptView segments={transcripts} isRecording={isRecording} />
        </div>

        {/* ── 右欄 ── */}
        <div>
          <SummaryPanel
            summary={summary}
            isLoading={isSummarizing}
            meetingId={currentMeetingId ?? undefined}
            meetingTitle={meetingConfig.title}
            customTemplates={customTemplates}
            onExport={handleExport}
            onShare={currentMeetingId ? () => setShowShareModal(true) : undefined}
          />
        </div>
      </main>

      {/* ==================== Modals & Panels ==================== */}
      <CalendarPanel
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        onStartMeeting={handleCalendarStart}
      />

      <TermDictionaryModal
        isOpen={showTermModal}
        onClose={() => setShowTermModal(false)}
        onDictsChange={setTermDicts}
      />

      <SummaryTemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onTemplatesChange={setCustomTemplates}
      />

      {showShareModal && currentMeetingId && (
        <ShareMeetingModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          meetingId={currentMeetingId}
          meetingTitle={meetingConfig.title}
        />
      )}
    </div>
  );
};

// ==================== 根元件 ====================
const App: React.FC = () => (
  <MsalProvider instance={msalInstance}>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </MsalProvider>
);

export default App;
