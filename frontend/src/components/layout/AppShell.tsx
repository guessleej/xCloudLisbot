import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  FileText, Calendar, User, TrendingUp, BarChart2,
  Mic, Upload, Settings, ChevronDown, FolderClosed,
  Plus, Menu, X, Check, Pencil, Trash2, Video,
  Sparkles, LayoutDashboard, Building2, CreditCard,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFolders } from '../../contexts/FolderContext';
import MobileBottomNav from './MobileBottomNav';
import { Modal, Button, Field, Input, Select, Textarea } from '../ui';

// ─── Nav item ─────────────────────────────────────────────────
const NavItem: React.FC<{
  to: string; icon: React.ReactNode; label: string; end?: boolean; onClick?: () => void;
}> = ({ to, icon, label, end, onClick }) => (
  <NavLink
    to={to} end={end} onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors leading-tight ${
        isActive
          ? 'bg-teal-50 text-teal-700 font-medium'
          : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
      }`
    }
  >
    <span className="flex-shrink-0">{icon}</span>
    <span className="truncate">{label}</span>
  </NavLink>
);

// ─── Folder item ──────────────────────────────────────────────
const FolderItem: React.FC<{
  name: string;
  isBuiltin: boolean;
  onRename: (next: string) => void;
  onDelete: () => void;
  onClick?: () => void;
}> = ({ name, isBuiltin, onRename, onDelete, onClick }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (editing) { setDraft(name); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, name]);

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== name) onRename(t);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-[5px]">
        <FolderClosed size={14} strokeWidth={1.75} className="text-stone-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={commitRename}
          className="flex-1 min-w-0 bg-white text-stone-900 text-sm px-1.5 py-0.5 rounded outline-none border border-teal-500"
        />
        <button onClick={commitRename} aria-label="確認" className="text-teal-700 flex-shrink-0">
          <Check size={14} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center rounded-lg">
      <NavLink
        to={`/?folder=${encodeURIComponent(name)}`}
        onClick={onClick}
        className={({ isActive }) =>
          `flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors min-w-0 ${
            isActive
              ? 'text-teal-700 bg-teal-50'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
          }`
        }
      >
        <FolderClosed size={14} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="truncate">{name}</span>
      </NavLink>

      {!isBuiltin && (
        <div ref={menuRef} className="absolute right-1 flex-shrink-0">
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o); }}
            aria-label="文件夾選項"
            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-all"
          >
            <Pencil size={12} strokeWidth={1.75} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+2px)] w-32 bg-white border border-stone-200 rounded-lg shadow-pop z-50 py-1 fade-in">
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Pencil size={12} strokeWidth={1.75} /> 重新命名
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-stone-50 transition-colors"
              >
                <Trash2 size={12} strokeWidth={1.75} /> 刪除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Profile modal ────────────────────────────────────────────
const LANG_OPTIONS = [
  { value: 'zh-TW', label: '繁體中文（台灣）' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '简体中文' },
];

const ROLE_OPTIONS = ['工程師', '產品經理', '設計師', '行銷', '業務', '管理層', '其他'];

const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, updateUser } = useAuth();

  const [draft, setDraft] = useState({
    name: user?.name || '',
    title: user?.title || '',
    businessRole: user?.businessRole || '',
    department: user?.department || '',
    preferredLanguage: user?.preferredLanguage || 'zh-TW',
    bio: user?.bio || '',
  });

  const handleSave = () => { updateUser(draft); onClose(); };

  return (
    <Modal onClose={onClose} labelledBy="profile-title" maxWidth="max-w-md" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
        <h2 id="profile-title" className="text-[15px] font-semibold text-stone-900">個人資料</h2>
        <button onClick={onClose} aria-label="關閉" className="text-stone-400 hover:text-stone-700 transition-colors">
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-5 pt-5 pb-4 flex items-center gap-4 border-b border-stone-100">
        {user?.avatar
          ? <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full" />
          : <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold bg-teal-50 text-teal-700">
              {draft.name?.[0]?.toUpperCase() || '?'}
            </div>}
        <div>
          <p className="text-sm font-medium text-stone-900">{draft.name || '使用者'}</p>
          <p className="text-xs text-stone-500 mt-0.5">{user?.email}</p>
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 text-stone-600">
            {user?.provider === 'microsoft' ? 'Microsoft' :
             user?.provider === 'google' ? 'Google' :
             user?.provider === 'github' ? 'GitHub' : '本地帳號'}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 max-h-[380px] overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <Field label="姓名" required>
            <Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="您的姓名" />
          </Field>
          <Field label="職稱">
            <Input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="例：資深工程師" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="業務角色">
            <Select value={draft.businessRole} onChange={e => setDraft(d => ({ ...d, businessRole: e.target.value }))}>
              <option value="">請選擇</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="部門">
            <Input value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} placeholder="例：產品部" />
          </Field>
        </div>
        <Field label="語言偏好">
          <Select value={draft.preferredLanguage} onChange={e => setDraft(d => ({ ...d, preferredLanguage: e.target.value }))}>
            {LANG_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </Field>
        <Field label="個人簡介">
          <Textarea rows={2} value={draft.bio} onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))} placeholder="簡短介紹自己（選填）" />
        </Field>
      </div>

      <div className="flex gap-3 px-5 py-4 border-t border-stone-100">
        <Button variant="primary" className="flex-1" disabled={!draft.name.trim()} onClick={handleSave}>儲存</Button>
        <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
      </div>
    </Modal>
  );
};

// ─── Sidebar content ──────────────────────────────────────────
const SidebarContent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { user, logout } = useAuth();
  const { folders, isBuiltin, addFolder, renameFolder, removeFolder } = useFolders();
  const navigate = useNavigate();

  const [foldersOpen, setFoldersOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  useEffect(() => {
    if (adding) { setNewName(''); addInputRef.current?.focus(); }
  }, [adding]);

  const commitAdd = () => { addFolder(newName); setAdding(false); setNewName(''); };
  const go = (path: string) => { navigate(path); onClose?.(); };
  const sz = 16, sw = 1.75;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[68px] flex-shrink-0 border-b border-stone-100">
        <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-9 h-9 rounded-xl flex-shrink-0" />
        <span className="text-stone-900 font-semibold text-[15px] tracking-tight">xCloud Lisbot</span>
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-4 pb-2 flex-shrink-0 space-y-2">
        <Button variant="primary" size="md" className="w-full" icon={<Mic size={15} strokeWidth={1.75} />} onClick={() => go('/record')}>
          開始錄音
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon={<Video size={14} strokeWidth={1.75} />} onClick={() => go('/?compose=online')}>
            線上會議
          </Button>
          <Button variant="secondary" size="sm" icon={<Upload size={14} strokeWidth={1.75} />} onClick={() => go('/upload')}>
            上傳
          </Button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-2 space-y-0.5">
        <NavItem to="/" icon={<FileText size={sz} strokeWidth={sw} />} label="報告" end onClick={onClose} />
        <NavItem to="/calendar" icon={<Calendar size={sz} strokeWidth={sw} />} label="日曆" onClick={onClose} />
        <NavItem to="/for-you" icon={<User size={sz} strokeWidth={sw} />} label="我的摘要" onClick={onClose} />
        <NavItem to="/coaching" icon={<TrendingUp size={sz} strokeWidth={sw} />} label="說話分析" onClick={onClose} />
        <NavItem to="/analytics" icon={<BarChart2 size={sz} strokeWidth={sw} />} label="會議政策" onClick={onClose} />
        <NavItem to="/recommendations" icon={<Sparkles size={sz} strokeWidth={sw} />} label="會議推薦" onClick={onClose} />
        <NavItem to="/workspace" icon={<LayoutDashboard size={sz} strokeWidth={sw} />} label="工作區概覽" onClick={onClose} />

        <div className="pt-4">
          <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-stone-400 font-medium">管理</div>
          <div className="mt-1 space-y-0.5">
            <NavItem to="/workspace-admin" icon={<Building2 size={sz} strokeWidth={sw} />} label="管理工作區" onClick={onClose} />
            <NavItem to="/billing" icon={<CreditCard size={sz} strokeWidth={sw} />} label="計劃和帳單" onClick={onClose} />
          </div>
        </div>

        {/* Folders */}
        <div className="pt-3">
          <button
            onClick={() => setFoldersOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1 text-[11px] uppercase tracking-wider text-stone-400 font-medium hover:text-stone-600 transition-colors"
          >
            <span>文件夾</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={e => { e.stopPropagation(); setFoldersOpen(true); setAdding(true); }}
                aria-label="新增文件夾"
                className="hover:text-teal-700 transition-colors"
              >
                <Plus size={13} strokeWidth={1.75} />
              </button>
              <ChevronDown size={12} strokeWidth={1.75} className={`transition-transform duration-150 ${foldersOpen ? '' : '-rotate-90'}`} />
            </div>
          </button>

          {foldersOpen && (
            <div className="mt-1 space-y-0.5">
              {folders.map(f => (
                <FolderItem
                  key={f}
                  name={f}
                  isBuiltin={isBuiltin(f)}
                  onRename={next => renameFolder(f, next)}
                  onDelete={() => removeFolder(f)}
                  onClick={onClose}
                />
              ))}
              {adding && (
                <div className="flex items-center gap-1.5 px-3 py-[5px]">
                  <FolderClosed size={14} strokeWidth={1.75} className="text-stone-400 flex-shrink-0" />
                  <input
                    ref={addInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitAdd();
                      if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                    }}
                    onBlur={() => { if (!newName.trim()) setAdding(false); else commitAdd(); }}
                    placeholder="文件夾名稱"
                    className="flex-1 min-w-0 bg-white text-stone-900 text-sm px-1.5 py-0.5 rounded outline-none border border-teal-500 placeholder:text-stone-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-3 mt-3 border-t border-stone-100">
          <NavItem to="/settings" icon={<Settings size={sz} strokeWidth={sw} />} label="設定" onClick={onClose} />
        </div>
      </nav>

      {/* User menu */}
      <div ref={userMenuRef} className="flex-shrink-0 px-3 py-3 relative border-t border-stone-100">
        {userMenuOpen && (
          <div className="absolute left-3 right-3 bottom-full mb-2 rounded-xl overflow-hidden shadow-float z-50 bg-white border border-stone-200">
            {[
              { label: '個人資料', action: () => { setProfileOpen(true); setUserMenuOpen(false); } },
              { label: '帳戶設置', action: () => { go('/settings'); setUserMenuOpen(false); } },
              { label: '計劃和帳單', action: () => { go('/billing'); setUserMenuOpen(false); } },
              { label: '工作區設置', action: () => { go('/workspace-admin'); setUserMenuOpen(false); } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                {item.label}
              </button>
            ))}
            <div className="border-t border-stone-100">
              <button onClick={() => { logout(); setUserMenuOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-stone-50 transition-colors">
                登出
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-stone-100 transition-colors text-left"
        >
          {user?.avatar
            ? <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full flex-shrink-0" />
            : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-stone-200 text-stone-700">
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-900 truncate leading-tight">{user?.name || '使用者'}</p>
            <p className="text-xs text-stone-500 truncate leading-tight mt-0.5">{user?.email || ''}</p>
          </div>
          <ChevronDown size={14} strokeWidth={1.75} className={`flex-shrink-0 text-stone-400 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
};

// ─── Shell ────────────────────────────────────────────────────
const AppShell: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 overflow-hidden border-r border-stone-200">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 flex flex-col z-50 shadow-float">
            <button onClick={() => setMobileOpen(false)} aria-label="關閉選單"
                    className="absolute top-4 right-3 text-stone-400 hover:text-stone-700 transition-colors z-10">
              <X size={18} strokeWidth={1.75} />
            </button>
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden h-14 flex items-center gap-3 px-4 flex-shrink-0 bg-white border-b border-stone-200">
          <button onClick={() => setMobileOpen(true)} aria-label="開啟選單" className="text-stone-600 hover:text-stone-900 transition-colors">
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-6 h-6 rounded-md" />
          <span className="text-stone-900 font-semibold text-sm">xCloud Lisbot</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
};

export default AppShell;
