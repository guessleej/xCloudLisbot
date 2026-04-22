import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { Waves } from 'lucide-react';
import { AuthProvider, msalInstance, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import OAuthButtons from './components/OAuthButtons';
import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import UploadPage from './pages/UploadPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import SettingsPage from './pages/SettingsPage';
import SharedMeetingPage from './pages/SharedMeetingPage';
import './App.css';

const AuthGate: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 gap-4">
        <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
        <p className="text-sm text-stone-500">驗證中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center mb-10">
            <div className="w-10 h-10 bg-stone-900 rounded-md flex items-center justify-center mb-6">
              <Waves className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-[28px] font-semibold text-stone-900 tracking-tight">XMeet AI</h1>
            <p className="text-sm text-stone-500 mt-2">AI-powered meeting intelligence</p>
          </div>
          <OAuthButtons />
          <p className="mt-10 text-center text-xs text-stone-400">
            支援 Microsoft · Google · GitHub
          </p>
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
          <Routes>
            {/* Public route — no login required */}
            <Route path="shared/:token" element={<SharedMeetingPage />} />
            {/* All other routes require auth */}
            <Route path="*" element={<AuthGate />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </MsalProvider>
  </ErrorBoundary>
);

export default App;
