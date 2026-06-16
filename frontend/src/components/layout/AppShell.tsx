import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  FileText, Calendar, User, TrendingUp, BarChart2,
  Mic, Upload, Settings, ChevronDown, FolderClosed,
  Plus, Menu, X, LogOut, MoreHorizontal, Check, Pencil, Trash2,
  Sparkles, LayoutDashboard, Building2, CreditCard, Camera,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFolders } from '../../contexts/FolderContext';
import MobileBottomNav from './MobileBottomNav';

// ─── Nav item ─────────────────────────────────────────────────
const NavItem: React.FC<{
  to: string; icon: React.ReactNode; label: string; end?: boolean; onClick?: () => void;
}> = ({ to, icon, label, end, onClick }) => (
  <NavLink
    to={to} end={end} onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors leading-tight ${
        isActive
          ? 'bg-[#00D4FF]/[0.12] text-[#00D4FF] font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
      }`
    }
  >
    <span className="flex-shrink-0 opacity-80">{icon}</span>
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
      <div className="flex items-center gap-1 px-3 py-[5px]">
        <FolderClosed size={13} strokeWidth={1.75} className="text-slate-500 flex-shrink-0" />
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={commitRename}
          className="flex-1 min-w-0 bg-white/[0.08] text-white text-[13px] px-1.5 py-0.5 rounded outline-none border border-[#00D4FF]/40"
        />
        <button onClick={commitRename} className="text-[#00D4FF] flex-shrink-0">
          <Check size={13} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center rounded-md">
      <NavLink
        to={`/?folder=${encodeURIComponent(name)}`}
        onClick={onClick}
        className={({ isActive }) =>
          `flex-1 flex items-center gap-2.5 px-3 py-[6px] rounded-md text-[13px] transition-colors min-w-0 ${
            isActive
              ? 'text-[#00D4FF] bg-[#00D4FF]/[0.08]'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
          }`
        }
      >
        <FolderClosed size={13} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="truncate">{name}</span>
      </NavLink>

      {!isBuiltin && (
        <div ref={menuRef} className="absolute right-1 flex-shrink-0">
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o); }}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-white/[0.08] transition-all"
          >
            <MoreHorizontal size={12} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+2px)] w-32 bg-[#1A2035] border rounded-lg shadow-xl z-50 py-1 fade-in"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <Pencil size={12} strokeWidth={1.75} /> 重新命名
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-white/[0.06] transition-colors"
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

const ROLE_OPTIONS = [
  '工程師', '產品經理', '設計師', '行銷', '業務', '管理層', '其他',
];

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

  const handleSave = () => {
    updateUser(draft);
    onClose();
  };

  const Field: React.FC<{
    label: string; required?: boolean;
    children: React.ReactNode;
  }> = ({ label, required, children }) => (
    <div>
      <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
        {label}{required && <span className="text-[#00D4FF] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );

  const inputCls = "w-full bg-white/[0.06] border rounded-md px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#00D4FF]/50 transition-colors";
  const borderCls = "border-white/[0.1]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-[15px] font-semibold text-white">個人資料</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Avatar */}
        <div className="px-6 pt-5 pb-4 flex items-center gap-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="relative">
            {user?.avatar
              ? <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full" />
              : <div className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold"
                     style={{ background: 'rgba(0,212,255,0.15)', color: '#00D4FF' }}>
                  {draft.name?.[0]?.toUpperCase() || '?'}
                </div>
            }
            <button
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: '#00D4FF', color: '#0A0E27' }}
              title="更換頭像"
            >
              <Camera size={10} strokeWidth={2.5} />
            </button>
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">{draft.name || '使用者'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px]"
                  style={{ background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)' }}>
              {user?.provider === 'microsoft' ? 'Microsoft' :
               user?.provider === 'google' ? 'Google' :
               user?.provider === 'github' ? 'GitHub' : '本地帳號'}
            </span>
          </div>
        </div>

        {/* Fields */}
        <div className="px-6 py-4 space-y-4 max-h-[380px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field label="姓名" required>
              <input
                className={`${inputCls} ${borderCls}`}
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="您的姓名"
              />
            </Field>
            <Field label="職稱">
              <input
                className={`${inputCls} ${borderCls}`}
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="例：資深工程師"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="業務角色">
              <select
                className={`${inputCls} ${borderCls}`}
                value={draft.businessRole}
                onChange={e => setDraft(d => ({ ...d, businessRole: e.target.value }))}
                style={{ appearance: 'none' }}
              >
                <option value="">請選擇</option>
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r} style={{ background: '#1A2035' }}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="部門">
              <input
                className={`${inputCls} ${borderCls}`}
                value={draft.department}
                onChange={e => setDraft(d => ({ ...d, department: e.target.value }))}
                placeholder="例：產品部"
              />
            </Field>
          </div>

          <Field label="語言偏好">
            <select
              className={`${inputCls} ${borderCls}`}
              value={draft.preferredLanguage}
              onChange={e => setDraft(d => ({ ...d, preferredLanguage: e.target.value }))}
              style={{ appearance: 'none' }}
            >
              {LANG_OPTIONS.map(l => (
                <option key={l.value} value={l.value} style={{ background: '#1A2035' }}>{l.label}</option>
              ))}
            </select>
          </Field>

          <Field label="個人簡介">
            <textarea
              className={`${inputCls} ${borderCls} resize-none`}
              rows={2}
              value={draft.bio}
              onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))}
              placeholder="簡短介紹自己（選填）"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleSave}
            disabled={!draft.name.trim()}
            className="flex-1 py-2 rounded-md text-[13px] font-semibold disabled:opacity-40 transition-colors"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            儲存
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-md text-[13px] text-slate-300 border hover:text-white transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
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
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  useEffect(() => {
    if (adding) { setNewName(''); addInputRef.current?.focus(); }
  }, [adding]);

  const commitAdd = () => {
    const ok = addFolder(newName);
    if (!ok && newName.trim()) {
      // duplicate — shake input instead
    }
    setAdding(false);
    setNewName('');
  };

  const go = (path: string) => { navigate(path); onClose?.(); };
  const sz = 16; const sw = 1.75;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[72px] flex-shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <span className="text-white font-semibold text-[16px] tracking-tight">xCloud Lisbot</span>
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-3.5 pb-1 flex gap-2 flex-shrink-0">
        <button onClick={() => go('/record')}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-[13px] font-semibold"
          style={{ background: '#00D4FF', color: '#0A0E27' }}>
          <Mic size={13} strokeWidth={2.25} /> 錄音
        </button>
        <button onClick={() => go('/upload')}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-[13px] font-medium text-slate-300 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Upload size={13} strokeWidth={1.75} /> 上傳
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-2.5 space-y-0.5">
        <NavItem to="/" icon={<FileText size={sz} strokeWidth={sw} />} label="報告" end onClick={onClose} />
        <NavItem to="/calendar" icon={<Calendar size={sz} strokeWidth={sw} />} label="日曆" onClick={onClose} />
        <NavItem to="/for-you" icon={<User size={sz} strokeWidth={sw} />} label="我的摘要" onClick={onClose} />
        <NavItem to="/coaching" icon={<TrendingUp size={sz} strokeWidth={sw} />} label="說話分析" onClick={onClose} />
        <NavItem to="/analytics"       icon={<BarChart2 size={sz} strokeWidth={sw} />}       label="會議政策"   onClick={onClose} />
        <NavItem to="/recommendations"  icon={<Sparkles size={sz} strokeWidth={sw} />}        label="會議推薦"       onClick={onClose} />
        <NavItem to="/workspace"        icon={<LayoutDashboard size={sz} strokeWidth={sw} />} label="工作區概覽" onClick={onClose} />

        {/* Admin section */}
        <div className="pt-4">
          <div className="px-3 py-1 text-[11px] uppercase tracking-widest text-slate-600">管理</div>
          <div className="mt-1 space-y-0.5">
            <NavItem to="/workspace-admin" icon={<Building2 size={sz} strokeWidth={sw} />}  label="管理工作區" onClick={onClose} />
            <NavItem to="/billing"         icon={<CreditCard size={sz} strokeWidth={sw} />} label="計劃和帳單" onClick={onClose} />
          </div>
        </div>

        {/* Folders */}
        <div className="pt-3">
          <button
            onClick={() => setFoldersOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1 text-[11px] uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors"
          >
            <span>文件夾</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={e => { e.stopPropagation(); setFoldersOpen(true); setAdding(true); }}
                title="新增文件夾"
                className="hover:text-[#00D4FF] transition-colors"
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
              <ChevronDown
                size={11} strokeWidth={2}
                className={`transition-transform duration-150 ${foldersOpen ? '' : '-rotate-90'}`}
              />
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

              {/* Add input */}
              {adding && (
                <div className="flex items-center gap-1 px-3 py-[5px]">
                  <FolderClosed size={13} strokeWidth={1.75} className="text-slate-500 flex-shrink-0" />
                  <input
                    ref={addInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitAdd();
                      if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                    }}
                    onBlur={() => { if (!newName.trim()) { setAdding(false); } else commitAdd(); }}
                    placeholder="文件夾名稱"
                    className="flex-1 min-w-0 bg-white/[0.08] text-white text-[13px] px-1.5 py-0.5 rounded outline-none border border-[#00D4FF]/40 placeholder:text-slate-600"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <NavItem to="/settings" icon={<Settings size={sz} strokeWidth={sw} />} label="設定" onClick={onClose} />
        </div>
      </nav>

      {/* User — Read AI 風格：點擊展開向上選單 */}
      <div ref={userMenuRef} className="flex-shrink-0 px-3 py-3 relative"
           style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

        {/* 向上展開的選單 */}
        {userMenuOpen && (
          <div className="absolute left-3 right-3 bottom-full mb-2 rounded-xl overflow-hidden shadow-2xl z-50"
               style={{ background: '#16213E', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: '帳戶設置', action: () => { go('/settings'); setUserMenuOpen(false); } },
              { label: '計劃和帳單', action: () => { go('/billing'); setUserMenuOpen(false); } },
              { label: '工作區設置', action: () => { go('/workspace-admin'); setUserMenuOpen(false); } },
              { label: '支援', action: () => { window.open('https://github.com/guessleej/xCloudLisbot/issues', '_blank'); setUserMenuOpen(false); } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="w-full text-left px-4 py-2.5 text-[13px] text-slate-300 hover:bg-white/[0.07] hover:text-white transition-colors">
                {item.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => { logout(); setUserMenuOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-white/[0.07] hover:text-red-300 transition-colors">
                登出
              </button>
            </div>
          </div>
        )}

        {/* 觸發列 */}
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-white/[0.05] transition-colors text-left"
        >
          {user?.avatar
            ? <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full flex-shrink-0" />
            : <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                   style={{ background: 'rgba(123,47,255,0.2)', color: '#7B2FFF' }}>
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>
          }
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-white truncate leading-tight">{user?.name || '使用者'}</p>
            <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{user?.email || ''}</p>
          </div>
          <ChevronDown size={13} strokeWidth={1.75}
            className={`flex-shrink-0 text-slate-500 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
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
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9' }}>
      <aside className="hidden md:flex flex-col w-[240px] flex-shrink-0 overflow-hidden"
             style={{ background: '#0B0F23' }}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }}
               onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[240px] flex flex-col z-50"
                 style={{ background: '#0B0F23' }}>
            <button onClick={() => setMobileOpen(false)}
                    className="absolute top-4 right-3 text-slate-500 hover:text-slate-300 transition-colors z-10">
              <X size={17} strokeWidth={1.75} />
            </button>
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden h-14 flex items-center gap-3 px-4 flex-shrink-0"
                style={{ background: '#0B0F23', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-white transition-colors">
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-6 h-6 rounded-md" />
          <span className="text-white font-semibold text-[14px]">xCloud Lisbot</span>
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
