import React from 'react';
import { Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Microsoft SVG Icon
const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

interface OAuthButtonsProps {
  compact?: boolean;
}

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ compact = false }) => {
  const { loginWithMicrosoft, loginWithDev } = useAuth();
  const isDev = process.env.REACT_APP_ENVIRONMENT === 'development';

  const baseClass = compact
    ? 'flex items-center justify-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors min-h-0 min-w-0'
    : 'flex items-center justify-center gap-3 w-full h-11 px-4 rounded-md border text-sm font-medium transition-colors min-h-0';

  return (
    <div className={compact ? 'flex gap-2' : 'space-y-2.5 w-full'}>
      {/* Microsoft */}
      <button
        onClick={loginWithMicrosoft}
        className={`${baseClass} bg-white border-stone-300 text-stone-900 hover:bg-stone-50`}
        title="使用 Microsoft 帳號登入"
      >
        <MicrosoftIcon />
        {!compact && <span>使用 Microsoft 登入</span>}
      </button>

      {/* Dev Login (development only) */}
      {isDev && !compact && (
        <button
          onClick={() => loginWithDev()}
          className={`${baseClass} bg-white border-dashed border-stone-300 text-stone-500 hover:bg-stone-50`}
          title="開發模式快速登入"
        >
          <Wrench size={16} strokeWidth={1.75} />
          <span>Dev 快速登入</span>
        </button>
      )}
    </div>
  );
};

export default OAuthButtons;
