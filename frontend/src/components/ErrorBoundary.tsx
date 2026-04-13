import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 px-6">
          <div className="max-w-sm w-full bg-white rounded-lg border border-stone-200 p-8 text-center">
            <div className="w-10 h-10 mx-auto mb-4 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center">
              <AlertTriangle size={20} strokeWidth={1.75} className="text-amber-600" />
            </div>
            <h1 className="text-lg font-semibold text-stone-900 mb-2">發生未預期的錯誤</h1>
            <p className="text-sm text-stone-500 mb-6">
              {this.state.error?.message || '應用程式遇到問題，請重新整理頁面。'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="h-9 px-5 bg-stone-900 text-white rounded-md font-medium hover:bg-stone-800 transition-colors text-sm"
            >
              返回首頁
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
