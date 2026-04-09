import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();

  const navItems = [
    { to: '/', label: '首頁', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )},
    { to: '/upload', label: '上傳', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
      </svg>
    )},
  ];

  const rightItems = [
    { to: '/?search=1', label: '搜尋', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>
      </svg>
    )},
    { to: '/settings', label: '設定', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    )},
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl"
      style={{ paddingBottom: 'var(--sab)', background: 'rgba(255,255,255,0.92)', borderTop: '1px solid var(--border)' }}>
      <div className="flex items-end max-w-lg mx-auto">
        {/* Left items */}
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 transition-all ${
                isActive ? 'text-indigo-600' : 'text-gray-400'
              }`
            }>
            {item.icon}
            <span className="text-[10px] mt-1 font-semibold">{item.label}</span>
          </NavLink>
        ))}

        {/* Center FAB — Record button */}
        <div className="flex-1 flex justify-center -mt-4">
          <button onClick={() => navigate('/record')}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-90"
            style={{ background: 'var(--primary)', boxShadow: '0 4px 20px rgba(91, 95, 230, 0.35)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>
        </div>

        {/* Right items */}
        {rightItems.map(item => (
          <NavLink key={item.to} to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 transition-all ${
                isActive ? 'text-indigo-600' : 'text-gray-400'
              }`
            }>
            {item.icon}
            <span className="text-[10px] mt-1 font-semibold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
};

export default MobileBottomNav;
