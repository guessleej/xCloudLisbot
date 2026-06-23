import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui';

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });

    const errorsUrl = `${process.env.REACT_APP_BACKEND_URL || ''}/api/errors`;
    const payload = JSON.stringify({
      type: 'frontend_error',
      message: error.message,
      stack: error.stack?.slice(0, 500),
      ts: Date.now(),
    });
    // sendBeacon does a fire-and-forget POST — ideal for error reporting
    if (navigator.sendBeacon) {
      navigator.sendBeacon(errorsUrl, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(errorsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {});
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 shadow-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle size={22} strokeWidth={1.75} />
            </div>
            <p className="text-base font-semibold text-stone-900 mb-1">發生錯誤</p>
            <p className="text-sm text-stone-600 mb-6 break-words">{this.state.message}</p>
            <Button variant="primary" size="md" onClick={() => window.location.reload()}>
              重新整理
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
