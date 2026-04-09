import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { AuthProvider, msalInstance, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import OAuthButtons from './components/OAuthButtons';
import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import UploadPage from './pages/UploadPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

const AuthGate: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">正在驗證登入狀態...</p>
      </div>
    );
  }

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
            {['即時字幕', '語者辨識', 'GPT-4 摘要', '多語言', '日曆整合', '團隊協作'].map(f => (
              <span key={f} className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-full">{f}</span>
            ))}
          </div>
          <OAuthButtons />
          <p className="mt-6 text-xs text-gray-400">支援 Microsoft · Google · GitHub 帳號登入</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="record" element={<RecordingPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="meeting/:id" element={<MeetingDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="auth/callback" element={<DashboardPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </AuthProvider>
    </MsalProvider>
  </ErrorBoundary>
);

export default App;
