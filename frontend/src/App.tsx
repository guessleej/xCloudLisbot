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
type MobileTab = 'home' | 'transcript' | 'summary' | 'more';

const AppContent: React.FC = () => {
  const { user, isLoading, logout, getToken } = useAuth();

  const [inputTab, setInputTab] = useState<InputTab>('record');
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig>({ ...DEFAULT_MEETING_CONFIG });
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  const [showCalendar, setShowCalendar] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');

  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [termDicts, setTermDicts] = useState<TermDictionary[]>([]);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  const handleTranscriptUpdate = useCallback((segment: TranscriptSegment) => {
    setTranscripts((prev) => [...prev, segment]);
    setIsRecording(true);
  }, []);

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
          body: JSON.stringify({ meetingId, transcript: fullText, meetingTitle: title, speakers, templateId, mode: meetingConfig.mode, language: meetingConfig.language }),
        });
        const data = await res.json();
        setSummary({
          markdown: data.summary, actionItems: data.actionItems ?? [], keyDecisions: data.keyDecisions ?? [],
          nextMeetingTopics: data.nextMeetingTopics ?? [], generatedAt: new Date().toISOString(),
          templateId, templateName: allTemplates.find((t) => t.id === templateId)?.name, language: meetingConfig.language,
        });
        setMobileTab('summary');
      } catch (err) { console.error('摘要生成失敗:', err); }
      finally { setIsSummarizing(false); }
    },
    [transcripts, meetingConfig, getToken, allTemplates]
  );

  const handleUploadDone = useCallback(
    (uploadedSummary: MeetingSummary, uploadedTranscripts: TranscriptSegment[], title: string) => {
      setTranscripts(uploadedTranscripts);
      setSummary(uploadedSummary);
      setMeetingConfig((prev) => ({ ...prev, title }));
      setMobileTab('summary');
    }, []
  );

  const handleExport = useCallback(
    (format: 'markdown' | 'json') => {
      if (!summary) return;
      const title = meetingConfig.title || '會議摘要';
      const content = format === 'markdown'
        ? `# ${title}\n\n${summary.markdown}`
        : JSON.stringify({ meetingTitle: title, ...summary }, null, 2);
      const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.${format === 'markdown' ? 'md' : 'json'}`;
      a.click();
      URL.revokeObjectURL(url);
    }, [summary, meetingConfig.title]
  );

  const handleNewMeeting = useCallback(() => {
    setMeetingConfig({ ...DEFAULT_MEETING_CONFIG });
    setTranscripts([]);
    setSummary(null);
    setIsRecording(false);
    setCurrentMeetingId(null);
    setMobileTab('home');
  }, []);

  const handleCalendarStart = useCallback((partialConfig: Partial<MeetingConfig>) => {
    setMeetingConfig((prev) => ({ ...prev, ...partialConfig }));
    setInputTab('record');
    setMobileTab('home');
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ========== Login Page ==========
  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg">
            AI
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">xCloudLisbot</h1>
          <p className="text-gray-500 mb-3 text-sm">AI 會議智慧記錄系統</p>
          <div className="flex flex-wrap gap-1.5 justify-center mb-6 text-xs text-gray-400">
            {['即時字幕', '語者辨識', 'GPT-4 摘要', '台語客語', '日曆整合', '團隊協作'].map((f) => (
              <span key={f} className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-full">{f}</span>
            ))}
          </div>
          <OAuthButtons />
          <p className="mt-6 text-xs text-gray-400">支援 Microsoft · Google · GitHub · Apple 帳號登入</p>
        </div>
      </div>
    );
  }

  // ========== Main App ==========
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      {/* ===== Top Nav ===== */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">AI</div>
            <span className="font-bold text-gray-800 hidden sm:block">xCloudLisbot</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: '日曆', icon: '📅', action: () => setShowCalendar(true) },
              { label: '上傳音檔', icon: '📁', action: () => setInputTab('upload'), active: inputTab === 'upload' },
              { label: '術語辭典', icon: '📚', action: () => setShowTermModal(true) },
              { label: '摘要範本', icon: '📋', action: () => setShowTemplateModal(true) },
            ].map((item) => (
              <button key={item.label} onClick={item.action}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition min-h-[44px] ${
                  item.active ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
                }`}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>

          {/* Right: user + actions */}
          <div className="flex items-center gap-2">
            {summary && (
              <button onClick={handleNewMeeting}
                className="text-sm px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-medium transition min-h-[44px]">
                + 新會議
              </button>
            )}
            <div className="flex items-center gap-2">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {user.name[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-700 hidden sm:block">{user.name}</span>
            </div>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600 transition min-h-[44px] px-2">
              登出
            </button>
          </div>
        </div>
      </nav>

      {/* ===== Main Content ===== */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-6 main-content">
        {/* Desktop: two-column grid */}
        <div className="hidden md:grid md:grid-cols-[1fr,420px] gap-6">
          <div className="space-y-5">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
              {[
                { key: 'record' as InputTab, label: '🎙️ 即時錄音' },
                { key: 'upload' as InputTab, label: '📁 上傳音檔' },
              ].map((tab) => (
                <button key={tab.key} onClick={() => setInputTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all min-h-[44px] ${
                    inputTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
            {inputTab === 'record' ? (
              <RecordingPanel config={meetingConfig} onConfigChange={setMeetingConfig} customTemplates={customTemplates}
                termDicts={termDicts} onTranscriptUpdate={handleTranscriptUpdate} onRecordingStop={handleRecordingStop} />
            ) : (
              <AudioUploadPanel customTemplates={customTemplates} onSummaryReady={handleUploadDone} />
            )}
            <TranscriptView segments={transcripts} isRecording={isRecording} />
          </div>
          <div>
            <SummaryPanel summary={summary} isLoading={isSummarizing} meetingId={currentMeetingId ?? undefined}
              meetingTitle={meetingConfig.title} customTemplates={customTemplates} onExport={handleExport}
              onShare={currentMeetingId ? () => setShowShareModal(true) : undefined} />
          </div>
        </div>

        {/* Mobile: tabbed single column */}
        <div className="md:hidden">
          {mobileTab === 'home' && (
            <div className="space-y-4 fade-in">
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {[
                  { key: 'record' as InputTab, label: '🎙️ 錄音' },
                  { key: 'upload' as InputTab, label: '📁 上傳' },
                ].map((tab) => (
                  <button key={tab.key} onClick={() => setInputTab(tab.key)}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      inputTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                    }`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {inputTab === 'record' ? (
                <RecordingPanel config={meetingConfig} onConfigChange={setMeetingConfig} customTemplates={customTemplates}
                  termDicts={termDicts} onTranscriptUpdate={handleTranscriptUpdate} onRecordingStop={handleRecordingStop} />
              ) : (
                <AudioUploadPanel customTemplates={customTemplates} onSummaryReady={handleUploadDone} />
              )}
            </div>
          )}
          {mobileTab === 'transcript' && (
            <div className="fade-in">
              <TranscriptView segments={transcripts} isRecording={isRecording} />
            </div>
          )}
          {mobileTab === 'summary' && (
            <div className="fade-in">
              <SummaryPanel summary={summary} isLoading={isSummarizing} meetingId={currentMeetingId ?? undefined}
                meetingTitle={meetingConfig.title} customTemplates={customTemplates} onExport={handleExport}
                onShare={currentMeetingId ? () => setShowShareModal(true) : undefined} />
            </div>
          )}
          {mobileTab === 'more' && (
            <div className="space-y-3 fade-in">
              <h2 className="text-lg font-bold text-gray-800 px-1">更多功能</h2>
              {[
                { label: '行事曆', icon: '📅', desc: '連結 Google / Outlook 行事曆', action: () => setShowCalendar(true) },
                { label: '術語辭典', icon: '📚', desc: '管理專業術語對照表', action: () => setShowTermModal(true) },
                { label: '摘要範本', icon: '📋', desc: '自訂 GPT 摘要範本', action: () => setShowTemplateModal(true) },
                ...(summary ? [{ label: '新會議', icon: '➕', desc: '開始新的會議記錄', action: handleNewMeeting }] : []),
              ].map((item) => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-[0.98] transition-all text-left">
                  <span className="text-2xl w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </button>
              ))}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3 p-3">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      {user.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{user.name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                  <button onClick={logout}
                    className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
                    登出
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30"
        style={{ paddingBottom: 'var(--sab)' }}>
        <div className="flex">
          {([
            { key: 'home' as MobileTab, icon: '🎙️', label: '錄音' },
            { key: 'transcript' as MobileTab, icon: '📝', label: '逐字稿', badge: transcripts.length || undefined },
            { key: 'summary' as MobileTab, icon: '✨', label: '摘要', dot: !!summary },
            { key: 'more' as MobileTab, icon: '☰', label: '更多' },
          ]).map((tab) => (
            <button key={tab.key} onClick={() => setMobileTab(tab.key)}
              className={`flex-1 flex flex-col items-center py-2 pt-2.5 transition-colors relative ${
                mobileTab === tab.key ? 'text-indigo-600' : 'text-gray-400'
              }`}>
              <span className="text-xl relative">
                {tab.icon}
                {tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
                {tab.dot && !tab.badge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full" />
                )}
              </span>
              <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
              {mobileTab === tab.key && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Modals ===== */}
      <CalendarPanel isOpen={showCalendar} onClose={() => setShowCalendar(false)} onStartMeeting={handleCalendarStart} />
      <TermDictionaryModal isOpen={showTermModal} onClose={() => setShowTermModal(false)} onDictsChange={setTermDicts} />
      <SummaryTemplateModal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)} onTemplatesChange={setCustomTemplates} />
      {showShareModal && currentMeetingId && (
        <ShareMeetingModal isOpen={showShareModal} onClose={() => setShowShareModal(false)}
          meetingId={currentMeetingId} meetingTitle={meetingConfig.title} />
      )}
    </div>
  );
};

const App: React.FC = () => (
  <MsalProvider instance={msalInstance}>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </MsalProvider>
);

export default App;
