import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Waves, Search, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const TopBar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="h-14 bg-white border-b border-stone-200 flex items-center px-4 gap-4 flex-shrink-0 sticky top-0 z-20">
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 flex-shrink-0 min-h-0 min-w-0"
      >
        <div className="w-7 h-7 bg-stone-900 rounded-md flex items-center justify-center">
          <Waves className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        <span className="font-semibold text-stone-900 hidden sm:block text-sm tracking-tight">xCloudLisbot</span>
      </button>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="搜尋會議..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-md text-sm bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-stone-400 transition-colors"
          />
        </div>
      </form>

      {/* User menu */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex items-center gap-2 h-9 px-1 rounded-md hover:bg-stone-100 transition-colors min-h-0 min-w-0"
          aria-label="使用者選單"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 bg-stone-200 text-stone-700 rounded-full flex items-center justify-center text-xs font-medium">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+4px)] w-60 bg-white border border-stone-200 rounded-md shadow-md overflow-hidden fade-in">
            {/* User info */}
            <div className="px-3 py-3 border-b border-stone-200">
              <p className="text-sm font-medium text-stone-900 truncate">{user?.name || '未命名使用者'}</p>
              <p className="text-xs text-stone-500 truncate mt-0.5">{user?.email || ''}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors min-h-0 min-w-0"
              >
                <SettingsIcon size={14} strokeWidth={1.75} className="text-stone-500" />
                設定
              </button>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors min-h-0 min-w-0"
              >
                <LogOut size={14} strokeWidth={1.75} className="text-stone-500" />
                登出
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopBar;
