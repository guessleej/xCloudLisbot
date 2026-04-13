import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Waves, Search, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const TopBar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

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

      {/* User avatar + logout */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-7 h-7 rounded-full cursor-pointer"
            onClick={logout}
            title="登出"
          />
        ) : (
          <button
            onClick={logout}
            title="登出"
            className="w-7 h-7 bg-stone-200 text-stone-700 rounded-full flex items-center justify-center text-xs font-medium min-h-0 min-w-0"
          >
            {user?.name?.[0]?.toUpperCase() || <LogOut size={14} />}
          </button>
        )}
      </div>
    </header>
  );
};

export default TopBar;
