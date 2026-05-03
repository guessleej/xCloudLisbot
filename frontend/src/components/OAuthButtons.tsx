import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

const OAuthButtons: React.FC = () => {
  const { loginWithMicrosoft } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleMicrosoft = async () => {
    setLoading(true);
    try { await loginWithMicrosoft(); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleMicrosoft}
        disabled={loading}
        className="w-full h-11 flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
      >
        <MicrosoftIcon />
        {loading ? '登入中...' : '使用 Microsoft 登入'}
      </button>
    </div>
  );
};

export default OAuthButtons;
