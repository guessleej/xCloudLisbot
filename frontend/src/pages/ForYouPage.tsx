import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb, CheckSquare, Link2, AlertCircle,
  RefreshCw, FolderClosed, ChevronRight, Clock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────
interface Theme {
  label: string;
  count: number;
  meeting_ids: string[];
}

interface ActionItem {
  text: string;
  meeting_id: string;
  meeting_title: string;
  created_at: string | null;
  done: boolean;
}

interface RelatedMeeting {
  id: string;
  title: string;
  created_at: string | null;
}

interface RelatedCluster {
  label: string;
  meetings: RelatedMeeting[];
}

interface KeyIssue {
  text: string;
  meeting_id: string;
  meeting_title: string;
  created_at: string | null;
}

interface ForYouData {
  period_days: number;
  meeting_count: number;
  themes: Theme[];
  action_items: ActionItem[];
  related: RelatedCluster[];
  key_issues: KeyIssue[];
}

// ── Mock fallback data ─────────────────────────────────────────
const MOCK_DATA: ForYouData = {
  period_days: 30,
  meeting_count: 6,
  themes: [
    { label: '客戶會議', count: 2, meeting_ids: ['m1'] },
    { label: '計劃會議', count: 2, meeting_ids: ['m2'] },
    { label: '銷售討論', count: 1, meeting_ids: ['m5'] },
    { label: '腦力激盪', count: 1, meeting_ids: ['m6'] },
  ],
  action_items: [
    { text: '準備下次客戶提案簡報', meeting_id: 'm1', meeting_title: '研華企業解決方案合作討論', created_at: new Date().toISOString(), done: false },
    { text: '確認馬祖專案里程碑時程', meeting_id: 'm2', meeting_title: '馬祖專案週進度同步', created_at: new Date(Date.now() - 86400000).toISOString(), done: false },
    { text: '整理昇恆昌品牌策略報告', meeting_id: 'm5', meeting_title: '【線上會議】昇恆昌品牌策略規劃', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), done: false },
  ],
  related: [
    {
      label: 'Teams 會議',
      meetings: [
        { id: 'm1', title: '研華企業解決方案合作討論', created_at: new Date().toISOString() },
        { id: 'm2', title: '馬祖專案週進度同步', created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: 'm4', title: '每日摘要', created_at: new Date(Date.now() - 86400000).toISOString() },
      ],
    },
    {
      label: 'Google Meet',
      meetings: [
        { id: 'm3', title: 'LINE Public System Development', created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: 'm5', title: '【線上會議】昇恆昌品牌策略規劃', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      ],
    },
  ],
  key_issues: [
    { text: '昇恆昌品牌定位方向待確認', meeting_id: 'm5', meeting_title: '昇恆昌品牌策略規劃', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { text: 'LINE 系統串接技術風險未解決', meeting_id: 'm3', meeting_title: 'LINE Public System Development', created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
};

// ── Helpers ────────────────────────────────────────────────────
const fmtRelative = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7)  return `${diff} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const FOLDER_COLORS: Record<string, string> = {
  '計劃會議': '#6366f1',
  '客戶會議': '#0ea5e9',
  '銷售討論': '#10b981',
  '狀態更新': '#f59e0b',
  '腦力激盪': '#ec4899',
  '其他':     '#94a3b8',
};
const folderColor = (label: string) => FOLDER_COLORS[label] ?? '#7B2FFF';

// ── Section card shell ─────────────────────────────────────────
const Section: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  badge?: number;
  children: React.ReactNode;
}> = ({ icon, iconBg, title, description, badge, children }) => (
  <div className="bg-white rounded-xl border border-slate-200">
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-slate-900">{title}</p>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1.5 rounded-full text-[10px] font-semibold text-white" style={{ background: '#00D4FF' }}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center justify-center py-6">
    <p className="text-[12px] text-slate-400">{text}</p>
  </div>
);

// ── Themes panel ───────────────────────────────────────────────
const ThemesPanel: React.FC<{ themes: Theme[] }> = ({ themes }) => {
  if (!themes.length) return <Empty text="尚無足夠資料" />;
  const total = themes.reduce((s, t) => s + t.count, 0);
  return (
    <div className="space-y-2">
      {themes.map(t => {
        const pct = Math.round((t.count / total) * 100);
        const color = folderColor(t.label);
        return (
          <div key={t.label} className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-slate-700 font-medium truncate">{t.label}</span>
                <span className="text-[11px] text-slate-400 ml-2 flex-shrink-0">{t.count} 場</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color, opacity: 0.7 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Action items panel ─────────────────────────────────────────
const ActionItemsPanel: React.FC<{
  items: ActionItem[];
  onNavigate: (id: string) => void;
}> = ({ items, onNavigate }) => {
  const [done, setDone] = useState<Set<number>>(new Set());

  if (!items.length) return <Empty text="目前沒有未完成的行動事項" />;
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-3 py-2.5 rounded-lg group transition-colors ${done.has(i) ? 'opacity-40' : 'hover:bg-slate-50'}`}
        >
          <button
            onClick={() => setDone(d => { const n = new Set(d); n.has(i) ? n.delete(i) : n.add(i); return n; })}
            className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-slate-300 flex items-center justify-center transition-colors"
            style={done.has(i) ? { background: '#10b981', borderColor: '#10b981' } : {}}
          >
            {done.has(i) && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-[12px] text-slate-700 leading-snug ${done.has(i) ? 'line-through' : ''}`}>{item.text}</p>
            <button
              onClick={() => onNavigate(item.meeting_id)}
              className="text-[11px] text-slate-400 hover:text-[#00D4FF] transition-colors mt-0.5 truncate max-w-full text-left"
            >
              {item.meeting_title}
            </button>
          </div>
          {item.created_at && (
            <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{fmtRelative(item.created_at)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Related content panel ──────────────────────────────────────
const RelatedPanel: React.FC<{
  clusters: RelatedCluster[];
  onNavigate: (id: string) => void;
}> = ({ clusters, onNavigate }) => {
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  if (!clusters.length) return <Empty text="尚無相關的會議記錄" />;
  return (
    <div className="space-y-1">
      {clusters.map((c, ci) => (
        <div key={ci}>
          <button
            onClick={() => setOpen(s => { const n = new Set(s); n.has(ci) ? n.delete(ci) : n.add(ci); return n; })}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
          >
            <FolderClosed size={13} strokeWidth={1.75} className="text-slate-400 flex-shrink-0" />
            <span className="text-[12px] font-medium text-slate-700 flex-1">{c.label}</span>
            <span className="text-[11px] text-slate-400">{c.meetings.length} 場</span>
            <ChevronRight size={13} strokeWidth={2} className={`text-slate-300 transition-transform ${open.has(ci) ? 'rotate-90' : ''}`} />
          </button>
          {open.has(ci) && (
            <div className="ml-5 border-l border-slate-100 pl-3 mb-1">
              {c.meetings.map(m => (
                <button
                  key={m.id}
                  onClick={() => onNavigate(m.id)}
                  className="w-full flex items-center justify-between gap-2 py-1.5 text-left hover:text-[#00D4FF] transition-colors group"
                >
                  <span className="text-[12px] text-slate-600 group-hover:text-[#00D4FF] truncate leading-snug">{m.title}</span>
                  {m.created_at && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtRelative(m.created_at)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Key issues panel ───────────────────────────────────────────
const KeyIssuesPanel: React.FC<{
  issues: KeyIssue[];
  onNavigate: (id: string) => void;
}> = ({ issues, onNavigate }) => {
  if (!issues.length) return <Empty text="目前沒有待解決的問題" />;
  return (
    <div className="space-y-1">
      {issues.map((issue, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50/50 transition-colors group">
          <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-slate-700 leading-snug">{issue.text}</p>
            <button
              onClick={() => onNavigate(issue.meeting_id)}
              className="text-[11px] text-slate-400 hover:text-[#00D4FF] transition-colors mt-0.5 truncate max-w-full text-left"
            >
              {issue.meeting_title}
            </button>
          </div>
          {issue.created_at && (
            <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{fmtRelative(issue.created_at)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Skeleton loader ────────────────────────────────────────────
const Skeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse p-4">
    {[80, 60, 70].map((w, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-slate-200" />
        <div className="h-3 rounded bg-slate-200" style={{ width: `${w}%` }} />
      </div>
    ))}
  </div>
);

// ── Main page ──────────────────────────────────────────────────
const ForYouPage: React.FC = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [data, setData] = useState<ForYouData | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');
      const res = await fetch(`${backendUrl}/api/analytics/for-you`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('api error');
      const json = await res.json();
      const d: ForYouData = json.data ?? json;

      // If real data has no meetings, fall back to mock so UI is always useful
      if (d.meeting_count === 0) {
        setData(MOCK_DATA);
        setUseMock(true);
      } else {
        setData(d);
        setUseMock(false);
      }
    } catch {
      setData(MOCK_DATA);
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goMeeting = useCallback((id: string) => navigate(`/meeting/${id}`), [navigate]);

  return (
    <div className="min-h-full" style={{ background: '#F1F5F9' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight mb-1">我的摘要</h1>
          <p className="text-[13px] text-slate-500">
            根據您近 30 天的會議記錄，為您整理個人化洞察
            {useMock && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                預覽模式
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          重新整理
        </button>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-6 mb-6 px-4 py-3 rounded-xl bg-white border border-slate-200">
          <div className="text-center">
            <p className="text-[20px] font-semibold text-slate-900 leading-none">{data.meeting_count}</p>
            <p className="text-[11px] text-slate-400 mt-1">近 30 天會議</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-center">
            <p className="text-[20px] font-semibold text-slate-900 leading-none">{data.action_items.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">待處理事項</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-center">
            <p className="text-[20px] font-semibold text-slate-900 leading-none">{data.key_issues.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">關鍵問題</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-center">
            <p className="text-[20px] font-semibold text-slate-900 leading-none">{data.themes.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">討論主題</p>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Themes */}
        <Section
          icon={<Lightbulb size={15} strokeWidth={1.75} className="text-amber-500" />}
          iconBg="rgba(245,158,11,0.1)"
          title="主題"
          description="AI 彙整近期會議主要議題"
          badge={data?.themes.length}
        >
          {loading ? <Skeleton /> : <ThemesPanel themes={data?.themes ?? []} />}
        </Section>

        {/* Action items */}
        <Section
          icon={<CheckSquare size={15} strokeWidth={1.75} className="text-emerald-500" />}
          iconBg="rgba(16,185,129,0.1)"
          title="行動事項"
          description="跨會議的未完成待辦事項"
          badge={data?.action_items.length}
        >
          {loading ? <Skeleton /> : <ActionItemsPanel items={data?.action_items ?? []} onNavigate={goMeeting} />}
        </Section>

        {/* Related content */}
        <Section
          icon={<Link2 size={15} strokeWidth={1.75} style={{ color: '#00D4FF' }} />}
          iconBg="rgba(0,212,255,0.08)"
          title="相關內容"
          description="同主題的近期會議"
          badge={data?.related.length}
        >
          {loading ? <Skeleton /> : <RelatedPanel clusters={data?.related ?? []} onNavigate={goMeeting} />}
        </Section>

        {/* Key issues */}
        <Section
          icon={<AlertCircle size={15} strokeWidth={1.75} className="text-red-400" />}
          iconBg="rgba(248,113,113,0.1)"
          title="關鍵問題"
          description="AI 偵測到的待解決問題"
          badge={data?.key_issues.length}
        >
          {loading ? <Skeleton /> : <KeyIssuesPanel issues={data?.key_issues ?? []} onNavigate={goMeeting} />}
        </Section>
      </div>

      {/* Footer hint */}
      <p className="mt-6 text-center text-[11px] text-slate-400">
        <Clock size={10} className="inline mr-1" />
        資料來源：近 30 天 · {data ? `共 ${data.meeting_count} 場會議` : '載入中…'}
        {useMock && ' · 預覽資料僅供展示'}
      </p>
      </div>
    </div>
  );
};

export default ForYouPage;
