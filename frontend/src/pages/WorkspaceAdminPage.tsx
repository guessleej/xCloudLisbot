import React, { useState, useRef, useEffect } from 'react';
import {
  Users, Settings, Shield, UserPlus, ChevronDown,
  Search, MoreHorizontal, Check, Building2, Crown, UserCheck,
  User, X, Plus, Pencil, Trash2, Hash, Download, AlertTriangle,
} from 'lucide-react';
import {
  Button, Badge, Input, Toggle, IconButton, Modal, useToast,
} from '../components/ui';

// ── Types ──────────────────────────────────────────────────────
type WorkspaceRole = '所有者' | '管理員' | '成員';
type GroupType = '公司群組' | '部門' | '專案組';

interface Member {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  teamId: string | null;
  last_active: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  type: GroupType;
  color: string;
  memberIds: string[];
  created_at: string;
}

// ── Initial data ───────────────────────────────────────────────
const INIT_MEMBERS: Member[] = [
  { id: '1', name: 'Jeff Lee',   email: 'jefflee@cloudinfo.com.tw', role: '所有者', teamId: null,  last_active: '剛剛' },
  { id: '2', name: 'Alice Chen', email: 'alice@cloudinfo.com.tw',   role: '管理員', teamId: 'g2',  last_active: '2 小時前' },
  { id: '3', name: 'Bob Wang',   email: 'bob@cloudinfo.com.tw',     role: '成員',   teamId: 'g3',  last_active: '昨天' },
  { id: '4', name: 'Carol Lin',  email: 'carol@cloudinfo.com.tw',   role: '成員',   teamId: 'g4',  last_active: '3 天前' },
  { id: '5', name: 'David Wu',   email: 'david@cloudinfo.com.tw',   role: '成員',   teamId: 'g3',  last_active: '1 週前' },
];

const INIT_GROUPS: Group[] = [
  { id: 'g1', name: 'CloudInfo',  description: '全公司頂層群組', type: '公司群組', color: '#0F766E', memberIds: ['1','2','3','4','5'], created_at: '2026-01-01' },
  { id: 'g3', name: '工程',       description: '產品研發團隊',  type: '部門',     color: '#0F766E', memberIds: ['3','5'],            created_at: '2026-01-15' },
  { id: 'g2', name: '產品',       description: '產品管理與設計', type: '部門',     color: '#10B981', memberIds: ['2'],                created_at: '2026-02-01' },
  { id: 'g4', name: '業務',       description: '客戶關係管理',  type: '部門',     color: '#F59E0B', memberIds: ['4'],                created_at: '2026-03-10' },
];

const GROUP_COLORS = ['#0F766E','#0D9488','#10B981','#F59E0B','#EF4444','#EC4899','#6366F1','#14B8A6'];
const GROUP_TYPES: GroupType[] = ['公司群組', '部門', '專案組'];

// ── Shared helpers ─────────────────────────────────────────────
const ROLE_TONE: Record<WorkspaceRole, 'warning' | 'accent' | 'neutral'> = {
  '所有者': 'warning',
  '管理員': 'accent',
  '成員':   'neutral',
};

const RoleBadge: React.FC<{ role: WorkspaceRole }> = ({ role }) => {
  const icons: Record<WorkspaceRole, React.ReactNode> = {
    '所有者': <Crown size={10} strokeWidth={1.75} />,
    '管理員': <UserCheck size={10} strokeWidth={1.75} />,
    '成員':   <User size={10} strokeWidth={1.75} />,
  };
  return (
    <Badge tone={ROLE_TONE[role]}>
      {icons[role]} {role}
    </Badge>
  );
};

const Avatar: React.FC<{ name: string; size?: number; color?: string }> = ({ name, size = 32, color }) => (
  <div
    className="rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
    style={{ width: size, height: size, background: color ? `${color}22` : 'rgba(15,118,110,0.12)', color: color || '#0F766E' }}
  >
    {name?.[0]?.toUpperCase() || '?'}
  </div>
);

const GroupIcon: React.FC<{ type: GroupType; color: string; size?: number }> = ({ type, color, size = 32 }) => {
  const icons: Record<GroupType, React.ReactNode> = {
    '公司群組': <Building2 size={size * 0.45} strokeWidth={1.75} />,
    '部門':     <Users     size={size * 0.45} strokeWidth={1.75} />,
    '專案組':   <Hash      size={size * 0.45} strokeWidth={1.75} />,
  };
  return (
    <div className="rounded-lg flex items-center justify-center flex-shrink-0"
         style={{ width: size, height: size, background: `${color}22`, color }}>
      {icons[type]}
    </div>
  );
};

// ── Modal header helper ────────────────────────────────────────
const ModalHeader: React.FC<{ title: string; id: string; onClose: () => void }> = ({ title, id, onClose }) => (
  <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
    <h3 id={id} className="text-base font-semibold text-stone-900">{title}</h3>
    <IconButton aria-label="關閉" onClick={onClose}>
      <X size={18} strokeWidth={1.75} />
    </IconButton>
  </div>
);

// ── Accordion item ─────────────────────────────────────────────
const AccordionItem: React.FC<{
  title: string; subtitle?: string; icon?: React.ReactNode;
  children?: React.ReactNode; defaultOpen?: boolean; badge?: string;
}> = ({ title, subtitle, children, defaultOpen = false, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-100 last:border-b-0">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-stone-800">{title}</p>
            {badge && (
              <Badge tone="accent" className="flex-shrink-0">{badge}</Badge>
            )}
          </div>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-teal-700 flex-shrink-0 ml-4">
          <span>{open ? '收起' : '展開'}</span>
          <ChevronDown size={13} strokeWidth={1.75} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && children && (
        <div className="px-6 pb-5 border-t border-stone-100">
          {children}
        </div>
      )}
    </div>
  );
};

const PermissionRow: React.FC<{
  label: string; description?: string;
  options: string[]; defaults?: Record<WorkspaceRole, string>
}> = ({ label, description, options, defaults = { '所有者': options[0], '管理員': options[0], '成員': options[1] } }) => {
  const [vals, setVals] = useState(defaults);
  const roles: WorkspaceRole[] = ['所有者', '管理員', '成員'];
  return (
    <div className="py-3 border-b last:border-b-0 border-stone-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-700">{label}</p>
        {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {roles.map(role => (
          <div key={role}>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">{role}</p>
            <select value={vals[role]} onChange={e => setVals(v => ({ ...v, [role]: e.target.value }))}
                    disabled={role === '所有者'}
                    className="w-full text-xs bg-white border border-stone-200 text-stone-700 px-2 py-1.5 rounded-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors disabled:opacity-50 disabled:bg-stone-50">
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Create / Edit Group Modal
// ══════════════════════════════════════════════════════════════
interface GroupFormData {
  name: string;
  description: string;
  type: GroupType;
  color: string;
}

const GroupModal: React.FC<{
  initial?: GroupFormData;
  title: string;
  onSave: (data: GroupFormData) => void;
  onClose: () => void;
}> = ({ initial, title, onSave, onClose }) => {
  const [form, setForm] = useState<GroupFormData>(
    initial ?? { name: '', description: '', type: '公司群組', color: '#0F766E' }
  );
  const [err, setErr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = () => {
    if (!form.name.trim()) { setErr('請輸入群組名稱'); return; }
    onSave({ ...form, name: form.name.trim() });
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="mb-4">
      <label className="block text-xs font-medium text-stone-600 mb-1.5">{label}</label>
      {node}
    </div>
  );

  return (
    <Modal onClose={onClose} labelledBy="group-modal-title" maxWidth="max-w-lg">
      <ModalHeader title={title} id="group-modal-title" onClose={onClose} />
      <div className="px-6 py-5">
        {field('群組名稱 *',
          <Input ref={nameRef} value={form.name}
                 onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErr(''); }}
                 onKeyDown={e => e.key === 'Enter' && submit()}
                 placeholder="例如：CloudInfo 全公司"
                 className={err ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} />
        )}
        {err && <p className="text-xs text-red-600 -mt-3 mb-3">{err}</p>}

        {field('描述',
          <Input value={form.description}
                 onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                 placeholder="簡短說明群組用途（選填）" />
        )}

        {field('群組類型',
          <div className="flex gap-2">
            {GROUP_TYPES.map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        form.type === t
                          ? 'text-teal-700 border-teal-600/40 bg-teal-50'
                          : 'text-stone-600 border-stone-200 hover:border-stone-300 hover:text-stone-700'
                      }`}>
                {t}
              </button>
            ))}
          </div>
        )}

        {field('識別顏色',
          <div className="flex gap-2 flex-wrap">
            {GROUP_COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      aria-label={`選擇顏色 ${c}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                      style={{ background: c }}>
                {form.color === c && <Check size={13} strokeWidth={1.75} className="text-white" />}
              </button>
            ))}
          </div>
        )}

        {/* Preview */}
        <div className="mb-5 p-3 rounded-xl flex items-center gap-3 bg-stone-50 border border-stone-200">
          <GroupIcon type={form.type} color={form.color} size={38} />
          <div>
            <p className="text-sm font-semibold text-stone-900">{form.name || '群組名稱'}</p>
            <p className="text-xs text-stone-500">{form.description || form.type}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="primary" className="flex-1" onClick={submit}>確認建立</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Add members modal ──────────────────────────────────────────
const AddMembersModal: React.FC<{
  group: Group;
  allMembers: Member[];
  onSave: (memberIds: string[]) => void;
  onClose: () => void;
}> = ({ group, allMembers, onSave, onClose }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(group.memberIds));
  const [search, setSearch] = useState('');

  const filtered = allMembers.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Modal onClose={onClose} labelledBy="add-members-title" maxWidth="max-w-lg">
      <ModalHeader title={`管理「${group.name}」成員`} id="add-members-title" onClose={onClose} />
      <div className="px-6 py-5">
        <div className="relative mb-3">
          <Search size={13} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 z-10" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="搜尋成員..."
                 className="pl-8" />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
          {filtered.map(m => (
            <button key={m.id} onClick={() => toggle(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20">
              <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                selected.has(m.id) ? 'bg-teal-600 border-teal-600' : 'border-stone-300'
              }`}>
                {selected.has(m.id) && <Check size={10} strokeWidth={1.75} className="text-white" />}
              </div>
              <Avatar name={m.name} size={28} />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-stone-700 truncate">{m.name}</p>
                <p className="text-xs text-stone-500 truncate">{m.email}</p>
              </div>
              <RoleBadge role={m.role} />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 text-xs text-stone-500 border-t border-stone-200 pt-3">
          <span>已選取 {selected.size} 位成員</span>
          <button onClick={() => setSelected(new Set(allMembers.map(m => m.id)))}
                  className="text-teal-700 hover:text-teal-800 font-medium transition-colors">全選</button>
        </div>

        <div className="flex gap-3">
          <Button variant="primary" className="flex-1" onClick={() => onSave(Array.from(selected))}>儲存</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
        </div>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Tab 1 — 團隊
// ══════════════════════════════════════════════════════════════
const TeamsTab: React.FC<{ members: Member[]; setMembers: React.Dispatch<React.SetStateAction<Member[]>> }> = ({ members, setMembers }) => {
  const [groups, setGroups]         = useState<Group[]>(INIT_GROUPS);
  const [selected, setSelected]     = useState<Group | null>(groups.find(g => g.type === '公司群組') ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup]   = useState<Group | null>(null);
  const [addMembers, setAddMembers] = useState<Group | null>(null);
  const [groupMenu, setGroupMenu]   = useState<string | null>(null);
  const menuRef                     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupMenu) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setGroupMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [groupMenu]);

  const createGroup = (data: GroupFormData) => {
    const g: Group = {
      id: `g${Date.now()}`,
      name: data.name,
      description: data.description,
      type: data.type,
      color: data.color,
      memberIds: [],
      created_at: new Date().toISOString().slice(0, 10),
    };
    setGroups(gs => [...gs, g]);
    setSelected(g);
    setShowCreate(false);
  };

  const updateGroup = (data: GroupFormData) => {
    if (!editGroup) return;
    setGroups(gs => gs.map(g => g.id === editGroup.id ? { ...g, ...data } : g));
    setSelected(s => s?.id === editGroup.id ? { ...editGroup, ...data } : s);
    setEditGroup(null);
  };

  const deleteGroup = (id: string) => {
    setGroups(gs => gs.filter(g => g.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const saveMembers = (groupId: string, ids: string[]) => {
    setGroups(gs => gs.map(g => g.id === groupId ? { ...g, memberIds: ids } : g));
    setSelected(s => s?.id === groupId ? { ...s, memberIds: ids } : s);
    setAddMembers(null);
  };

  const companyGroups = groups.filter(g => g.type === '公司群組');
  const otherGroups   = groups.filter(g => g.type !== '公司群組');

  const GroupRow = ({ g }: { g: Group }) => (
    <div className="group relative">
      <button
        onClick={() => setSelected(g)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          selected?.id === g.id ? 'bg-stone-100' : 'hover:bg-stone-50'
        }`}
      >
        <GroupIcon type={g.type} color={g.color} size={34} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${selected?.id === g.id ? 'text-stone-900' : 'text-stone-600'}`}>{g.name}</p>
          <p className="text-xs text-stone-500">{g.memberIds.length} 位成員 · {g.type}</p>
        </div>
        {selected?.id === g.id && <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: g.color }} />}
      </button>

      {/* kebab menu */}
      <div ref={groupMenu === g.id ? menuRef : undefined}
           className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={e => { e.stopPropagation(); setGroupMenu(groupMenu === g.id ? null : g.id); }}
                aria-label="群組操作"
                className="w-6 h-6 flex items-center justify-center rounded text-stone-500 hover:text-stone-700 hover:bg-stone-200 transition-colors">
          <MoreHorizontal size={13} strokeWidth={1.75} />
        </button>
        {groupMenu === g.id && (
          <div className="absolute right-0 top-[calc(100%+2px)] w-36 rounded-lg shadow-pop z-50 py-1 bg-white border border-stone-200">
            <button onClick={() => { setGroupMenu(null); setEditGroup(g); setSelected(g); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors">
              <Pencil size={11} strokeWidth={1.75} /> 編輯群組
            </button>
            <button onClick={() => { setGroupMenu(null); setAddMembers(g); setSelected(g); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors">
              <UserPlus size={11} strokeWidth={1.75} /> 管理成員
            </button>
            <button onClick={() => { setGroupMenu(null); deleteGroup(g.id); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors">
              <Trash2 size={11} strokeWidth={1.75} /> 刪除群組
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100 bg-stone-50">
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span className="font-medium">xCloudinfo</span>
          <span className="text-stone-300">|</span>
          <span>{groups.length === 0 ? '此工作區中無團隊' : `${groups.length} 個團隊`}</span>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 transition-colors">
          <Plus size={13} strokeWidth={1.75} /> 新團隊
        </button>
      </div>

      <div className="flex h-full" style={{ minHeight: '520px' }}>
        {/* ── Left sidebar ───────────────────────────── */}
        <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-stone-100">
          {/* CTA */}
          <div className="px-4 pt-4 pb-3">
            <button onClick={() => setShowCreate(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-teal-50 text-teal-700 border border-teal-600/20 transition-colors hover:bg-teal-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40">
              <Plus size={14} strokeWidth={1.75} />
              建立公司群組
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Company groups */}
            {companyGroups.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-stone-400">公司群組</div>
                {companyGroups.map(g => <GroupRow key={g.id} g={g} />)}
              </div>
            )}

            {/* Dept / project groups */}
            {otherGroups.length > 0 && (
              <div className="mt-1">
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-stone-400">部門 / 專案組</div>
                {otherGroups.map(g => <GroupRow key={g.id} g={g} />)}
              </div>
            )}

            {groups.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <Building2 size={28} strokeWidth={1.75} className="text-stone-300 mb-2" />
                <p className="text-xs text-stone-500">尚未建立任何群組</p>
              </div>
            )}
          </div>

          {/* Footer count */}
          <div className="px-4 py-2.5 border-t border-stone-200 text-xs text-stone-500">
            {groups.length} 個群組
          </div>
        </div>

        {/* ── Right detail panel ─────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (() => {
            const grpMembers = members.filter(m => selected.memberIds.includes(m.id));
            return (
              <>
                {/* Header */}
                <div className="px-6 py-4 flex items-start justify-between border-b border-stone-200">
                  <div className="flex items-center gap-3">
                    <GroupIcon type={selected.type} color={selected.color} size={42} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-stone-900">{selected.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                              style={{ background: `${selected.color}20`, color: selected.color, border: `1px solid ${selected.color}40` }}>
                          {selected.type}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">{selected.description || '暫無描述'}</p>
                      <p className="text-xs text-stone-400 mt-0.5">建立於 {selected.created_at}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="secondary" size="sm" icon={<Pencil size={12} strokeWidth={1.75} />}
                            onClick={() => setEditGroup(selected)}>
                      編輯
                    </Button>
                    <Button variant="primary" size="sm" icon={<UserPlus size={12} strokeWidth={1.75} />}
                            onClick={() => setAddMembers(selected)}>
                      管理成員
                    </Button>
                  </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 border-b border-stone-200">
                  {[
                    { label: '成員', value: grpMembers.length },
                    { label: '管理員', value: grpMembers.filter(m => m.role === '管理員' || m.role === '所有者').length },
                    { label: '建立日', value: selected.created_at },
                  ].map(s => (
                    <div key={s.label} className="px-6 py-3 border-r last:border-r-0 border-stone-200">
                      <p className="text-xs text-stone-500">{s.label}</p>
                      <p className="text-base font-semibold text-stone-900 mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Member list */}
                <div className="flex-1 overflow-y-auto">
                  {grpMembers.length > 0 ? grpMembers.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-6 py-3 border-b border-stone-100 hover:bg-stone-50 transition-colors">
                      <Avatar name={m.name} size={34} color={selected.color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-700">{m.name}</p>
                        <p className="text-xs text-stone-500">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <RoleBadge role={m.role} />
                        <span className="text-xs text-stone-400">{m.last_active}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <UserPlus size={32} strokeWidth={1.75} className="text-stone-300 mb-3" />
                      <p className="text-sm font-medium text-stone-700 mb-1">此群組尚無成員</p>
                      <p className="text-xs text-stone-400 mb-5">點擊「管理成員」來指派成員至此群組</p>
                      <Button variant="primary" size="sm" icon={<UserPlus size={13} strokeWidth={1.75} />}
                              onClick={() => setAddMembers(selected)}>
                        管理成員
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })() : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 bg-teal-50 border border-teal-600/20">
                <Building2 size={34} strokeWidth={1.75} className="text-teal-700" />
              </div>
              <h3 className="text-base font-bold text-stone-900 mb-2">建立您的第一個公司群組</h3>
              <p className="text-sm text-stone-500 mb-6 max-w-xs leading-relaxed">
                先建立公司群組作為根節點，再依部門或專案新增子群組，方便管理不同層級的成員與權限。
              </p>
              <Button variant="primary" icon={<Plus size={15} strokeWidth={1.75} />}
                      onClick={() => setShowCreate(true)}>
                建立公司群組
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <GroupModal title="建立新群組" onSave={createGroup} onClose={() => setShowCreate(false)} />
      )}
      {editGroup && (
        <GroupModal
          title={`編輯「${editGroup.name}」`}
          initial={{ name: editGroup.name, description: editGroup.description, type: editGroup.type, color: editGroup.color }}
          onSave={updateGroup}
          onClose={() => setEditGroup(null)}
        />
      )}
      {addMembers && (
        <AddMembersModal
          group={addMembers}
          allMembers={members}
          onSave={ids => saveMembers(addMembers.id, ids)}
          onClose={() => setAddMembers(null)}
        />
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════
// Tab 2 — 人員
// ══════════════════════════════════════════════════════════════
const PeopleTab: React.FC<{ members: Member[]; setMembers: React.Dispatch<React.SetStateAction<Member[]>> }> = ({ members, setMembers }) => {
  const [search, setSearch]   = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100 bg-stone-50">
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span className="font-medium">xCloudinfo</span>
          <span className="text-stone-300">|</span>
          <span>此工作區中的 {members.length} 個人</span>
        </div>
        <div className="flex items-center gap-2">
          <button disabled title="即將推出"
                  className="flex items-center gap-1 text-xs font-medium text-stone-400 opacity-60 cursor-not-allowed">
            <Download size={12} strokeWidth={1.75} /> 導出（即將推出）
          </button>
          <button disabled title="即將推出"
                  className="flex items-center gap-1.5 text-xs font-medium text-stone-400 opacity-60 cursor-not-allowed">
            <Plus size={13} strokeWidth={1.75} /> 添加人員（即將推出）
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
        <div className="relative">
          <Search size={13} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 z-10" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="按姓名或郵箱搜索"
                 className="pl-8 w-60" />
        </div>
        <Button variant="primary" size="sm" icon={<UserPlus size={13} strokeWidth={1.75} />} disabled title="即將推出">
          邀請成員（即將推出）
        </Button>
      </div>

      <div className="grid text-xs font-medium uppercase tracking-wider text-stone-500 px-5 py-2.5 border-b border-stone-100 bg-stone-50"
           style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 40px' }}>
        <span>名稱 ↑</span><span>工作區角色</span><span>團隊</span><span>最後一次整體活動</span><span />
      </div>

      {filtered.map(m => (
        <div key={m.id} className="grid items-center px-5 py-3 border-b border-stone-100 hover:bg-stone-50 transition-colors"
             style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 40px' }}>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={m.name} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-700 truncate">{m.name}</p>
              <p className="text-xs text-stone-500 truncate">{m.email}</p>
            </div>
          </div>
          <div><RoleBadge role={m.role} /></div>
          <div>
            {m.teamId
              ? <span className="text-xs text-stone-600">{INIT_GROUPS.find(g => g.id === m.teamId)?.name || '—'}</span>
              : <span className="text-xs text-stone-400">—</span>
            }
          </div>
          <div className="text-xs text-stone-500">{m.last_active}</div>
          <div className="relative" ref={menuOpen === m.id ? menuRef : undefined}>
            <IconButton aria-label="成員操作" onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}>
              <MoreHorizontal size={14} strokeWidth={1.75} />
            </IconButton>
            {menuOpen === m.id && (
              <div className="absolute right-0 top-[calc(100%+2px)] w-40 rounded-lg shadow-pop z-50 py-1 bg-white border border-stone-200">
                <button disabled title="即將推出"
                        className="w-full text-left px-3 py-1.5 text-xs text-stone-400 opacity-60 cursor-not-allowed">變更角色（即將推出）</button>
                <button disabled title="即將推出"
                        className="w-full text-left px-3 py-1.5 text-xs text-stone-400 opacity-60 cursor-not-allowed">指派群組（即將推出）</button>
                {m.role !== '所有者' && (
                  <button onClick={() => { setMembers(ms => ms.filter(x => x.id !== m.id)); setMenuOpen(null); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors">
                    移除成員
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Search size={28} strokeWidth={1.75} className="text-stone-300 mb-3" />
          <p className="text-sm text-stone-500">找不到符合的成員</p>
        </div>
      )}

      <div className="px-5 py-3 border-t border-stone-200 text-xs text-stone-500">
        共 {filtered.length} 位成員
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Tab 3 — 設置  (fully functional)
// ══════════════════════════════════════════════════════════════

// ── Settings state types ───────────────────────────────────────
interface AuthSettings      { loginMethod: string; forceSso: boolean; mfa: boolean; sessionTimeout: string }
interface AutoJoinSettings  { enabled: boolean; condition: string; external: boolean; notifyBefore: string; recordConsent: boolean }
interface AssistantSettings { transcript: boolean; summary: boolean; language: string; diarization: boolean; audioRecord: boolean; videoRecord: boolean }
interface InsightSettings   { score: boolean; sentiment: boolean; coaching: boolean; engagement: boolean; compliance: boolean }
interface SharingSettings   { internal: string; external: string; allowExternal: boolean; preRead: boolean; autoShare: boolean }
interface NotifySettings    { dailySummary: boolean; readouts: string; weeklyReview: boolean; recommendations: boolean; emailPref: string; newMember: boolean; meetingReminder: boolean }
interface SchedulerSettings { calendarSource: string; platform: string; customUrl: string; defaultDuration: string; bufferTime: string; avoidWeekend: boolean; avoidLateHours: boolean; workStart: string; workEnd: string }
interface CopilotSettings   { enabled: boolean; scope: string; retention: string; crossMeeting: boolean }
interface AdvancedSettings  { memberCustomize: boolean; retentionLog: boolean; apiAccess: boolean; retentionDays: string; gdprMode: boolean }
interface Integration       { id: string; name: string; logo: string; connected: boolean; account?: string; description: string }
interface VocabTerm         { id: string; term: string; pronunciation: string; description: string }

// ── localStorage helpers ───────────────────────────────────────
function loadLS<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function saveLS<T>(key: string, val: T): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Init values (load from localStorage if available) ──────────
const INIT_AUTH:      AuthSettings      = loadLS('lisbot_ws_auth',      { loginMethod: 'Microsoft 帳號', forceSso: false, mfa: true, sessionTimeout: '8 小時' })
const INIT_AUTOJOIN:  AutoJoinSettings  = loadLS('lisbot_ws_autojoin',  { enabled: true, condition: '我建立的會議', external: false, notifyBefore: '10 分鐘', recordConsent: true })
const INIT_ASSISTANT: AssistantSettings = loadLS('lisbot_ws_assistant', { transcript: true, summary: true, language: '繁體中文', diarization: true, audioRecord: false, videoRecord: false })
const INIT_INSIGHT:   InsightSettings   = loadLS('lisbot_ws_insight',   { score: true, sentiment: false, coaching: true, engagement: true, compliance: false })
const INIT_SHARING:   SharingSettings   = loadLS('lisbot_ws_sharing',   { internal: '所有成員', external: '僅讀取', allowExternal: true, preRead: false, autoShare: false })
const INIT_NOTIFY:    NotifySettings    = loadLS('lisbot_ws_notify',    { dailySummary: true, readouts: 'Teams + Email', weeklyReview: true, recommendations: true, emailPref: '每日彙總', newMember: true, meetingReminder: true })
const INIT_SCHEDULER: SchedulerSettings = loadLS('lisbot_ws_scheduler', { calendarSource: 'Outlook Calendar', platform: 'Microsoft Teams', customUrl: '', defaultDuration: '30 分鐘', bufferTime: '10 分鐘', avoidWeekend: true, avoidLateHours: true, workStart: '09:00', workEnd: '18:00' })
const INIT_COPILOT:   CopilotSettings   = loadLS('lisbot_ws_copilot',   { enabled: true, scope: '工作區', retention: '90 天', crossMeeting: true })
const INIT_ADVANCED:  AdvancedSettings  = loadLS('lisbot_ws_advanced',  { memberCustomize: true, retentionLog: false, apiAccess: false, retentionDays: '365 天', gdprMode: false })
const INIT_INTEGRATIONS: Integration[]  = loadLS('lisbot_ws_integrations', [
  { id: 'outlook', name: 'Outlook 行事曆',   logo: '📅', connected: true,  account: 'jefflee@cloudinfo.com.tw', description: '同步行事曆事件，自動加入排定的會議' },
  { id: 'teams',   name: 'Microsoft Teams', logo: '💬', connected: true,  account: 'CloudInfo 租用戶',          description: '發送會議摘要通知至 Teams 頻道' },
  { id: 'slack',   name: 'Slack',           logo: '⚡', connected: false, description: '發送會議摘要通知至 Slack 頻道' },
  { id: 'zoom',    name: 'Zoom',            logo: '🎥', connected: false, description: '自動加入並錄製 Zoom 會議' },
  { id: 'notion',  name: 'Notion',          logo: '📝', connected: false, description: '自動將摘要推送至 Notion 資料庫' },
  { id: 'jira',    name: 'Jira',            logo: '🎯', connected: false, description: '將行動項目同步為 Jira Issue' },
])
const INIT_VOCAB: VocabTerm[] = loadLS('lisbot_ws_vocab', [
  { id: 'v1', term: 'xCloud Lisbot',    pronunciation: 'eks-meet-ai',    description: '產品名稱' },
  { id: 'v2', term: '逐字稿',      pronunciation: 'zhu-zi-gao',     description: '完整文字記錄' },
  { id: 'v3', term: 'Azure OpenAI', pronunciation: 'azure-open-ai', description: '微軟 AI 服務' },
])

// ── Helpers for settings sections ────────────────────────────
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Section save bar shown when dirty
const SaveBar: React.FC<{ dirty: boolean; onSave: () => void; onDiscard: () => void }> = ({ dirty, onSave, onDiscard }) => (
  <div className={`flex items-center justify-between mt-4 pt-4 border-t border-stone-200 transition-all ${dirty ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
    <span className="flex items-center gap-1.5 text-xs text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      有未儲存的變更
    </span>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={onDiscard}>捨棄</Button>
      <Button variant="primary" size="sm" onClick={onSave}>儲存</Button>
    </div>
  </div>
)

// Inline toggle for settings (controlled)
const ST: React.FC<{ label: string; description?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, description, value, onChange }) => (
  <div className="flex items-start justify-between py-3 border-b last:border-b-0 border-stone-200">
    <div className="flex-1 min-w-0 pr-4">
      <p className="text-sm text-stone-700">{label}</p>
      {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
    </div>
    <div className="flex-shrink-0 mt-0.5">
      <Toggle checked={value} onChange={onChange} aria-label={label} />
    </div>
  </div>
)

// Inline select for settings (controlled)
const SS: React.FC<{ label: string; description?: string; options: string[]; value: string; onChange: (v: string) => void }> = ({ label, description, options, value, onChange }) => (
  <div className="flex items-start justify-between py-3 border-b last:border-b-0 border-stone-200">
    <div className="flex-1 min-w-0 pr-4">
      <p className="text-sm text-stone-700">{label}</p>
      {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
    </div>
    <select value={value} onChange={e => onChange(e.target.value)}
            className="text-xs bg-white border border-stone-200 text-stone-700 px-2.5 py-1.5 rounded-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors flex-shrink-0">
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
)

// ── Vocabulary modal ───────────────────────────────────────────
const VocabModal: React.FC<{
  terms: VocabTerm[];
  onSave: (terms: VocabTerm[]) => void;
  onClose: () => void;
}> = ({ terms: initTerms, onSave, onClose }) => {
  const [terms, setTerms]     = useState<VocabTerm[]>(initTerms)
  const [editing, setEditing] = useState<VocabTerm | null>(null)
  const [isNew, setIsNew]     = useState(false)
  const [search, setSearch]   = useState('')

  const blank = (): VocabTerm => ({ id: `v${Date.now()}`, term: '', pronunciation: '', description: '' })

  const openNew  = () => { setEditing(blank()); setIsNew(true) }
  const openEdit = (t: VocabTerm) => { setEditing({ ...t }); setIsNew(false) }

  const commitEdit = () => {
    if (!editing || !editing.term.trim()) return
    setTerms(ts =>
      isNew ? [...ts, editing] : ts.map(t => t.id === editing.id ? editing : t)
    )
    setEditing(null)
  }

  const deleteTerm = (id: string) => setTerms(ts => ts.filter(t => t.id !== id))

  const filtered = terms.filter(t =>
    t.term.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Modal onClose={onClose} labelledBy="vocab-modal-title" maxWidth="max-w-xl">
      <ModalHeader title="管理工作區共用詞彙" id="vocab-modal-title" onClose={onClose} />
      <div className="px-6 py-5">
        <p className="text-xs text-stone-500 mb-4">
          以下詞彙會注入 Azure Speech 語音識別引擎，提升專業術語辨識準確率。
        </p>

        {/* Search + add */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 z-10" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
                   placeholder="搜尋詞彙..."
                   className="pl-8" />
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={openNew}>
            新增詞彙
          </Button>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="mb-3 p-4 rounded-xl bg-teal-50 border border-teal-600/20">
            <p className="text-xs font-medium text-teal-700 mb-3">{isNew ? '新增詞彙' : '編輯詞彙'}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs text-stone-500 mb-1">詞彙 *</label>
                <Input value={editing.term} onChange={e => setEditing(v => v && ({ ...v, term: e.target.value }))}
                       placeholder="例如：Azure OpenAI" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">發音提示</label>
                <Input value={editing.pronunciation} onChange={e => setEditing(v => v && ({ ...v, pronunciation: e.target.value }))}
                       placeholder="例如：azure-open-ai" />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-stone-500 mb-1">說明</label>
              <Input value={editing.description} onChange={e => setEditing(v => v && ({ ...v, description: e.target.value }))}
                     placeholder="簡短說明用途（選填）" />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={commitEdit} disabled={!editing.term.trim()}>
                {isNew ? '新增' : '更新'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>取消</Button>
            </div>
          </div>
        )}

        {/* Term list */}
        <div className="max-h-52 overflow-y-auto mb-4 rounded-xl border border-stone-200">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-xs text-stone-400">{search ? '找不到符合的詞彙' : '尚未新增任何詞彙'}</p>
            </div>
          )}
          {filtered.map((t, i) => (
            <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 group ${i < filtered.length - 1 ? 'border-b border-stone-200' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-700">{t.term}</span>
                  {t.pronunciation && (
                    <span className="text-[10px] text-stone-400 font-mono">{t.pronunciation}</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-stone-500 mt-0.5">{t.description}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <IconButton aria-label="編輯詞彙" onClick={() => openEdit(t)} className="h-6 w-6 hover:text-teal-700">
                  <Pencil size={11} strokeWidth={1.75} />
                </IconButton>
                <IconButton aria-label="刪除詞彙" onClick={() => deleteTerm(t.id)} className="h-6 w-6 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={11} strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-stone-200">
          <span className="text-xs text-stone-500">{terms.length} 個詞彙</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
            <Button variant="primary" size="sm" onClick={() => { onSave(terms); onClose(); }}>儲存詞彙</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Delete workspace modal ─────────────────────────────────────
const DeleteWorkspaceModal: React.FC<{ workspaceName: string; onClose: () => void }> = ({ workspaceName, onClose }) => {
  const [step, setStep]   = useState<1 | 2>(1)
  const [input, setInput] = useState('')
  const confirmed         = input.trim() === workspaceName

  return (
    <Modal onClose={onClose} labelledBy="delete-ws-title" maxWidth="max-w-md">
      <ModalHeader title="刪除工作區" id="delete-ws-title" onClose={onClose} />
      <div className="px-6 py-5">
        {step === 1 ? (
          <>
            <div className="flex items-start gap-3 p-4 rounded-xl mb-5 bg-red-50 border border-red-200">
              <AlertTriangle size={18} strokeWidth={1.75} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">此操作無法復原</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  刪除工作區後，以下資料將<strong className="text-red-600">永久移除</strong>：
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                  <li>• 所有成員帳號與存取權限</li>
                  <li>• 所有會議記錄、逐字稿、摘要</li>
                  <li>• 所有群組、術語辭典、範本</li>
                  <li>• 帳單訂閱將立即取消</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="danger" className="flex-1" onClick={() => setStep(2)}>
                我了解，繼續
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600 mb-2">請輸入工作區名稱確認刪除：</p>
            <p className="text-xs font-mono text-teal-700 mb-3 px-2 py-1 rounded bg-teal-50">
              {workspaceName}
            </p>
            <Input value={input} onChange={e => setInput(e.target.value)}
                   placeholder={`輸入「${workspaceName}」`}
                   className={`mb-4 ${confirmed ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`} />
            <div className="flex gap-3">
              <Button variant="danger" className="flex-1" disabled={!confirmed}>
                確認刪除工作區
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Input row for settings (controlled) ───────────────────────
const SI: React.FC<{ label: string; description?: string; value: string; placeholder?: string; onChange: (v: string) => void }> = ({ label, description, value, placeholder, onChange }) => (
  <div className="flex items-start justify-between py-3 border-b last:border-b-0 border-stone-200">
    <div className="flex-1 min-w-0 pr-4">
      <p className="text-sm text-stone-700">{label}</p>
      {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
    </div>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
           className="text-xs bg-white border border-stone-200 text-stone-700 px-2.5 py-1.5 rounded-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors flex-shrink-0 w-44 placeholder:text-stone-400" />
  </div>
)

// ── Main SettingsTab ───────────────────────────────────────────
const SettingsTab: React.FC = () => {
  const { show } = useToast()
  // Per-section saved & draft states (init from localStorage)
  const [savedAuth,      setSavedAuth]      = useState<AuthSettings>(INIT_AUTH)
  const [draftAuth,      setDraftAuth]      = useState<AuthSettings>(INIT_AUTH)
  const [savedAutoJoin,  setSavedAutoJoin]  = useState<AutoJoinSettings>(INIT_AUTOJOIN)
  const [draftAutoJoin,  setDraftAutoJoin]  = useState<AutoJoinSettings>(INIT_AUTOJOIN)
  const [savedAssistant, setSavedAssistant] = useState<AssistantSettings>(INIT_ASSISTANT)
  const [draftAssistant, setDraftAssistant] = useState<AssistantSettings>(INIT_ASSISTANT)
  const [savedInsight,   setSavedInsight]   = useState<InsightSettings>(INIT_INSIGHT)
  const [draftInsight,   setDraftInsight]   = useState<InsightSettings>(INIT_INSIGHT)
  const [savedSharing,   setSavedSharing]   = useState<SharingSettings>(INIT_SHARING)
  const [draftSharing,   setDraftSharing]   = useState<SharingSettings>(INIT_SHARING)
  const [savedNotify,    setSavedNotify]    = useState<NotifySettings>(INIT_NOTIFY)
  const [draftNotify,    setDraftNotify]    = useState<NotifySettings>(INIT_NOTIFY)
  const [savedScheduler, setSavedScheduler] = useState<SchedulerSettings>(INIT_SCHEDULER)
  const [draftScheduler, setDraftScheduler] = useState<SchedulerSettings>(INIT_SCHEDULER)
  const [savedCopilot,   setSavedCopilot]   = useState<CopilotSettings>(INIT_COPILOT)
  const [draftCopilot,   setDraftCopilot]   = useState<CopilotSettings>(INIT_COPILOT)
  const [savedAdvanced,  setSavedAdvanced]  = useState<AdvancedSettings>(INIT_ADVANCED)
  const [draftAdvanced,  setDraftAdvanced]  = useState<AdvancedSettings>(INIT_ADVANCED)
  const [integrations,   setIntegrations]   = useState<Integration[]>(INIT_INTEGRATIONS)
  const [vocab,          setVocab]          = useState<VocabTerm[]>(INIT_VOCAB)

  const [showVocab,  setShowVocab]  = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [exporting,  setExporting]  = useState(false)

  // Save with localStorage persistence
  const save = <T,>(draft: T, setSaved: (v: T) => void, lsKey: string, label: string) => {
    setSaved(draft)
    saveLS(lsKey, draft)
    show(`${label}已儲存`, 'success')
  }
  const discard = <T,>(saved: T, setDraft: (v: T) => void) => setDraft(saved)

  // Are ANY sections dirty?
  const anyDirty = !deepEqual(draftAuth, savedAuth) || !deepEqual(draftAutoJoin, savedAutoJoin) ||
    !deepEqual(draftAssistant, savedAssistant) || !deepEqual(draftInsight, savedInsight) ||
    !deepEqual(draftSharing, savedSharing) || !deepEqual(draftNotify, savedNotify) ||
    !deepEqual(draftScheduler, savedScheduler) || !deepEqual(draftCopilot, savedCopilot) ||
    !deepEqual(draftAdvanced, savedAdvanced)

  const saveAll = () => {
    setSavedAuth(draftAuth);       saveLS('lisbot_ws_auth',      draftAuth)
    setSavedAutoJoin(draftAutoJoin); saveLS('lisbot_ws_autojoin', draftAutoJoin)
    setSavedAssistant(draftAssistant); saveLS('lisbot_ws_assistant', draftAssistant)
    setSavedInsight(draftInsight); saveLS('lisbot_ws_insight',   draftInsight)
    setSavedSharing(draftSharing); saveLS('lisbot_ws_sharing',   draftSharing)
    setSavedNotify(draftNotify);   saveLS('lisbot_ws_notify',    draftNotify)
    setSavedScheduler(draftScheduler); saveLS('lisbot_ws_scheduler', draftScheduler)
    setSavedCopilot(draftCopilot); saveLS('lisbot_ws_copilot',  draftCopilot)
    setSavedAdvanced(draftAdvanced); saveLS('lisbot_ws_advanced', draftAdvanced)
    show('所有設定已儲存', 'success')
  }

  const toggleIntegration = (id: string) => {
    const next = integrations.map(i => i.id === id ? { ...i, connected: !i.connected } : i)
    setIntegrations(next)
    saveLS('lisbot_ws_integrations', next)
    const intg = next.find(i => i.id === id)
    show(intg?.connected ? `${intg.name} 已連接` : `${integrations.find(i => i.id === id)?.name} 已中斷連接`, intg?.connected ? 'success' : 'info')
  }

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => { setExporting(false); show('匯出準備完成，即將下載', 'success') }, 1800)
  }

  return (
    <div className="relative">
      {/* ── Breadcrumb header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100 bg-stone-50">
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span className="font-medium">xCloudinfo</span>
          <span className="text-stone-300">|</span>
          <span>工作區設置</span>
        </div>
        <span className="flex items-center gap-1 text-xs text-stone-400">
          <Shield size={11} strokeWidth={1.75} />
          僅對工作區所有者和管理員可見
        </span>
      </div>

      {/* ── Global save bar ── */}
      {anyDirty && (
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-2.5 border-b border-amber-200 bg-amber-50">
          <span className="flex items-center gap-2 text-xs text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            有未儲存的設定變更
          </span>
          <Button variant="primary" size="sm" onClick={saveAll}>儲存全部</Button>
        </div>
      )}

      {/* ── 1. 登入方式 ── */}
      <AccordionItem title="登入方式" subtitle="選擇允許工作區用戶登錄 xCloud Lisbot 的方法。" defaultOpen>
        <div className="pt-3 space-y-0">
          <SS label="允許的登入方式" options={['Microsoft 帳號', '電子郵件 + 密碼', '任何方式']}
              value={draftAuth.loginMethod} onChange={v => setDraftAuth(d => ({ ...d, loginMethod: v }))} />
          <ST label="強制啟用 SSO" description="所有成員必須透過 Microsoft SSO 登入"
              value={draftAuth.forceSso} onChange={v => setDraftAuth(d => ({ ...d, forceSso: v }))} />
          <ST label="啟用多重要素驗證（MFA）" description="登入時需要額外驗證步驟，提升帳號安全性"
              value={draftAuth.mfa} onChange={v => setDraftAuth(d => ({ ...d, mfa: v }))} />
          <SS label="工作階段逾時" description="閒置後自動登出的時間"
              options={['1 小時', '4 小時', '8 小時', '24 小時', '永不逾時']}
              value={draftAuth.sessionTimeout} onChange={v => setDraftAuth(d => ({ ...d, sessionTimeout: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftAuth, savedAuth)}
                 onSave={() => save(draftAuth, setSavedAuth, 'lisbot_ws_auth', '登入方式設定')}
                 onDiscard={() => discard(savedAuth, setDraftAuth)} />
      </AccordionItem>

      {/* ── 2. 會議自動加入 ── */}
      <AccordionItem title="會議自動加入偏好設置" subtitle="選擇 xCloud Lisbot 將自動加入的會議。">
        <div className="pt-3 space-y-0">
          <ST label="預設自動加入" description="新成員加入工作區時的預設設定"
              value={draftAutoJoin.enabled} onChange={v => setDraftAutoJoin(d => ({ ...d, enabled: v }))} />
          <SS label="加入條件" options={['我建立的會議', '所有行事曆會議', '被邀請的會議', '含特定關鍵字的會議']}
              value={draftAutoJoin.condition} onChange={v => setDraftAutoJoin(d => ({ ...d, condition: v }))} />
          <ST label="外部會議自動加入" description="針對工作區以外的與會者所建立的會議"
              value={draftAutoJoin.external} onChange={v => setDraftAutoJoin(d => ({ ...d, external: v }))} />
          <SS label="加入前提醒時間" options={['立即加入', '5 分鐘', '10 分鐘', '15 分鐘']}
              value={draftAutoJoin.notifyBefore} onChange={v => setDraftAutoJoin(d => ({ ...d, notifyBefore: v }))} />
          <ST label="需要出席者同意才開始錄製" description="加入前向與會者發送錄製通知"
              value={draftAutoJoin.recordConsent} onChange={v => setDraftAutoJoin(d => ({ ...d, recordConsent: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftAutoJoin, savedAutoJoin)}
                 onSave={() => save(draftAutoJoin, setSavedAutoJoin, 'lisbot_ws_autojoin', '會議自動加入設定')}
                 onDiscard={() => discard(savedAutoJoin, setDraftAutoJoin)} />
      </AccordionItem>

      {/* ── 3. xCloud Lisbot 助理 ── */}
      <AccordionItem title="xCloud Lisbot 助理" subtitle="為該工作區設置助理首選項。">
        <div className="pt-3 space-y-0">
          <ST label="自動生成逐字稿" description="完整逐字記錄每位說話者的發言"
              value={draftAssistant.transcript} onChange={v => setDraftAssistant(d => ({ ...d, transcript: v }))} />
          <ST label="自動生成 AI 摘要" description="會議結束後自動產生摘要、行動項目、關鍵決策"
              value={draftAssistant.summary} onChange={v => setDraftAssistant(d => ({ ...d, summary: v }))} />
          <SS label="預設輸出語言" description="摘要與逐字稿的預設顯示語言"
              options={['繁體中文', '英文', '日文', '簡體中文', '台語（nan-TW）', '客語（hak-TW）']}
              value={draftAssistant.language} onChange={v => setDraftAssistant(d => ({ ...d, language: v }))} />
          <ST label="啟用說話者分離" description="自動辨識並標記不同說話者（Azure Speech Diarization）"
              value={draftAssistant.diarization} onChange={v => setDraftAssistant(d => ({ ...d, diarization: v }))} />
          <ST label="錄製音訊" description="保留會議音訊檔案至 Azure Blob Storage"
              value={draftAssistant.audioRecord} onChange={v => setDraftAssistant(d => ({ ...d, audioRecord: v }))} />
          <ST label="錄製視訊" description="保留會議視訊至 Azure Blob Storage（佔用較多儲存空間）"
              value={draftAssistant.videoRecord} onChange={v => setDraftAssistant(d => ({ ...d, videoRecord: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftAssistant, savedAssistant)}
                 onSave={() => save(draftAssistant, setSavedAssistant, 'lisbot_ws_assistant', '會議助理設定')}
                 onDiscard={() => discard(savedAssistant, setDraftAssistant)} />
      </AccordionItem>

      {/* ── 4. 會議洞察 ── */}
      <AccordionItem title="會議洞察" subtitle="自定義報告內容訪問，包括記錄、轉錄、播放和指標。">
        <div className="pt-3 space-y-0">
          <ST label="啟用 xCloud Lisbot 評分" description="計算每場會議的整體品質分數（0–100）"
              value={draftInsight.score} onChange={v => setDraftInsight(d => ({ ...d, score: v }))} />
          <ST label="啟用情緒分析" description="偵測發言內容的正向／中性／負向情緒傾向"
              value={draftInsight.sentiment} onChange={v => setDraftInsight(d => ({ ...d, sentiment: v }))} />
          <ST label="啟用說話輔導報告" description="WPM、說話比例、提問次數分析"
              value={draftInsight.coaching} onChange={v => setDraftInsight(d => ({ ...d, coaching: v }))} />
          <ST label="啟用參與度分析" description="分析每位與會者的互動頻率與貢獻"
              value={draftInsight.engagement} onChange={v => setDraftInsight(d => ({ ...d, engagement: v }))} />
          <ST label="啟用遵行率分析" description="評估會議是否按議程進行"
              value={draftInsight.compliance} onChange={v => setDraftInsight(d => ({ ...d, compliance: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftInsight, savedInsight)}
                 onSave={() => save(draftInsight, setSavedInsight, 'lisbot_ws_insight', '會議洞察設定')}
                 onDiscard={() => discard(savedInsight, setDraftInsight)} />
      </AccordionItem>

      {/* ── 5. 報告與共享 ── */}
      <AccordionItem title="報告與共享" subtitle="自定義訪問摘要、指標、下載、集成、報告共享和分發的權限。">
        <div className="pt-3 space-y-0">
          <SS label="內部成員預設存取" description="同工作區成員對報告的預設權限"
              options={['僅限建立者', '所有成員', '管理員以上']}
              value={draftSharing.internal} onChange={v => setDraftSharing(d => ({ ...d, internal: v }))} />
          <SS label="外部參與者預設存取" description="不在工作區的與會者對報告的預設權限"
              options={['無存取', '僅讀取', '讀取 + 留言', '完整存取']}
              value={draftSharing.external} onChange={v => setDraftSharing(d => ({ ...d, external: v }))} />
          <ST label="允許分享至工作區外" description="成員可以產生公開分享連結"
              value={draftSharing.allowExternal} onChange={v => setDraftSharing(d => ({ ...d, allowExternal: v }))} />
          <ST label="自動發送 Pre-Read 報告" description="會議前 30 分鐘自動發送議程摘要給與會者"
              value={draftSharing.preRead} onChange={v => setDraftSharing(d => ({ ...d, preRead: v }))} />
          <ST label="會議結束後自動分享摘要" description="完成摘要後自動發送給所有與會者"
              value={draftSharing.autoShare} onChange={v => setDraftSharing(d => ({ ...d, autoShare: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftSharing, savedSharing)}
                 onSave={() => save(draftSharing, setSavedSharing, 'lisbot_ws_sharing', '報告與共享設定')}
                 onDiscard={() => discard(savedSharing, setDraftSharing)} />
      </AccordionItem>

      {/* ── 6. 通知設定 ── */}
      <AccordionItem title="通知設定" subtitle="定制消息、電子郵件、CRM、協作通知偏好設定。">
        <div className="pt-3 space-y-0">
          <ST label="每日摘要通知" description="每天早上 9 點發送前一天的會議摘要彙整"
              value={draftNotify.dailySummary} onChange={v => setDraftNotify(d => ({ ...d, dailySummary: v }))} />
          <SS label="Readouts 通知方式" description="摘要報告完成後的通知管道"
              options={['僅 Teams', '僅 Email', 'Teams + Email', '不通知']}
              value={draftNotify.readouts} onChange={v => setDraftNotify(d => ({ ...d, readouts: v }))} />
          <ST label="每週回顧通知" description="每週一發送上週會議統計與洞察"
              value={draftNotify.weeklyReview} onChange={v => setDraftNotify(d => ({ ...d, weeklyReview: v }))} />
          <ST label="推薦建議通知" description="收到 AI 推薦（優化與會者、減少不必要會議）時通知"
              value={draftNotify.recommendations} onChange={v => setDraftNotify(d => ({ ...d, recommendations: v }))} />
          <ST label="新成員加入通知" description="有新成員加入工作區時通知管理員"
              value={draftNotify.newMember} onChange={v => setDraftNotify(d => ({ ...d, newMember: v }))} />
          <ST label="會議前提醒" description="排定的會議即將開始前發送提醒"
              value={draftNotify.meetingReminder} onChange={v => setDraftNotify(d => ({ ...d, meetingReminder: v }))} />
          <SS label="Email 通知頻率"
              options={['即時', '每日彙總', '每週彙總', '不發送 Email']}
              value={draftNotify.emailPref} onChange={v => setDraftNotify(d => ({ ...d, emailPref: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftNotify, savedNotify)}
                 onSave={() => save(draftNotify, setSavedNotify, 'lisbot_ws_notify', '通知設定')}
                 onDiscard={() => discard(savedNotify, setDraftNotify)} />
      </AccordionItem>

      {/* ── 7. 集成 ── */}
      <AccordionItem title="集成" subtitle="定制消息、電子郵件、CRM、協作和工作流集成的訪問權限。">
        <div className="pt-3 space-y-2">
          {integrations.map(intg => (
            <div key={intg.id} className={`flex items-center justify-between px-4 py-3.5 rounded-xl bg-white border ${intg.connected ? 'border-green-200' : 'border-stone-200'}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl flex-shrink-0">{intg.logo}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-stone-700">{intg.name}</p>
                    {intg.connected && (
                      <Badge tone="success">已連接</Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 truncate mt-0.5">
                    {intg.connected && intg.account ? intg.account : intg.description}
                  </p>
                </div>
              </div>
              <button onClick={() => toggleIntegration(intg.id)}
                      className={`flex-shrink-0 ml-4 px-3 py-1 rounded-lg text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20 ${
                        intg.connected
                          ? 'text-stone-600 border-stone-200 hover:border-red-300 hover:text-red-600'
                          : 'text-teal-700 border-teal-600/30 hover:bg-teal-50'
                      }`}>
                {intg.connected ? '中斷連接' : '連接'}
              </button>
            </div>
          ))}
        </div>
      </AccordionItem>

      {/* ── 8. 自定義詞匯 ── */}
      <AccordionItem title="自定義詞匯" subtitle="管理自定義詞匯以提高整個工作區轉錄的準確性。">
        <div className="pt-4">
          <p className="text-xs text-stone-500 mb-3 leading-relaxed">
            工作區共用詞彙會透過 Azure Speech PhraseListGrammar 直接注入語音識別引擎，
            補充個人詞彙，提升專業術語與產品名稱的辨識準確率。
          </p>
          {vocab.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {vocab.slice(0, 8).map(t => (
                <Badge key={t.id} tone="accent">{t.term}</Badge>
              ))}
              {vocab.length > 8 && (
                <Badge tone="neutral">+{vocab.length - 8} 個</Badge>
              )}
            </div>
          )}
          <Button variant="secondary" size="sm" icon={<Plus size={13} strokeWidth={1.75} />}
                  className="text-teal-700 border-teal-600/40 hover:bg-teal-50"
                  onClick={() => setShowVocab(true)}>
            管理共用詞彙
          </Button>
        </div>
      </AccordionItem>

      {/* ── 9. 智能排程器 ── */}
      <AccordionItem title="智能排程器" subtitle="會議排程連結、日曆、平台和可用性設定。">
        <div className="pt-3 space-y-0">
          <SS label="日曆來源" description="智能排程器讀取空閒時段的行事曆"
              options={['Outlook Calendar', 'Google Calendar', '手動指定']}
              value={draftScheduler.calendarSource} onChange={v => setDraftScheduler(d => ({ ...d, calendarSource: v }))} />
          <SS label="預設會議平台"
              options={['Microsoft Teams', 'Zoom', 'Google Meet', '自訂連結']}
              value={draftScheduler.platform} onChange={v => setDraftScheduler(d => ({ ...d, platform: v }))} />
          <SI label="自訂會議連結 URL" description="當平台選擇「自訂連結」時使用"
              placeholder="https://meet.example.com/room"
              value={draftScheduler.customUrl} onChange={v => setDraftScheduler(d => ({ ...d, customUrl: v }))} />
          <SS label="預設會議時長"
              options={['15 分鐘', '30 分鐘', '45 分鐘', '60 分鐘', '90 分鐘']}
              value={draftScheduler.defaultDuration} onChange={v => setDraftScheduler(d => ({ ...d, defaultDuration: v }))} />
          <SS label="最短緩衝時間" description="兩場會議之間保留的最少間隔"
              options={['無緩衝', '5 分鐘', '10 分鐘', '15 分鐘', '30 分鐘']}
              value={draftScheduler.bufferTime} onChange={v => setDraftScheduler(d => ({ ...d, bufferTime: v }))} />
          <div className="flex items-start justify-between py-3 border-b border-stone-200">
            <p className="text-sm text-stone-700">工作時段</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input type="time" value={draftScheduler.workStart}
                     onChange={e => setDraftScheduler(d => ({ ...d, workStart: e.target.value }))}
                     className="text-xs bg-white border border-stone-200 text-stone-700 px-2 py-1 rounded-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors" />
              <span className="text-stone-400 text-xs">至</span>
              <input type="time" value={draftScheduler.workEnd}
                     onChange={e => setDraftScheduler(d => ({ ...d, workEnd: e.target.value }))}
                     className="text-xs bg-white border border-stone-200 text-stone-700 px-2 py-1 rounded-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors" />
            </div>
          </div>
          <ST label="避免週末排會" description="智能排程器不會建議週末時段"
              value={draftScheduler.avoidWeekend} onChange={v => setDraftScheduler(d => ({ ...d, avoidWeekend: v }))} />
          <ST label="避免工作時段外排會" description="超出工作時段的時間不納入排程選項"
              value={draftScheduler.avoidLateHours} onChange={v => setDraftScheduler(d => ({ ...d, avoidLateHours: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftScheduler, savedScheduler)}
                 onSave={() => save(draftScheduler, setSavedScheduler, 'lisbot_ws_scheduler', '智能排程器設定')}
                 onDiscard={() => discard(savedScheduler, setDraftScheduler)} />
      </AccordionItem>

      {/* ── 10. 搜索副駕駛 ── */}
      <AccordionItem title="搜索副駕駛" subtitle="為此工作區的用戶定制搜索體驗。">
        <div className="pt-3 space-y-0">
          <ST label="啟用搜索副駕駛" description="允許 AI 搜尋歷史會議內容回答問題"
              value={draftCopilot.enabled} onChange={v => setDraftCopilot(d => ({ ...d, enabled: v }))} />
          <SS label="搜尋範圍" description="副駕駛可以存取的會議記錄範圍"
              options={['僅個人會議', '同群組', '工作區全部']}
              value={draftCopilot.scope} onChange={v => setDraftCopilot(d => ({ ...d, scope: v }))} />
          <SS label="搜索記憶保留期間" description="AI 記憶中的會議知識保留多久"
              options={['30 天', '90 天', '180 天', '1 年', '永久']}
              value={draftCopilot.retention} onChange={v => setDraftCopilot(d => ({ ...d, retention: v }))} />
          <ST label="跨會議主題連結" description="自動連結不同會議中的相關討論主題"
              value={draftCopilot.crossMeeting} onChange={v => setDraftCopilot(d => ({ ...d, crossMeeting: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftCopilot, savedCopilot)}
                 onSave={() => save(draftCopilot, setSavedCopilot, 'lisbot_ws_copilot', '搜索副駕駛設定')}
                 onDiscard={() => discard(savedCopilot, setDraftCopilot)} />
      </AccordionItem>

      {/* ── 11. 高級 ── */}
      <AccordionItem title="高級" subtitle="管理 SSO、域捕獲和數據保留策略。" badge="企業+ 計劃需要">
        <div className="pt-3 space-y-0">
          <ST label="允許成員自訂個人設定" description="關閉後所有設定由管理員統一控制，成員無法覆蓋"
              value={draftAdvanced.memberCustomize} onChange={v => setDraftAdvanced(d => ({ ...d, memberCustomize: v }))} />
          <ST label="啟用 API 存取" description="允許工作區管理員產生 API Token 串接第三方系統"
              value={draftAdvanced.apiAccess} onChange={v => setDraftAdvanced(d => ({ ...d, apiAccess: v }))} />
          <ST label="資料保留稽核日誌" description="記錄所有會議存取、匯出、分享事件"
              value={draftAdvanced.retentionLog} onChange={v => setDraftAdvanced(d => ({ ...d, retentionLog: v }))} />
          <SS label="資料保留期間" description="超過期限的舊會議記錄將自動封存"
              options={['90 天', '180 天', '365 天', '2 年', '永久保留']}
              value={draftAdvanced.retentionDays} onChange={v => setDraftAdvanced(d => ({ ...d, retentionDays: v }))} />
          <ST label="GDPR 合規模式" description="開啟後自動套用 GDPR 資料處理規則與保留限制"
              value={draftAdvanced.gdprMode} onChange={v => setDraftAdvanced(d => ({ ...d, gdprMode: v }))} />
        </div>
        <SaveBar dirty={!deepEqual(draftAdvanced, savedAdvanced)}
                 onSave={() => save(draftAdvanced, setSavedAdvanced, 'lisbot_ws_advanced', '高級設定')}
                 onDiscard={() => discard(savedAdvanced, setDraftAdvanced)} />
      </AccordionItem>

      {/* ── 12. 工作區操作 ── */}
      <AccordionItem title="工作區操作" subtitle="更改工作區訪問、所有權或數據。">
        <div className="pt-4 space-y-3">
          {/* Export */}
          <div className="p-4 rounded-xl bg-white border border-stone-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-stone-700">匯出工作區資料</p>
                <p className="text-xs text-stone-500 mt-0.5">下載所有會議、逐字稿、摘要、詞彙設定的 ZIP 壓縮包</p>
              </div>
              <Button variant="secondary" size="sm" disabled={exporting} loading={exporting}
                      onClick={handleExport}>
                {exporting ? '準備中...' : '匯出'}
              </Button>
            </div>
          </div>
          {/* Reset */}
          <div className="p-4 rounded-xl bg-white border border-stone-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-stone-700">重設所有工作區設定</p>
                <p className="text-xs text-stone-500 mt-0.5">將所有設定恢復為預設值（不刪除資料）</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                ['lisbot_ws_auth','lisbot_ws_autojoin','lisbot_ws_assistant','lisbot_ws_insight',
                 'lisbot_ws_sharing','lisbot_ws_notify','lisbot_ws_scheduler','lisbot_ws_copilot','lisbot_ws_advanced']
                  .forEach(k => localStorage.removeItem(k))
                show('設定已重設為預設值', 'success')
              }}>
                重設設定
              </Button>
            </div>
          </div>
          {/* Delete */}
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-red-700">刪除工作區</p>
                <p className="text-xs text-stone-500 mt-0.5">此操作無法復原，所有資料與帳號將永久刪除</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
                刪除工作區
              </Button>
            </div>
          </div>
        </div>
      </AccordionItem>

      {showVocab  && <VocabModal terms={vocab} onSave={t => { setVocab(t); saveLS('lisbot_ws_vocab', t); show(`共用詞彙已儲存（${t.length} 個）`, 'success') }} onClose={() => setShowVocab(false)} />}
      {showDelete && <DeleteWorkspaceModal workspaceName="CloudInfo" onClose={() => setShowDelete(false)} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tab 4 — 權限
// ══════════════════════════════════════════════════════════════
const PermissionsTab: React.FC = () => (
  <div>
    {/* Breadcrumb */}
    <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100 bg-stone-50">
      <div className="flex items-center gap-2 text-sm text-stone-600">
        <span className="font-medium">xCloudinfo</span>
        <span className="text-stone-300">|</span>
        <span>工作區權限</span>
      </div>
      <span className="flex items-center gap-1 text-xs text-stone-400">
        <Shield size={11} strokeWidth={1.75} />
        僅對工作區所有者和管理員可見
      </span>
    </div>

    <AccordionItem title="會議報告訪問" subtitle="自定義工作區成員可以在會議報告中訪問的內容以及如何共享。" defaultOpen>
      <div className="pt-3 space-y-1">
        <PermissionRow label="查看自己的會議報告" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'允許' }} />
        <PermissionRow label="查看同群組的會議報告" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
        <PermissionRow label="查看工作區所有會議報告" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
        <PermissionRow label="匯出會議報告" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
      </div>
    </AccordionItem>
    <AccordionItem title="匯總指標和趨勢" subtitle="自定義哪些角色可以訪問工作區內的聚合報告。">
      <div className="pt-3 space-y-1">
        <PermissionRow label="查看個人分析（說話分析、我的摘要）" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'允許' }} />
        <PermissionRow label="查看工作區概覽" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
        <PermissionRow label="查看推薦建議" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
      </div>
    </AccordionItem>
    <AccordionItem title="高級權限" subtitle="設置成員規則和高級觀看權限控制。">
      <div className="pt-3 space-y-1">
        <PermissionRow label="管理工作區成員" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'允許','成員':'禁止' }} />
        <PermissionRow label="修改工作區設置" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'禁止','成員':'禁止' }} />
        <PermissionRow label="管理計劃與帳單" options={['允許','禁止']} defaults={{ '所有者':'允許','管理員':'禁止','成員':'禁止' }} />
      </div>
    </AccordionItem>
  </div>
);

// ══════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════
type TabKey = 'teams' | 'people' | 'settings' | 'permissions';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'teams',       label: '團隊',  icon: <Users    size={14} strokeWidth={1.75} /> },
  { key: 'people',      label: '人員',  icon: <User     size={14} strokeWidth={1.75} /> },
  { key: 'settings',    label: '設置',  icon: <Settings size={14} strokeWidth={1.75} /> },
  { key: 'permissions', label: '權限',  icon: <Shield   size={14} strokeWidth={1.75} /> },
];

const WorkspaceAdminPage: React.FC = () => {
  const [tab, setTab]         = useState<TabKey>('teams');
  const [members, setMembers] = useState<Member[]>(INIT_MEMBERS);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-stone-400 mb-3">
            <Building2 size={13} strokeWidth={1.75} />
            <span>管理工作區</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900">管理工作區</h1>
            <Badge tone="neutral">預覽</Badge>
          </div>
          <p className="text-sm text-stone-500 mt-1">管理群組、成員、工作區設定與權限</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden shadow-card bg-white border border-stone-200">
          {/* Tabs */}
          <div className="flex border-b border-stone-200">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                      className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                        tab === t.key
                          ? 'text-teal-700 border-teal-700'
                          : 'text-stone-500 border-transparent hover:text-stone-700 hover:border-stone-300'
                      }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'teams'       && <TeamsTab       members={members} setMembers={setMembers} />}
          {tab === 'people'      && <PeopleTab      members={members} setMembers={setMembers} />}
          {tab === 'settings'    && <SettingsTab />}
          {tab === 'permissions' && <PermissionsTab />}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceAdminPage;
