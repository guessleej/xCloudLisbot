import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Upload, Mic, Search, Settings } from 'lucide-react';

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();

  const leftItems = [
    { to: '/', label: '首頁', Icon: Home, end: true },
    { to: '/upload', label: '上傳', Icon: Upload, end: false },
  ];

  const rightItems = [
    { to: '/?search=1', label: '搜尋', Icon: Search, end: false },
    { to: '/settings', label: '設定', Icon: Settings, end: false },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200"
      style={{ paddingBottom: 'var(--sab)' }}
    >
      <div className="flex items-end max-w-lg mx-auto">
        {/* Left items */}
        {leftItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 min-h-0 min-w-0 transition-colors ${
                isActive ? 'text-stone-900' : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            <item.Icon size={20} strokeWidth={1.75} />
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </NavLink>
        ))}

        {/* Center FAB — Record button */}
        <div className="flex-1 flex justify-center -mt-4">
          <button
            onClick={() => navigate('/record')}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-teal-600 text-white hover:bg-teal-700 transition-colors active:scale-95 shadow-sm min-h-0 min-w-0"
            aria-label="開始錄音"
          >
            <Mic size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Right items */}
        {rightItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 min-h-0 min-w-0 transition-colors ${
                isActive ? 'text-stone-900' : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            <item.Icon size={20} strokeWidth={1.75} />
            <span className="text-[10px] mt-1 font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
};

export default MobileBottomNav;
