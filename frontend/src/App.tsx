import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';

import { AuthProvider, msalInstance, useAuth } from './contexts/AuthContext';
import { FolderProvider } from './contexts/FolderContext';
import ErrorBoundary from './components/ErrorBoundary';
import OAuthButtons from './components/OAuthButtons';
import AppShell from './components/layout/AppShell';
import { Button, Spinner, ToastProvider } from './components/ui';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import UploadPage from './pages/UploadPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import SettingsPage from './pages/SettingsPage';
import SharedMeetingPage from './pages/SharedMeetingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ForYouPage from './pages/ForYouPage';
import CoachingPage from './pages/CoachingPage';
import CalendarPage from './pages/CalendarPage';
import RecommendationsPage from './pages/RecommendationsPage';
import WorkspacePage from './pages/WorkspacePage';
import WorkspaceAdminPage from './pages/WorkspaceAdminPage';
import BillingPage from './pages/BillingPage';
import './App.css';

// ── Loading screen ────────────────────────────────────────────
const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-50">
    <Spinner size={28} className="text-teal-600" />
    <p className="text-sm text-stone-500">載入中...</p>
  </div>
);

// ── Dev quick-login ────────────────────────────────────────────
const DevLoginButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDevLogin = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      const res = await fetch(`${backendUrl}/api/auth/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@xcloudai.com.tw', name: '示範用戶' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '登入失敗');
      localStorage.setItem('lisbot_token', json.data.token);
      localStorage.setItem('lisbot_user', JSON.stringify(json.data.user));
      window.location.reload();
    } catch (e: any) {
      setError(e.message ?? '無法連線至後端');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mt-6 pt-5 border-t border-stone-200">
      <p className="text-xs text-stone-400 text-center mb-3">開發測試用</p>
      <Button variant="secondary" className="w-full" loading={loading} onClick={handleDevLogin}>
        {loading ? '登入中…' : '一鍵體驗（免帳號）'}
      </Button>
      {error && <p className="mt-2 text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
};

// ── Login page ────────────────────────────────────────────────
const LoginPage: React.FC = () => (
  <div className="min-h-screen flex bg-stone-50">
    {/* Left: brand panel (hidden on mobile) */}
    <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10 bg-white border-r border-stone-200">
      <div className="flex items-center gap-2.5">
        <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-8 h-8 rounded-lg" />
        <span className="text-stone-900 font-semibold text-[15px] tracking-tight">xCloud Lisbot</span>
      </div>

      <div>
        <blockquote className="text-base text-stone-700 leading-relaxed mb-4">
          「自動產生會議記錄、追蹤行動事項、支援台語與客語識別，讓每一次會議都留下清晰紀錄。」
        </blockquote>
        <p className="text-xs text-stone-400">xCloud Lisbot 企業版</p>
      </div>

      <div className="space-y-3">
        {[
          { label: '即時字幕', desc: '支援繁中 · 台語 · 客語' },
          { label: 'AI 摘要', desc: '7 種會議模式，GPT-4.1 生成' },
          { label: 'Outlook 整合', desc: '從行事曆一鍵開始錄音' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-teal-600" />
            <span className="text-sm text-stone-500">
              <span className="text-stone-800 font-medium">{item.label}</span>
              {' '}· {item.desc}
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* Right: login form */}
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[360px]">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-16 h-16 rounded-2xl mb-3" />
          <span className="text-stone-900 font-semibold text-base tracking-tight">xCloud Lisbot</span>
        </div>

        <h1 className="text-xl font-semibold text-stone-900 mb-1.5">登入</h1>
        <p className="text-sm text-stone-500 mb-8">使用您的企業帳戶登入</p>

        <OAuthButtons />
        <DevLoginButton />

        <p className="mt-8 text-center text-xs text-stone-400 leading-relaxed">
          登入即表示您同意我們的<br />
          服務條款與隱私權政策
        </p>
      </div>
    </div>
  </div>
);

// ── Auth gate ─────────────────────────────────────────────────
const AuthGate: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user)    return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="record"        element={<RecordingPage />} />
        <Route path="upload"        element={<UploadPage />} />
        <Route path="meeting/:id"   element={<MeetingDetailPage />} />
        <Route path="settings"      element={<SettingsPage />} />
        <Route path="analytics"     element={<AnalyticsPage />} />
        <Route path="for-you"       element={<ForYouPage />} />
        <Route path="coaching"      element={<CoachingPage />} />
        <Route path="calendar"         element={<CalendarPage />} />
        <Route path="recommendations"   element={<RecommendationsPage />} />
        <Route path="workspace"         element={<WorkspacePage />} />
        <Route path="workspace-admin"   element={<WorkspaceAdminPage />} />
        <Route path="billing"           element={<BillingPage />} />
        <Route path="auth/callback"     element={<DashboardPage />} />
        <Route path="*"             element={<DashboardPage />} />
      </Route>
    </Routes>
  );
};

// ── App root ──────────────────────────────────────────────────
const App: React.FC = () => (
  <ErrorBoundary>
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <FolderProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="shared/:token" element={<SharedMeetingPage />} />
            <Route path="*" element={<AuthGate />} />
          </Routes>
        </BrowserRouter>
        </ToastProvider>
        </FolderProvider>
      </AuthProvider>
    </MsalProvider>
  </ErrorBoundary>
);

export default App;
