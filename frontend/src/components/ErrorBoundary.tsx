import React from 'react';

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
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium text-slate-900 mb-1">發生錯誤</p>
            <p className="text-xs text-slate-500 mb-4">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-[#00D4FF] hover:underline"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
