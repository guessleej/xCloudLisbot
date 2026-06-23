import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Puzzle, Video, FileText, Share2, Bell,
  FolderOpen, BookOpen, Settings2,
  Check, X, Pencil, LogOut, ChevronDown,
  AlertTriangle, HardDrive, ExternalLink, Info,
  Search, CalendarClock, Users2, Eye, EyeOff, Copy, Plus, Trash2,
} from 'lucide-react';
import TermDictionaryModal from '../components/TermDictionaryModal';
import SummaryTemplateModal from '../components/SummaryTemplateModal';
import { Button, Card, Badge, Input, Select, Toggle, IconButton, Skeleton, useToast } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { getCalendarStatus, getConnectUrl, disconnectCalendar, saveCalendarPreferences } from '../services/calendar';

// ── Types ──────────────────────────────────────────────────────
interface Profile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  provider: string;
  job_title: string;
  department: string;
  language: string;
  timezone: string;
}

// ── Constants ──────────────────────────────────────────────────
const LANGUAGES = [
  { value: 'zh-TW', label: '繁體中文（台灣）' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'nan-TW', label: '台語（閩南語）' },
  { value: 'hak-TW', label: '客語' },
];

const TIMEZONES = [
  { value: 'Asia/Taipei',    label: '亞洲 - 台北 (UTC+8)' },
  { value: 'Asia/Tokyo',     label: '亞洲 - 東京 (UTC+9)' },
  { value: 'Asia/Hong_Kong', label: '亞洲 - 香港 (UTC+8)' },
  { value: 'Asia/Singapore', label: '亞洲 - 新加坡 (UTC+8)' },
  { value: 'America/New_York',    label: '美洲 - 紐約 (UTC-5)' },
  { value: 'America/Los_Angeles', label: '美洲 - 洛杉磯 (UTC-8)' },
  { value: 'Europe/London',  label: '歐洲 - 倫敦 (UTC+0)' },
  { value: 'Europe/Paris',   label: '歐洲 - 巴黎 (UTC+1)' },
];

const PROVIDER_LABELS: Record<string, string> = {
  microsoft: 'Microsoft', google: 'Google', github: 'GitHub', apple: 'Apple', dev: '開發帳號',
};

type NavTab =
  | 'profile' | 'integrations' | 'recording' | 'report-content'
  | 'report-sharing' | 'notifications' | 'search-copilot' | 'smart-scheduler'
  | 'folders' | 'contacts-groups' | 'terminology' | 'advanced';

const NAV: { id: NavTab; label: string; icon: React.FC<any> }[] = [
  { id: 'profile',         label: '個人資料和帳戶', icon: User },
  { id: 'integrations',    label: '集成',            icon: Puzzle },
  { id: 'recording',       label: '會議記錄',         icon: Video },
  { id: 'report-content',  label: '報告內容',         icon: FileText },
  { id: 'report-sharing',  label: '報告共享',         icon: Share2 },
  { id: 'notifications',   label: '通知',             icon: Bell },
  { id: 'search-copilot',  label: '搜索副駕駛',       icon: Search },
  { id: 'smart-scheduler', label: '智能調度器',       icon: CalendarClock },
  { id: 'folders',         label: '文件夾',            icon: FolderOpen },
  { id: 'contacts-groups', label: '聯繫人與群組',     icon: Users2 },
  { id: 'terminology',     label: '自定義詞匯',       icon: BookOpen },
  { id: 'advanced',        label: '高級',              icon: Settings2 },
];

// ── Shared primitives ──────────────────────────────────────────

// Info notice bar (neutral, low-emphasis)
const InfoBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-start gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-xs text-stone-600 leading-relaxed ${className}`}>
    <Info size={14} strokeWidth={1.75} className="text-stone-400 mt-0.5 flex-shrink-0" />
    <span className="flex-1">{children}</span>
  </div>
);

// Section header icon badge
const PanelHeader: React.FC<{ icon: React.FC<any>; title: string; desc: string; preview?: boolean }> = ({
  icon: Icon, title, desc, preview,
}) => (
  <div className="flex items-start gap-3 mb-6">
    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-teal-50">
      <Icon size={18} strokeWidth={1.75} className="text-teal-700" />
    </div>
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
        {preview && <Badge tone="neutral">預覽</Badge>}
      </div>
      <p className="text-xs text-stone-500">{desc}</p>
    </div>
  </div>
);

// "即將推出" inline marker
const SoonBadge: React.FC = () => <Badge tone="warning" className="ml-1.5">即將推出</Badge>;

// Table row: label | value | [edit]
const TableRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  onEdit?: () => void;
  noBorder?: boolean;
}> = ({ label, value, onEdit, noBorder }) => (
  <div className={`flex items-center py-3.5 px-0 ${noBorder ? '' : 'border-b border-stone-100'}`}>
    <span className="text-sm text-stone-600 w-32 flex-shrink-0">{label}</span>
    <span className="flex-1 text-sm text-stone-900">{value ?? '—'}</span>
    {onEdit && (
      <IconButton aria-label={`編輯${label}`} onClick={onEdit}>
        <Pencil size={14} strokeWidth={1.75} />
      </IconButton>
    )}
  </div>
);

// Inline edit row
const EditRow: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
  noBorder?: boolean;
}> = ({ label, value, placeholder, onSave, noBorder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { setDraft(value); setEditing(false); return; }
    setSaving(true);
    await onSave(trimmed);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`flex items-center py-3 px-0 gap-2 ${noBorder ? '' : 'border-b border-stone-100'}`}>
        <span className="text-sm text-stone-600 w-32 flex-shrink-0">{label}</span>
        <Input
          autoFocus value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
          className="flex-1"
        />
        <div className="flex gap-1 flex-shrink-0">
          <IconButton aria-label="確認" onClick={commit} disabled={saving} className="text-green-700 hover:bg-green-50">
            <Check size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton aria-label="取消" onClick={() => { setDraft(value); setEditing(false); }} className="text-red-600 hover:bg-red-50">
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <TableRow label={label} value={<span className={value ? '' : 'text-stone-400'}>{value || placeholder || '—'}</span>}
      onEdit={() => setEditing(true)} noBorder={noBorder} />
  );
};

// Dropdown row
const DropdownRow: React.FC<{
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<void>;
}> = ({ label, description, value, options, onSave }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = options.find(o => o.value === value)?.label ?? value;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = async (v: string) => {
    setOpen(false);
    if (v === value) return;
    setSaving(true);
    await onSave(v);
    setSaving(false);
  };

  return (
    <div className="mb-4" ref={ref}>
      {description && <p className="text-xs text-stone-500 mb-2">{description}</p>}
      <div className="relative">
        <button
          type="button"
          aria-label={label || '選擇'}
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 h-9 rounded-lg border border-stone-200 bg-white hover:border-stone-300 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors text-sm text-stone-900"
        >
          <span>{saving ? '儲存中…' : display}</span>
          <ChevronDown size={15} strokeWidth={1.75} className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-30 bg-white border border-stone-200 rounded-xl shadow-pop py-1 mt-1 max-h-52 overflow-y-auto">
            {options.map(o => (
              <button key={o.value} type="button" onClick={() => select(o.value)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-stone-50 text-left ${o.value === value ? 'text-teal-700 font-medium' : 'text-stone-700'}`}>
                {o.value === value && <Check size={13} strokeWidth={1.75} className="text-teal-700" />}
                {o.value !== value && <span className="w-3" />}
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Setting section card
const SettingCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({
  title, subtitle, children, className = '',
}) => (
  <div className={`mb-6 ${className}`}>
    {(title || subtitle) && (
      <div className="flex items-start gap-2 mb-3">
        <div>
          {title && <p className="text-sm font-semibold text-stone-900">{title}</p>}
          {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    )}
    <Card className="overflow-hidden">
      {children}
    </Card>
  </div>
);

// Toggle setting row
const ToggleRow: React.FC<{
  title: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  noBorder?: boolean;
  badge?: string;
  disabled?: boolean;
}> = ({ title, desc, value, onChange, noBorder, badge, disabled }) => (
  <div className={`flex items-start justify-between gap-4 px-4 py-4 ${noBorder ? '' : 'border-b border-stone-100'} ${disabled ? 'opacity-60' : ''}`}>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-stone-900">{title}</p>
        {badge && <Badge tone="neutral">{badge}</Badge>}
      </div>
      {desc && <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{desc}</p>}
    </div>
    <Toggle checked={value} onChange={onChange} disabled={disabled} aria-label={title} />
  </div>
);

// Integration item row
const IntegRow: React.FC<{
  logo: React.ReactNode;
  name: string;
  status?: string;
  statusColor?: string;
  badge?: string;
  action: string;
  onAction: () => void;
  noBorder?: boolean;
  comingSoon?: boolean;
}> = ({ logo, name, status, statusColor = 'text-stone-500', badge, action, onAction, noBorder, comingSoon }) => (
  <div className={`flex items-center gap-3 px-4 py-3.5 ${noBorder ? '' : 'border-b border-stone-100'} ${comingSoon ? 'opacity-60' : ''}`}>
    <div className="w-9 h-9 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {logo}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-stone-900">{name}</p>
        {badge && <Badge tone="warning">{badge}</Badge>}
      </div>
      {status && <p className={`text-xs mt-0.5 ${statusColor}`}>{status}</p>}
    </div>
    <Button
      variant={action === '連接' ? 'primary' : 'secondary'}
      size="sm"
      disabled={comingSoon}
      onClick={onAction}
      className="flex-shrink-0"
    >
      {action}
    </Button>
  </div>
);

// ── Content panels ─────────────────────────────────────────────

// 1. Profile & Account
const ProfilePanel: React.FC<{
  profile: Profile | null;
  loading: boolean;
  onSave: (p: Partial<Profile>) => Promise<void>;
  onLogout: () => void;
}> = ({ profile, loading, onSave, onLogout }) => {
  const p = profile;
  const email = p?.email ?? '—';
  const name  = p?.name  ?? '—';
  const initials = name.trim().slice(0, 2) || '?';
  const langLabel = LANGUAGES.find(l => l.value === (p?.language ?? 'zh-TW'))?.label ?? '繁體中文（台灣）';
  const tzLabel   = TIMEZONES.find(t => t.value === (p?.timezone ?? 'Asia/Taipei'))?.label ?? '亞洲 - 台北 (UTC+8)';

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={User} title="個人資料和帳戶" desc="管理名稱、角色、電子郵件、語言和時區設置。" />

      {/* 您的帳戶 */}
      <SettingCard title="您的帳戶" subtitle="管理個人資訊、主要郵箱和語言。">
        {loading ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
              <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-40" /></div>
            </div>
            <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* Avatar */}
            <div className="flex items-center gap-4 mb-5 pb-4 border-b border-stone-100">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-teal-700 text-white text-xl font-semibold select-none flex-shrink-0">
                {initials}
              </div>
              <Button variant="secondary" size="sm">上傳照片</Button>
            </div>

            {/* Editable fields */}
            <EditRow label="名稱" value={p?.name ?? ''} placeholder="輸入姓名" onSave={v => onSave({ name: v })} />
            <EditRow label="職位名稱" value={p?.job_title ?? ''} placeholder="如：CEO、工程師" onSave={v => onSave({ job_title: v })} />
            <TableRow label="角色等級" value={p?.provider === 'microsoft' ? '管理者' : '成員'} />
            <EditRow label="部門" value={p?.department ?? ''} placeholder="如：產品、工程" onSave={v => onSave({ department: v })} />

            {/* Email SSO warning */}
            {(p?.provider === 'microsoft' || p?.provider === 'google') && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 my-3">
                <AlertTriangle size={14} strokeWidth={1.75} className="text-amber-700 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  您的主要電子郵件無法更改，因為它與單點登錄帳戶相關聯。
                </p>
              </div>
            )}

            <TableRow label="主要電子郵件" value={email} noBorder />
          </div>
        )}
      </SettingCard>

      {/* 默認語言 */}
      <SettingCard title="默認語言" subtitle="設置 xCloud Lisbot 儀表板的默認語言">
        <div className="px-5 py-4">
          <DropdownRow
            label="語言" value={p?.language ?? 'zh-TW'}
            options={LANGUAGES}
            onSave={v => onSave({ language: v })}
          />
        </div>
      </SettingCard>

      {/* 時區 */}
      <SettingCard title="時區" subtitle="為您的會議記錄和行事曆設置時區">
        <div className="px-5 py-4">
          <DropdownRow
            label="時區" value={p?.timezone ?? 'Asia/Taipei'}
            options={TIMEZONES}
            onSave={v => onSave({ timezone: v })}
          />
        </div>
      </SettingCard>

      {/* 登入方式 */}
      <SettingCard title="登入方式" subtitle="將您的帳戶連接起來，使用這些提供商的憑証登入 xCloud Lisbot。">
        {loading ? (
          <div className="px-5 py-4"><Skeleton className="h-12 w-full" /></div>
        ) : (
          <div className="px-4 py-3 flex items-center gap-3">
            {/* Microsoft icon */}
            <svg viewBox="0 0 21 21" width="24" height="24" fill="none">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            <span className="text-sm font-medium text-stone-900 flex-1">{PROVIDER_LABELS[p?.provider ?? 'microsoft']}</span>
            <Badge tone="success">已連結</Badge>
          </div>
        )}
      </SettingCard>
    </div>
  );
};

// 2. Integrations
const IntegrationsPanel: React.FC<{
  calendarConnected: boolean;
  calendarEmail?: string;
  onManageCalendar: () => void;
  onDisconnect: () => void;
}> = ({ calendarConnected, calendarEmail, onManageCalendar, onDisconnect }) => (
  <div className="max-w-2xl">
    <PanelHeader icon={Puzzle} title="集成" desc="管理和連接外部工具和服務至 xCloud Lisbot。" />

    {/* Info bar */}
    <InfoBar className="mb-5">您的集成也可以在集成頁中管理</InfoBar>

    {/* Calendar & Meetings */}
    <SettingCard title="日歷和會議" subtitle="允許 xCloud Lisbot 加入您的會議並自動生成會議摘要">
      <IntegRow
        logo={
          <svg viewBox="0 0 21 21" width="22" height="22" fill="none">
            <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
            <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
            <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        }
        name="Outlook Calendar"
        status={calendarConnected ? (calendarEmail ? `已連接 · ${calendarEmail}` : '已連接') : '尚未連接'}
        statusColor={calendarConnected ? 'text-green-700' : 'text-stone-400'}
        badge={calendarConnected ? '智能排程日曆' : undefined}
        action={calendarConnected ? '中斷連線' : '連接'}
        onAction={calendarConnected ? onDisconnect : onManageCalendar}
      />
      <IntegRow
        logo={
          <svg viewBox="0 0 24 24" width="22" height="22">
            <circle cx="12" cy="12" r="12" fill="#2D8CFF" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">Z</text>
          </svg>
        }
        name="Zoom Calendar"
        status="即將推出"
        action="即將推出"
        onAction={() => {}}
        comingSoon
        noBorder
      />
    </SettingCard>

    {/* Apps */}
    <SettingCard title="應用程序" subtitle="在不同設備上集成 xCloud Lisbot，使用我們的桌面和移動應用程序。">
      <IntegRow
        logo={<img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-5 h-5 rounded" />}
        name="xCloud Lisbot Web Extension"
        status="Chrome / Edge 瀏覽器擴充功能"
        action="即將推出"
        onAction={() => {}}
        comingSoon
      />
      <IntegRow
        logo={<span className="text-lg">🤖</span>}
        name="xCloud Lisbot for Android"
        action="即將推出"
        onAction={() => {}}
        comingSoon
      />
      <IntegRow
        logo={<span className="text-lg">🍎</span>}
        name="xCloud Lisbot for iPhone"
        action="即將推出"
        onAction={() => {}}
        comingSoon
        noBorder
      />
    </SettingCard>

    {/* Cloud Storage */}
    <SettingCard title="雲端儲存" subtitle="音檔自動儲存至雲端。">
      <IntegRow
        logo={<HardDrive size={16} strokeWidth={1.75} className="text-stone-400" />}
        name="Azure Blob Storage"
        status="錄音檔儲存至 Azure 雲端儲存空間"
        action="即將推出"
        onAction={() => {}}
        comingSoon
        noBorder
      />
    </SettingCard>
  </div>
);

// 3. Meeting Recording
const RecordingPanel: React.FC = () => {
  const { getToken } = useAuth();
  const { show } = useToast();
  const [autoJoin,      setAutoJoin]      = useState(false);
  const [calendarScope, setCalendarScope] = useState<'all' | 'hosted'>('hosted');
  const [inviteScope,   setInviteScope]   = useState<'any' | 'internal'>('any');
  const [assistantName, setAssistantName] = useState('xCloud Lisbot 會議記錄');

  // Load the Recall Calendar V2 auto-join preference.
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const s = await getCalendarStatus(token);
        setAutoJoin(s.autoJoinEnabled);
        setCalendarScope(s.autoJoinScope);
      } catch { /* not connected yet */ }
    })();
  }, [getToken]);

  const persist = useCallback(async (enabled: boolean, scope: 'all' | 'hosted'): Promise<boolean> => {
    try {
      const token = await getToken();
      if (!token) return false;
      await saveCalendarPreferences(token, { autoJoinEnabled: enabled, autoJoinScope: scope });
      return true;
    } catch { return false; }
  }, [getToken]);

  // Optimistic with rollback + toast feedback — never silently fail to persist.
  const onToggleAutoJoin = async (v: boolean) => {
    setAutoJoin(v);
    if (await persist(v, calendarScope)) show('已儲存', 'success');
    else { setAutoJoin(!v); show('儲存偏好失敗，請稍後再試。', 'error'); }
  };
  const onScope = async (s: 'all' | 'hosted') => {
    const prev = calendarScope;
    setCalendarScope(s);
    if (await persist(autoJoin, s)) show('已儲存', 'success');
    else { setCalendarScope(prev); show('儲存偏好失敗，請稍後再試。', 'error'); }
  };

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={Video} title="會議記錄" desc="管理您的 xCloud Lisbot 助理如何加入和出現在會議中。" />

      <SettingCard title="自動加入偏好" subtitle="選擇 xCloud Lisbot 將自動加入的會議。">
        <div className="px-4">
          <ToggleRow
            title="自動加入日歷活動"
            desc="自動加入您已連接日歷中的預定會議。"
            value={autoJoin}
            onChange={onToggleAutoJoin}
          />

          {autoJoin && (
            <div className="px-0 py-4 border-b border-stone-100">
              <p className="text-xs font-medium text-stone-700 mb-3">哪些日歷事件</p>
              {[
                { value: 'all',    label: '所有日歷事件', desc: 'xCloud Lisbot 加入您日歷上的每個會議' },
                { value: 'hosted', label: '我主持的日歷事件', desc: 'xCloud Lisbot 僅加入您創建或擁有的會議' },
              ].map(opt => (
                <label key={opt.value} className="flex items-start gap-2.5 mb-3 cursor-pointer">
                  <input type="radio" name="calscope" value={opt.value}
                    checked={calendarScope === opt.value}
                    onChange={() => onScope(opt.value as any)}
                    className="mt-0.5 accent-teal-700"
                  />
                  <div>
                    <p className="text-xs font-medium text-stone-800">{opt.label}
                      {opt.value === 'all' && <span className="ml-1.5 text-[10px] text-stone-400 font-normal">默認</span>}
                    </p>
                    <p className="text-xs text-stone-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {autoJoin && (
            <div className="py-4 opacity-60">
              <p className="text-xs font-medium text-stone-700 mb-3 flex items-center">
                邀請了誰
                <SoonBadge />
              </p>
              {[
                { value: 'any',      label: '任何參與者', desc: '無論日歷邀請中是誰，均可加入' },
                { value: 'internal', label: '僅限內部參與者', desc: `僅當日歷事件中的所有被邀請者來自您自己的域名時才加入` },
              ].map(opt => (
                <label key={opt.value} className="flex items-start gap-2.5 mb-3 cursor-not-allowed">
                  <input type="radio" name="invitescope" value={opt.value}
                    checked={inviteScope === opt.value}
                    onChange={() => setInviteScope(opt.value as any)}
                    disabled
                    className="mt-0.5 accent-teal-700"
                  />
                  <div>
                    <p className="text-xs font-medium text-stone-800">{opt.label}
                      {opt.value === 'any' && <span className="ml-1.5 text-[10px] text-stone-400 font-normal">默認</span>}
                    </p>
                    <p className="text-xs text-stone-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </SettingCard>

      <SettingCard title="助理外觀" subtitle="控制助理在會議中對您和其他參與者的顯示方式。">
        <div className="px-4 py-4 opacity-60">
          <p className="text-xs font-medium text-stone-700 mb-2 flex items-center">
            助理名稱
            <SoonBadge />
          </p>
          <p className="text-xs text-stone-500 mb-2">助理目前以「xCloud Lisbot Notetaker」加入會議，自訂名稱即將推出。</p>
          <Input
            value={assistantName}
            onChange={e => setAssistantName(e.target.value)}
            disabled
            placeholder="xCloud Lisbot 會議記錄"
          />
        </div>
      </SettingCard>
    </div>
  );
};

// 4. Report Content
const ReportContentPanel: React.FC = () => {
  const [autoNotes,  setAutoNotes]  = useState(true);
  const [transcript, setTranscript] = useState(true);
  const [lang,       setLang]       = useState('zh-TW');
  const [audioVideo, setAudioVideo] = useState(true);
  const [sentiment,  setSentiment]  = useState(true);

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={FileText} title="報告內容" desc="管理您的報告中所捕獲的內容及其展示方式。" preview />

      <SettingCard title="">
        <div>
          <ToggleRow
            title="自動會議記錄"
            desc="即使禁用了轉錄或錄音，也能自動生成AI驅動的摘要、章節、行動項和關鍵問題。"
            value={autoNotes}
            onChange={setAutoNotes}
          />
          <ToggleRow
            title="轉錄"
            desc="為您所擁有的會議報告啟用轉錄功能。"
            value={transcript}
            onChange={setTranscript}
          />
          <div className="px-4 py-4 border-b border-stone-100">
            <p className="text-sm font-medium text-stone-900 mb-1">輸出語言</p>
            <p className="text-xs text-stone-500 mb-3">
              xCloud Lisbot 自動生成會議主要語言的筆記和筆記。您可以覆蓋此設置，這也將更改其他人查看的您所擁有的報告語言。
            </p>
            <DropdownRow
              label="" value={lang}
              options={[{ value: 'auto', label: '自動偵測（默認）' }, ...LANGUAGES]}
              onSave={async v => setLang(v)}
            />
          </div>
          <ToggleRow
            title="音頻和視頻播放"
            desc="為您所擁有的會議報告啟用回放功能。"
            value={audioVideo}
            onChange={setAudioVideo}
          />
          <ToggleRow
            title="情感指標"
            desc="在報告中包含計算參與度、情緒、魅力和偏見的指標。"
            value={sentiment}
            onChange={setSentiment}
            noBorder
          />
        </div>
      </SettingCard>
    </div>
  );
};

// 5. Report Sharing
const ReportSharingPanel: React.FC = () => {
  const [internalAccess,  setInternalAccess]  = useState(true);
  const [internalRole,    setInternalRole]    = useState('editor');
  const [externalAccess,  setExternalAccess]  = useState(true);
  const [externalRole,    setExternalRole]    = useState('viewer');
  const [oneClick,        setOneClick]        = useState(true);
  const [emailNotify,     setEmailNotify]     = useState(true);
  const [meetingReport,   setMeetingReport]   = useState(true);
  const [preReads,        setPreReads]        = useState(true);
  const [updateCalendar,  setUpdateCalendar]  = useState(true);
  const [showThumbnail,   setShowThumbnail]   = useState(true);

  const accessOptions = [
    { value: 'editor', label: '編輯者訪問權限' },
    { value: 'viewer', label: '查看者訪問權限' },
    { value: 'none',   label: '無訪問權限' },
  ];

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={Share2} title="報告共享" desc="管理會議參與者如何共享報告" preview />

      <SettingCard title="共享偏好設置">
        <div>
          {/* Info */}
          <InfoBar className="mx-4 my-3">
            請注意：任何將 xCloud Lisbot 添加到會議中的人都會獲得編輯權限，而編輯人員可以共享報告，無論您的設置如何。
          </InfoBar>

          {/* Internal */}
          <div className="px-4 py-4 border-b border-stone-100">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-medium text-stone-900">內部參與者訪問</p>
                <p className="text-xs text-stone-500">自動為內部（您公司域名）會議參與者授予報告訪問權限</p>
              </div>
              <Toggle checked={internalAccess} onChange={setInternalAccess} aria-label="內部參與者訪問" />
            </div>
            {internalAccess && (
              <Select value={internalRole} onChange={e => setInternalRole(e.target.value)} className="w-64">
                {accessOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </div>

          {/* External */}
          <div className="px-4 py-4 border-b border-stone-100">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-medium text-stone-900">外部參與者訪問</p>
                <p className="text-xs text-stone-500">自動為外部（非您公司域名）會議參與者授予報告訪問權限</p>
              </div>
              <Toggle checked={externalAccess} onChange={setExternalAccess} aria-label="外部參與者訪問" />
            </div>
            {externalAccess && (
              <Select value={externalRole} onChange={e => setExternalRole(e.target.value)} className="w-64">
                {accessOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </div>

          {/* One-click share */}
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-medium text-stone-900">一鍵共享</p>
                <p className="text-xs text-stone-500">單擊一次即可立即共享報告，實現更快速的協作。</p>
              </div>
              <Toggle checked={oneClick} onChange={setOneClick} aria-label="一鍵共享" />
            </div>
            {oneClick && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={emailNotify} onChange={e => setEmailNotify(e.target.checked)}
                  className="rounded accent-teal-700"
                />
                <span className="text-xs text-stone-700">當報告通過一鍵共享時，向收件人發送電子郵件。</span>
              </label>
            )}
          </div>
        </div>
      </SettingCard>

      <SettingCard title="報告分發">
        <ToggleRow
          title="會議報告"
          desc="在會議結束後發送會議筆記、記錄等"
          value={meetingReport}
          onChange={setMeetingReport}
        />
        <ToggleRow
          title="會議 Pre-Reads"
          desc="在即將召開的會議前發送上一場會議的摘要"
          value={preReads}
          onChange={setPreReads}
        />
        <ToggleRow
          title="更新日歷事件"
          desc="會議結束後，更新日歷事件描述以包含摘要和報告鏈接"
          value={updateCalendar}
          onChange={setUpdateCalendar}
        />
        <ToggleRow
          title="顯示會議縮略圖"
          desc="在會議回顧和 Pre-Read 郵件中顯示您所擁有報告的縮略圖。"
          value={showThumbnail}
          onChange={setShowThumbnail}
          noBorder
        />
      </SettingCard>
    </div>
  );
};

// ── Mini icon components ───────────────────────────────────────
const TeamsIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect width="18" height="18" rx="4" fill="#5059C9" />
    <text x="9" y="13" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">T</text>
  </svg>
);
const EmailIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect width="18" height="18" rx="4" fill="#44403c" />
    <path d="M4 6h10M4 9h10M4 12h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Notification row with channel icons + toggle
const NotifRow: React.FC<{
  title: string;
  desc: string;
  channels: ('email' | 'teams')[];
  value: boolean;
  onChange: (v: boolean) => void;
  noBorder?: boolean;
}> = ({ title, desc, channels, value, onChange, noBorder }) => (
  <div className={`flex items-start gap-3 px-4 py-4 ${noBorder ? '' : 'border-b border-stone-100'}`}>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-stone-900">{title}</p>
      <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{desc}</p>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {channels.includes('email') && <EmailIcon />}
      {channels.includes('teams') && <TeamsIcon />}
    </div>
    <Toggle checked={value} onChange={onChange} aria-label={title} />
  </div>
);

// 6. Notifications
const NotificationsPanel: React.FC = () => {
  const [dailySummary,    setDailySummary]    = useState(true);
  const [readouts,        setReadouts]        = useState(true);
  const [weeklyReview,    setWeeklyReview]    = useState(true);
  const [recommendations, setRecommendations] = useState(true);
  const [productUpdates,  setProductUpdates]  = useState(true);
  const [accountInfo,     setAccountInfo]     = useState(true);

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={Bell} title="通知" desc="管理通知偏好和電子郵件訂閱。" preview />

      <SettingCard title="通知">
        <NotifRow
          title="每日摘要"
          desc="在 Teams 中接收每日摘要，重點突出可能需要回復的重要更新。"
          channels={['teams']}
          value={dailySummary} onChange={setDailySummary}
        />
        <NotifRow
          title="主題 Readouts"
          desc="當 xCloud Lisbot 從電子郵件或消息中生成新的 Readout 時，通過以下渠道自動通知我"
          channels={['email', 'teams']}
          value={readouts} onChange={setReadouts}
        />
        <NotifRow
          title="每週回顧"
          desc="接收週一的上週會議總結以及週四的剩餘行動項目摘要。"
          channels={['email', 'teams']}
          value={weeklyReview} onChange={setWeeklyReview}
        />
        <NotifRow
          title="推薦"
          desc="當 xCloud Lisbot 生成個性化建議和行動項時通知我"
          channels={['email']}
          value={recommendations} onChange={setRecommendations}
          noBorder
        />
      </SettingCard>

      <SettingCard title="您的電子郵件偏好">
        <ToggleRow
          title="產品更新"
          desc="獲取 xCloud Lisbot 的產品更新和公告"
          value={productUpdates} onChange={setProductUpdates}
        />
        <ToggleRow
          title="帳號信息"
          desc="從 xCloud Lisbot 接收有關您帳戶的信息"
          value={accountInfo} onChange={setAccountInfo}
          noBorder
        />
      </SettingCard>

      {/* Info link */}
      <InfoBar>
        會議總結和會議 Pre-Read 電子郵件首選項可以在
        <span className="font-medium text-stone-700">報告共享 → 報告分發</span>中進行管理。
      </InfoBar>
    </div>
  );
};

// 9. Folders
const SMART_FOLDERS = [
  '一對一', '專業諮詢', '業務審核', '臨床訪談', '入職培訓',
  '合作伙伴對齊會議', '回顧', '培訓', '媒體訪談', '客戶反饋',
  '客戶成功', '客戶支持', '工作面試', '技術故障排除', '投資者介紹',
  '教育', '法律諮詢', '法律策略', '狀態更新', '研究訪談',
  '計劃會議', '賬戶審核', '輔導課程', '銷售電話', '銷售策略', '項目訪談',
];

const FoldersPanel: React.FC = () => {
  const [custom,    setCustom]    = useState<string[]>([]);
  const [hidden,    setHidden]    = useState<Set<string>>(new Set());
  const [adding,    setAdding]    = useState(false);
  const [newFolder, setNewFolder] = useState('');

  const toggleHide = (f: string) =>
    setHidden(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={FolderOpen} title="文件夾" desc="控制如何在文件夾中排序和顯示會議報告。" />

      {/* 自定義文件夾 */}
      <div className="mb-6">
        <div className="mb-2">
          <p className="text-sm font-semibold text-stone-900">自定義文件夾</p>
          <p className="text-xs text-stone-400 mt-0.5">創建和管理您自己的文件夾，以您自己的方式整理會議報告。</p>
        </div>
        <Button variant="primary" size="md" icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAdding(true)}>
          添加新文件夾
        </Button>
        {adding && (
          <div className="flex gap-2 mt-3">
            <Input
              autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newFolder.trim()) { setCustom(c => [...c, newFolder.trim()]); setNewFolder(''); setAdding(false); }
                if (e.key === 'Escape') { setNewFolder(''); setAdding(false); }
              }}
              placeholder="文件夾名稱…"
              className="flex-1"
            />
            <Button variant="primary" size="md"
              onClick={() => { if (newFolder.trim()) { setCustom(c => [...c, newFolder.trim()]); setNewFolder(''); setAdding(false); } }}>
              確認
            </Button>
            <Button variant="secondary" size="md" onClick={() => { setNewFolder(''); setAdding(false); }}>取消</Button>
          </div>
        )}
        {custom.length > 0 && (
          <Card className="mt-3 overflow-hidden">
            {custom.map((f, i) => (
              <div key={f} className={`flex items-center px-4 py-3 ${i < custom.length - 1 ? 'border-b border-stone-100' : ''}`}>
                <FolderOpen size={14} strokeWidth={1.75} className="text-teal-700 mr-2" />
                <span className="text-sm text-stone-700 flex-1">{f}</span>
                <IconButton aria-label={`刪除 ${f}`} onClick={() => setCustom(c => c.filter(x => x !== f))} className="text-stone-400 hover:text-red-600">
                  <Trash2 size={14} strokeWidth={1.75} />
                </IconButton>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* 智能文件夾 */}
      <div>
        <div className="mb-3">
          <p className="text-sm font-semibold text-stone-900">智能文件夾</p>
          <p className="text-xs text-stone-400 mt-0.5">按主題自動組織報告。顯示或隱藏與您無關的文件夾。</p>
        </div>
        <Card className="px-4 py-4">
          <p className="text-xs font-medium text-stone-500 mb-3">活躍智能文件夾</p>
          <div className="flex flex-wrap gap-2">
            {SMART_FOLDERS.map(f => {
              const isHidden = hidden.has(f);
              return (
                <div key={f}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    isHidden
                      ? 'border-stone-200 text-stone-400 bg-stone-50'
                      : 'border-teal-200 text-teal-700 bg-teal-50'
                  }`}
                >
                  <FolderOpen size={12} strokeWidth={1.75} />
                  {f}
                  <button type="button" aria-label={isHidden ? `顯示 ${f}` : `隱藏 ${f}`}
                    onClick={() => toggleHide(f)} className="ml-0.5 hover:opacity-70 transition-opacity">
                    {isHidden
                      ? <EyeOff size={12} strokeWidth={1.75} className="text-stone-400" />
                      : <Eye size={12} strokeWidth={1.75} />}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

// 7. Search Copilot
const SearchCopilotPanel: React.FC = () => {
  const [saveHistory, setSaveHistory] = useState(true);

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={Search} title="搜索副駕駛" desc="管理搜索助手設置和搜索歷史。" preview />
      <SettingCard title="">
        <ToggleRow
          title="搜索記錄"
          desc="自動保存您過去的搜索，以便您可以稍後查看。僅您可見。"
          value={saveHistory}
          onChange={setSaveHistory}
          noBorder
        />
        <div className="px-4 pb-4">
          <Button variant="secondary" size="sm" className="border-red-300 text-red-600 hover:bg-red-50">
            刪除所有搜索記錄
          </Button>
        </div>
      </SettingCard>
    </div>
  );
};

// 8. Smart Scheduler
const SmartSchedulerPanel: React.FC = () => {
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [calendar, setCalendar] = useState('outlook');
  const [platform, setPlatform] = useState('teams');
  const [customUrl, setCustomUrl] = useState('xcloud-lisbot.com/jeff');
  const [availability, setAvailability] = useState(false);
  const [minNotice, setMinNotice] = useState(false);

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={CalendarClock} title="智能調度器" desc="配置日程安排鏈接、日歷、會議平台、URL 和可用性。" preview />

      <SettingCard title="智能調度器鏈接">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm font-medium text-stone-900">啟用智能調度器</p>
              <p className="text-xs text-stone-500 mt-0.5">允許他人通過您的個人排程連結預約會議。</p>
            </div>
            <Toggle checked={schedulerEnabled} onChange={setSchedulerEnabled} aria-label="啟用智能調度器" />
          </div>
          {schedulerEnabled && (
            <>
              <div className="mb-4">
                <p className="text-xs font-medium text-stone-700 mb-1.5">日程安排日歷</p>
                <Select value={calendar} onChange={e => setCalendar(e.target.value)}>
                  <option value="outlook">Outlook Calendar</option>
                </Select>
              </div>
              <div className="mb-4">
                <p className="text-xs font-medium text-stone-700 mb-1.5">默認會議平台</p>
                <Select value={platform} onChange={e => setPlatform(e.target.value)}>
                  <option value="teams">Microsoft Teams</option>
                  <option value="zoom">Zoom</option>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-700 mb-1.5">自定義 URL</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white">
                    <span className="px-3 py-2 text-xs text-stone-400 border-r border-stone-200 bg-stone-50 whitespace-nowrap">xcloud-lisbot.com/</span>
                    <input
                      value={customUrl.replace('xcloud-lisbot.com/', '')}
                      onChange={e => setCustomUrl(`xcloud-lisbot.com/${e.target.value}`)}
                      className="flex-1 px-3 py-2 text-sm text-stone-900 outline-none"
                      placeholder="your-name"
                    />
                  </div>
                  <IconButton aria-label="複製連結">
                    <Copy size={14} strokeWidth={1.75} />
                  </IconButton>
                  <IconButton aria-label="編輯連結">
                    <Pencil size={14} strokeWidth={1.75} />
                  </IconButton>
                </div>
              </div>
            </>
          )}
        </div>
      </SettingCard>

      <SettingCard title="日歷和可用性">
        <div className="px-4 py-3">
          <InfoBar className="mb-4">
            智能調度器使用 Outlook Calendar 管理您的排程。請前往「集成」頁面連接您的 Outlook 帳號。
          </InfoBar>
        </div>
        <ToggleRow
          title="可用時間"
          desc="根據日歷空閒時間自動計算可約會的時段。"
          value={availability}
          onChange={setAvailability}
        />
        <ToggleRow
          title="最小通知時間"
          desc="設定預約前至少需要提前多少時間的通知。"
          value={minNotice}
          onChange={setMinNotice}
          noBorder
        />
      </SettingCard>
    </div>
  );
};

// 10. Contacts & Groups
const ContactsGroupsPanel: React.FC = () => {
  const [domainDiscovery, setDomainDiscovery] = useState(true);
  const [groups] = useState<{ name: string; contacts: number }[]>([]);

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={Users2} title="聯繫人與群組" desc="管理您的聯繫人偏好設置和群組。" preview />

      <SettingCard title="聯繫人偏好設置">
        <ToggleRow
          title="域發現"
          desc="根據您的電子郵件域自動識別組織內的同事。"
          value={domainDiscovery}
          onChange={setDomainDiscovery}
        />
        <div className="px-4 py-4">
          <p className="text-sm font-medium text-stone-900 mb-1">同步聯繫人</p>
          <p className="text-xs text-stone-500 mb-3">從外部服務同步聯繫人，讓您的聯繫人列表保持最新。</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={
              <svg viewBox="0 0 18 18" width="14" height="14">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            }>
              連接 Google
            </Button>
            <Button variant="secondary" size="sm" icon={
              <svg viewBox="0 0 18 18" width="14" height="14" fill="none">
                <rect x="0.5" y="0.5"  width="7.5" height="7.5" fill="#F25022" />
                <rect x="10" y="0.5"  width="7.5" height="7.5" fill="#7FBA00" />
                <rect x="0.5" y="10" width="7.5" height="7.5" fill="#00A4EF" />
                <rect x="10" y="10" width="7.5" height="7.5" fill="#FFB900" />
              </svg>
            }>
              連接 Microsoft
            </Button>
          </div>
        </div>
      </SettingCard>

      <SettingCard title="聯繫人群組">
        <div className="px-4 py-3">
          <InfoBar className="mb-4">
            聯繫人群組讓您可以為一組人設置統一的報告共享和會議偏好。群組不向成員公開。
          </InfoBar>
        </div>
        <div className="border-t border-stone-100">
          <div className="flex items-center px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-xs font-medium text-stone-500 flex-1">群組名稱</span>
            <span className="text-xs font-medium text-stone-500 w-16 text-right">聯繫人</span>
          </div>
          {groups.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-stone-500">未創建聯繫人群組。</p>
              <button type="button" className="mt-2 text-xs text-teal-700 hover:underline font-medium">
                創建您的第一個聯繫人群組
              </button>
            </div>
          ) : (
            groups.map((g, i) => (
              <div key={g.name} className={`flex items-center px-4 py-3 ${i < groups.length - 1 ? 'border-b border-stone-100' : ''}`}>
                <span className="text-sm text-stone-700 flex-1">{g.name}</span>
                <span className="text-xs text-stone-500 w-16 text-right">{g.contacts}</span>
              </div>
            ))
          )}
        </div>
      </SettingCard>
    </div>
  );
};

// 11. Terminology — inline management
const TerminologyPanel: React.FC = () => {
  const { getToken } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const [terms,   setTerms]   = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [newTerm, setNewTerm] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${backendUrl}/api/terminology`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const list: any[] = json.data ?? [];
        setTerms(list.flatMap((item: any) => Array.isArray(item.terms) ? item.terms : []));
      }
    } catch {} finally { setLoading(false); }
  }, [backendUrl, getToken]);

  useEffect(() => { load(); }, [load]);

  const addTerm = () => {
    const t = newTerm.trim();
    if (!t || terms.includes(t) || terms.length >= 100) { setNewTerm(''); setAdding(false); return; }
    setTerms(prev => [...prev, t]);
    setNewTerm('');
    setAdding(false);
  };

  const removeTerm = (t: string) => setTerms(prev => prev.filter(x => x !== t));

  return (
    <div className="max-w-2xl">
      <PanelHeader icon={BookOpen} title="自定義詞匯" desc="提升詞匯以提高轉錄準確性。" />

      <Card className="px-5 py-5">
        <p className="text-sm font-semibold text-stone-900 mb-1">自定義詞匯</p>
        <p className="text-xs text-stone-500 mb-3 leading-relaxed">
          將詞匯添加到您的自定義詞匯表有助於在成績單中提高識別度。這可以提高名字、產品術語和行話的準確性。
        </p>

        {/* Info pill */}
        <div className="inline-flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-full px-3 py-1 mb-4">
          <Info size={13} strokeWidth={1.75} className="text-stone-400 flex-shrink-0" />
          <span className="text-xs text-stone-600">自定義詞匯在整個工作區共享。最多 100 個條目。</span>
        </div>

        {/* Counter */}
        <p className="text-xl font-semibold text-stone-800 mb-4">
          {loading ? '…' : `${terms.length} 個自定義詞`}
        </p>

        {/* Terms list */}
        {terms.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {terms.map(t => (
              <div key={t} className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-sm text-stone-700">{t}</span>
                <button type="button" aria-label={`移除 ${t}`} onClick={() => removeTerm(t)}
                  className="text-stone-400 hover:text-red-600 transition-colors ml-2 flex-shrink-0">
                  <X size={13} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inline add form */}
        {adding && (
          <div className="flex gap-2 mb-3">
            <Input
              autoFocus value={newTerm} onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTerm(); if (e.key === 'Escape') { setNewTerm(''); setAdding(false); } }}
              placeholder="輸入術語…"
              className="flex-1"
            />
            <Button variant="primary" size="md" onClick={addTerm}>確認</Button>
            <Button variant="secondary" size="md" onClick={() => { setNewTerm(''); setAdding(false); }}>取消</Button>
          </div>
        )}

        {/* Add button */}
        {!adding && terms.length < 100 && (
          <Button variant="primary" size="md" icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAdding(true)}>
            添加新內容
          </Button>
        )}
      </Card>
    </div>
  );
};

// 12. Advanced
const MOCK_SESSIONS = [
  { browser: 'Edge 瀏覽器', location: 'Taipei, Taiwan', active: '活躍剛剛', isCurrent: true },
  { browser: 'Edge 瀏覽器', location: 'Taichung, Taiwan', active: '活躍 21 小時前', isCurrent: false },
];

const AdvancedPanel: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <div className="max-w-2xl">
    <PanelHeader icon={Settings2} title="高級" desc="管理您的帳戶、安全性和偏好的其他控制。" preview />

    {/* 活躍會話 */}
    <SettingCard title="活躍會話">
      <div className="px-5 py-4">
        <p className="text-xs text-stone-500 mb-4">
          查看您的帳戶登錄位置，並退出單個或所有會話以確保帳戶安全。
        </p>
        <div className="space-y-2 mb-4">
          {MOCK_SESSIONS.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg border border-stone-200">
              <div>
                <p className="text-sm font-medium text-stone-800">
                  {s.browser}
                  {s.isCurrent && <span className="ml-2 text-xs text-stone-400 font-normal">(當前)</span>}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">{s.location} · {s.active}</p>
              </div>
              {s.isCurrent ? (
                <span className="text-xs text-stone-400">—</span>
              ) : (
                <button type="button" onClick={onLogout}
                  className="text-xs font-medium text-teal-700 hover:text-teal-800 transition-colors">
                  登出
                </button>
              )}
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={<LogOut size={14} strokeWidth={1.75} />} onClick={onLogout}>
          登出所有會話
        </Button>
      </div>
    </SettingCard>

    {/* 刪除帳戶 */}
    <SettingCard title="刪除帳戶">
      <div className="px-5 py-4">
        <p className="text-xs text-stone-500 mb-4">此操作是永久性的，無法撤銷。</p>
        <InfoBar className="mb-3">
          只想讓 xCloud Lisbot 加入更少的會議嗎？您可以停用自動加入，xCloud Lisbot 只會在被邀請時加入會議。
        </InfoBar>
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4 text-xs text-amber-700">
          <AlertTriangle size={14} strokeWidth={1.75} className="text-amber-700 mt-0.5 flex-shrink-0" />
          <span>您是 xCloudinfo 工作區的所有者。要刪除您的帳戶，您必須先轉移所有權或刪除工作區。</span>
        </div>
        <Button variant="danger" size="sm" disabled title="即將推出">
          刪除我的帳戶
        </Button>
      </div>
    </SettingCard>

    {/* 瀏覽器擴充功能 */}
    <SettingCard title="瀏覽器擴充功能">
      <div className="px-4 py-4 flex items-center gap-3">
        <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-7 h-7 rounded" />
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-900">xCloud Lisbot Web Extension</p>
          <p className="text-xs text-stone-500">支援 Edge、Chrome 瀏覽器</p>
        </div>
        <Button variant="secondary" size="sm" disabled icon={<ExternalLink size={13} strokeWidth={1.75} />} title="即將推出">
          安裝
        </Button>
      </div>
    </SettingCard>

    <p className="text-center text-xs text-stone-400 mt-4">xCloud Lisbot v2.0 · 企業版</p>
  </div>
);

// ── Main SettingsPage ──────────────────────────────────────────
const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { getToken, logout } = useAuth();
  const { show } = useToast();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [active,   setActive]   = useState<NavTab>('profile');
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [showTermModal,     setShowTermModal]     = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail,     setCalendarEmail]     = useState<string | undefined>(undefined);

  const fetchProfile = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${backendUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.data ?? json);
      }
    } catch {} finally { setLoading(false); }
  }, [backendUrl, getToken]);

  const fetchCalendarStatus = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const s = await getCalendarStatus(token);
      setCalendarConnected(s.connected);
      setCalendarEmail(s.email);
    } catch {}
  }, [getToken]);

  useEffect(() => { fetchProfile(); fetchCalendarStatus(); }, [fetchProfile, fetchCalendarStatus]);

  // Surface the result of the OAuth round-trip (backend redirects to /settings?calendar=...).
  useEffect(() => {
    const cal = new URLSearchParams(window.location.search).get('calendar');
    if (cal === 'connected') { show('行事曆已連接', 'success'); setActive('integrations'); }
    else if (cal === 'error') { show('行事曆連接失敗', 'error'); setActive('integrations'); }
    if (cal) window.history.replaceState({}, '', window.location.pathname);
  }, [show]);

  const save = useCallback(async (patch: Partial<Profile>) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${backendUrl}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.data ?? json);
        show('已儲存', 'success');
      }
    } catch { show('儲存失敗', 'error'); }
  }, [backendUrl, getToken, show]);

  // Connect (full-page redirect to Microsoft). Only invoked when not yet connected.
  const handleManageCalendar = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      window.location.href = await getConnectUrl(token, 'settings');
    } catch { show('連接失敗，請稍後再試', 'error'); }
  }, [getToken, show]);

  const handleDisconnectCalendar = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) await disconnectCalendar(token);
    } catch { /* best-effort */ }
    setCalendarConnected(false);
    setCalendarEmail(undefined);
    show('已中斷行事曆連線', 'success');
  }, [getToken, show]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Breadcrumb ───────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-2">
            <button type="button" onClick={() => navigate(-1)}
              className="hover:text-stone-700 transition-colors">
              ← 返回
            </button>
            <span>/</span>
            <span className="text-stone-800 font-medium">帳戶設置</span>
          </div>
        </div>

        {/* ── Main card: sidebar + content ─────────────────────── */}
        <Card className="overflow-hidden flex" style={{ minHeight: 560 }}>

          {/* Left sidebar */}
          <nav className="w-52 flex-shrink-0 border-r border-stone-200 py-4 overflow-y-auto">
            <div className="px-4 mb-4">
              <p className="text-sm font-semibold text-stone-800">帳戶設置</p>
            </div>
            <div className="space-y-0.5 px-2">
              {NAV.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active === item.id
                      ? 'bg-teal-50 text-teal-700 font-semibold'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Right content */}
          <main className="flex-1 overflow-y-auto px-8 py-8">
            {active === 'profile' && (
              <ProfilePanel profile={profile} loading={loading} onSave={save} onLogout={logout} />
            )}
            {active === 'integrations' && (
              <IntegrationsPanel
                calendarConnected={calendarConnected}
                calendarEmail={calendarEmail}
                onManageCalendar={handleManageCalendar}
                onDisconnect={handleDisconnectCalendar}
              />
            )}
            {active === 'recording'      && <RecordingPanel />}
            {active === 'report-content' && <ReportContentPanel />}
            {active === 'report-sharing' && <ReportSharingPanel />}
            {active === 'notifications'    && <NotificationsPanel />}
            {active === 'search-copilot'  && <SearchCopilotPanel />}
            {active === 'smart-scheduler' && <SmartSchedulerPanel />}
            {active === 'folders'         && <FoldersPanel />}
            {active === 'contacts-groups' && <ContactsGroupsPanel />}
            {active === 'terminology'     && <TerminologyPanel />}
            {active === 'advanced'       && <AdvancedPanel onLogout={logout} />}
          </main>

        </Card>{/* close card */}
      </div>{/* close max-w-5xl */}

      {/* Modals */}
      {showTermModal     && <TermDictionaryModal    onClose={() => setShowTermModal(false)} />}
      {showTemplateModal && <SummaryTemplateModal   onClose={() => setShowTemplateModal(false)} />}
    </div>
  );
};

export default SettingsPage;
