import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Clock, Calendar, BarChart2, Mic, Users, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, Skeleton } from '../components/ui';

// ── Types ──────────────────────────────────────────────────────
type SentimentLevel = 'positive' | 'neutral' | 'negative' | 'none';

interface WorkspaceData {
  meeting_count: number;
  time_mgmt: {
    late_start: Record<string, number>;
    overtime: Record<string, number>;
  };
  heatmap: Record<string, Record<string, SentimentLevel>>;
  meeting_mgmt: {
    lisbot_score: number;
    sentiment: number;
    engagement: number;
    reference: number;
  };
  participation: {
    balanced_pct: number;
    avg_talk_ratio: number;
  };
}

// ── Mock data ──────────────────────────────────────────────────
const MOCK: WorkspaceData = {
  meeting_count: 0,
  time_mgmt: {
    late_start: { 週一: 0, 週二: 0, 週三: 0, 週四: 0, 週五: 0, 週六: 0, 週日: 0 },
    overtime:   { 週一: 0, 週二: 0, 週三: 0, 週四: 0, 週五: 0, 週六: 0, 週日: 0 },
  },
  heatmap: {
    '週一': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週二': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週三': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週四': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週五': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週六': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
    '週日': { '6–9': 'none', '9–12': 'none', '12–15': 'none', '15–18': 'none', '18–21': 'none' },
  },
  meeting_mgmt: { lisbot_score: 71, sentiment: 72, engagement: 70, reference: 78 },
  participation: { balanced_pct: 0, avg_talk_ratio: 0 },
};

const DAYS  = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const DAYS_SHORT = ['星', '星', '星', '星', '星', '星', '星'];
const SLOTS = ['6–9', '9–12', '12–15', '15–18', '18–21'];
const SLOT_LABELS: Record<string, string> = {
  '6–9':   '6am – 9am',
  '9–12':  '9am – 12pm',
  '12–15': '12pm – 3pm',
  '15–18': '3pm – 6pm',
  '18–21': '6pm – 9pm',
};

// ── Sentiment colors (semantic status only) ────────────────────
const sentimentBg = (level: SentimentLevel): string => {
  if (level === 'positive') return 'rgba(21,128,61,0.30)';   // green-700
  if (level === 'neutral')  return 'rgba(168,162,158,0.25)'; // stone-400
  if (level === 'negative') return 'rgba(220,38,38,0.30)';   // red-600
  return 'transparent';
};
const sentimentBorder = (level: SentimentLevel): string => {
  if (level === 'positive') return 'rgba(21,128,61,0.40)';
  if (level === 'neutral')  return 'rgba(168,162,158,0.40)';
  if (level === 'negative') return 'rgba(220,38,38,0.40)';
  return '#e7e5e4'; // stone-200
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Panel wrapper ──────────────────────────────────────────────
const Panel: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, title, children, className = '' }) => (
  <Card className={`flex flex-col overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-100">
      <div className="text-stone-400">{icon}</div>
      <p className="text-sm font-semibold text-stone-700">{title}</p>
    </div>
    <div className="flex-1 p-5">{children}</div>
  </Card>
);

// ── Tab button ─────────────────────────────────────────────────
const Tab: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20 ${
      active ? 'bg-teal-700 text-white' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
    }`}
  >
    {label}
  </button>
);

// ── Empty state (inline, panel-local) ──────────────────────────
const EmptyHint: React.FC<{ message?: string }> = ({ message = '尚無資料' }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <p className="text-sm text-stone-400">{message}</p>
  </div>
);

// ── Panel 1: 時間管理者 ────────────────────────────────────────
const TimeMgmtPanel: React.FC<{ data: WorkspaceData['time_mgmt']; loading: boolean; hasData: boolean }> = ({
  data, loading, hasData,
}) => {
  const [activeTab, setActiveTab] = useState<'late_start' | 'overtime'>('late_start');
  const chartData = activeTab === 'late_start' ? data.late_start : data.overtime;
  const maxVal = Math.max(...Object.values(chartData), 1);

  return (
    <Panel icon={<Clock size={14} strokeWidth={1.75} />} title="時間管理者">
      <div className="flex gap-1 mb-5 p-1 bg-stone-100 rounded-lg w-fit">
        <Tab label="延遲開始" active={activeTab === 'late_start'} onClick={() => setActiveTab('late_start')} />
        <Tab label="會議超時" active={activeTab === 'overtime'}   onClick={() => setActiveTab('overtime')} />
      </div>

      {loading ? (
        <div className="space-y-2">{DAYS.map(d => <Skeleton key={d} className="h-5 w-full" />)}</div>
      ) : !hasData ? (
        <EmptyHint message="尚無資料，完成會議後即可顯示時間管理統計" />
      ) : (
        <div className="space-y-2">
          {DAYS.map(day => {
            const val = chartData[day] ?? 0;
            const pct = (val / maxVal) * 100;
            return (
              <div key={day} className="flex items-center gap-3">
                <span className="text-xs text-stone-500 w-6 flex-shrink-0">{day}</span>
                <div className="flex-1 h-5 bg-stone-100 rounded-md overflow-hidden">
                  {val > 0 && (
                    <div
                      className="h-full rounded-md flex items-center pl-2 transition-all bg-amber-500"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[10px] text-white font-semibold">{val}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs text-stone-400 w-4 text-right flex-shrink-0">{val}</span>
              </div>
            );
          })}
          <p className="text-[10px] text-stone-400 mt-3">
            {activeTab === 'late_start' ? '延遲開始次數（依星期）' : '會議超時次數（依星期）'}
          </p>
        </div>
      )}
    </Panel>
  );
};

// ── Panel 2: 會議安排工具 ──────────────────────────────────────
const SchedulePanel: React.FC<{ data: WorkspaceData['heatmap']; loading: boolean; hasData: boolean }> = ({
  data, loading, hasData,
}) => {
  const [activeTab, setActiveTab] = useState<'time' | 'duration' | 'size'>('time');

  return (
    <Panel icon={<Calendar size={14} strokeWidth={1.75} />} title="會議安排工具">
      <div className="flex gap-1 mb-1 p-1 bg-stone-100 rounded-lg w-fit">
        <Tab label="天和時間" active={activeTab === 'time'}     onClick={() => setActiveTab('time')} />
        <Tab label="持續時間" active={activeTab === 'duration'} onClick={() => setActiveTab('duration')} />
        <Tab label="大小"     active={activeTab === 'size'}     onClick={() => setActiveTab('size')} />
      </div>

      {activeTab === 'time' && (
        <p className="text-[10px] text-stone-400 mb-4 mt-2">基於聚合參與度的最佳會面日和時間</p>
      )}

      {loading ? (
        <div className="space-y-2">{SLOTS.map(s => <Skeleton key={s} className="h-7 w-full" />)}</div>
      ) : activeTab !== 'time' ? (
        <EmptyHint />
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            {[
              { label: '積極', color: 'rgba(21,128,61,0.55)', border: 'rgba(21,128,61,0.40)' },
              { label: '中性', color: 'rgba(168,162,158,0.40)', border: 'rgba(168,162,158,0.40)' },
              { label: '負面', color: 'rgba(220,38,38,0.50)', border: 'rgba(220,38,38,0.40)' },
              { label: '無數據', color: 'transparent', border: '#e7e5e4' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color, border: `1.5px solid ${l.border}` }} />
                <span className="text-[10px] text-stone-400">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Column headers */}
          <div className="grid mb-1" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
            <div />
            {DAYS.map((d, i) => (
              <div key={d} className="text-center">
                <span className="text-[10px] text-stone-400 font-medium">{DAYS_SHORT[i]}</span>
              </div>
            ))}
          </div>

          {/* Heatmap rows */}
          <div className="space-y-1">
            {SLOTS.map(slot => (
              <div key={slot} className="grid items-center" style={{ gridTemplateColumns: '80px repeat(7, 1fr)', gap: '3px' }}>
                <span className="text-[10px] text-stone-400 leading-tight pr-2">{SLOT_LABELS[slot]}</span>
                {DAYS.map(day => {
                  const level = (data[day]?.[slot] ?? 'none') as SentimentLevel;
                  const isEmpty = !hasData || level === 'none';
                  const label = level === 'positive' ? '積極' : level === 'neutral' ? '中性' : level === 'negative' ? '負面' : '';
                  return (
                    <div
                      key={day}
                      title={!isEmpty ? `${day} ${SLOT_LABELS[slot]}：${label}` : ''}
                      className="h-7 rounded"
                      style={{
                        background: isEmpty ? 'transparent' : sentimentBg(level),
                        border: `1px solid ${isEmpty ? '#e7e5e4' : sentimentBorder(level)}`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {!hasData && (
            <p className="text-xs text-stone-400 text-center mt-4">尚無資料，完成會議後即可顯示參與度熱圖</p>
          )}
        </>
      )}
    </Panel>
  );
};

// ── Panel 3: 會議管理器 ────────────────────────────────────────
const MeetingMgmtPanel: React.FC<{
  data: WorkspaceData['meeting_mgmt'];
  loading: boolean;
}> = ({ data, loading }) => {
  const navigate = useNavigate();

  const metrics = [
    { label: 'xCloud Lisbot 分數', value: data.lisbot_score, color: 'text-teal-700' },
    { label: '情感',       value: data.sentiment,    color: 'text-green-700' },
    { label: '參與度',     value: data.engagement,   color: 'text-stone-800' },
  ];

  return (
    <Panel icon={<BarChart2 size={14} strokeWidth={1.75} />} title="會議管理器">
      {loading ? (
        <div className="space-y-5">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          {/* Link */}
          <button
            onClick={() => navigate('/analytics')}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 mb-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20 rounded"
          >
            查看所有會議報告
            <ChevronRight size={13} strokeWidth={1.75} />
          </button>

          {/* Three score numbers */}
          <div className="flex items-end gap-6 mb-6">
            {metrics.map(m => (
              <div key={m.label} className="text-center">
                <p className={`text-2xl font-bold tabular-nums leading-none ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-stone-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Comparison bar chart: 當前 vs xCloud Lisbot 指數 */}
          <div className="space-y-3">
            {[
              { label: '當前',       value: data.lisbot_score, bar: 'bg-teal-700' },
              { label: 'xCloud Lisbot 指數', value: data.reference,   bar: 'bg-stone-400' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500 w-20 flex-shrink-0">{row.label}</span>
                  <div className="flex-1 h-6 bg-stone-100 rounded overflow-hidden">
                    <div
                      className={`h-full rounded flex items-center justify-end pr-2 transition-all ${row.bar}`}
                      style={{ width: `${clamp(row.value, 0, 100)}%` }}
                    >
                      <span className="text-[10px] text-white font-semibold">{row.value}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {/* x-axis labels */}
            <div className="flex pl-[92px]">
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                <div key={v} className="flex-1 text-center">
                  {v % 20 === 0 && <span className="text-[9px] text-stone-300">{v}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
};

// ── Panel 4: 參與 ─────────────────────────────────────────────
const ParticipationPanel: React.FC<{
  data: WorkspaceData['participation'];
  loading: boolean;
  hasData: boolean;
}> = ({ data, loading, hasData }) => {
  const balanced   = data.balanced_pct;
  const unbalanced = 100 - balanced;

  const r           = 40;
  const cx          = 56;
  const cy          = 56;
  const circumference = 2 * Math.PI * r;
  const balancedDash  = (balanced / 100) * circumference;

  return (
    <Panel icon={<Mic size={14} strokeWidth={1.75} />} title="參與">
      <p className="text-xs text-stone-500 mb-4">會議中的話語時間分布</p>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-teal-600" />
          <span className="text-xs text-stone-500">平衡講話時間</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="text-xs text-stone-500">不平衡的講話時間</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="w-28 h-28 rounded-full" />
          <div className="w-full space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
        </div>
      ) : !hasData ? (
        <EmptyHint message="尚無資料，完成會議後即可顯示話語時間分布" />
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="flex-shrink-0">
            <svg width="112" height="112" viewBox="0 0 112 112">
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fca5a5" strokeWidth="18" />
              <circle
                cx={cx} cy={cy} r={r}
                fill="none" stroke="#0d9488" strokeWidth="18"
                strokeDasharray={`${balancedDash} ${circumference - balancedDash}`}
                strokeDashoffset={circumference / 4}
                strokeLinecap="butt"
              />
              <text x={cx} y={cy - 5} textAnchor="middle"
                style={{ fontSize: 18, fill: '#1c1917', fontWeight: 600 }}>
                {balanced}%
              </text>
              <text x={cx} y={cy + 12} textAnchor="middle"
                style={{ fontSize: 9, fill: '#a8a29e' }}>平衡</text>
            </svg>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-4">
            {[
              { label: '平均說話比例',  value: data.avg_talk_ratio, bar: 'bg-teal-600', suffix: '%' },
              { label: '均衡會議佔比',  value: balanced,             bar: 'bg-teal-700', suffix: '%' },
              { label: '不均衡會議佔比', value: unbalanced,           bar: 'bg-red-400',  suffix: '%' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-xs text-stone-400 mb-1">{s.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold text-stone-800 tabular-nums">{s.value}</span>
                  <span className="text-xs text-stone-400">{s.suffix}</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${s.bar}`}
                    style={{ width: `${clamp(s.value, 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
};

// ── Main page ──────────────────────────────────────────────────
const WorkspacePage: React.FC = () => {
  const { getToken } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [data, setData]     = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');
      const res = await fetch(`${backendUrl}/api/analytics/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('api error');
      const json = await res.json();
      setData(json.data ?? json);
      setUseMock(false);
    } catch {
      setData(MOCK);
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const d = data ?? MOCK;
  const hasData = d.meeting_count > 0;

  // Date range label (last 30 days)
  const today = new Date();
  const from  = new Date(today); from.setDate(today.getDate() - 29);
  const fmtDate = (dt: Date) =>
    `${dt.getMonth() + 1}月${dt.getDate()}日`;
  const dateRange = `${fmtDate(from)} - ${today.getFullYear()}年${fmtDate(today)}`;

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">工作區概覽</h1>
            <Badge tone="neutral">預覽</Badge>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-stone-500">{dateRange}</p>
            {useMock && (
              <Badge tone="warning">預覽模式</Badge>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          icon={<RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />}
        >
          重新整理
        </Button>
      </div>

      {/* Stats summary bar */}
      {!loading && (
        <Card className="flex items-center gap-6 mb-6 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users size={14} strokeWidth={1.75} className="text-stone-400" />
            <div>
              <p className="text-lg font-semibold text-stone-900 leading-none tabular-nums">{d.meeting_count}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">近 30 天會議</p>
            </div>
          </div>
          <div className="w-px h-8 bg-stone-200" />
          <div>
            <p className="text-lg font-semibold leading-none tabular-nums text-teal-700">
              {hasData ? d.meeting_mgmt.lisbot_score : '—'}
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">xCloud Lisbot 平均分數</p>
          </div>
          <div className="w-px h-8 bg-stone-200" />
          <div>
            <p className="text-lg font-semibold leading-none tabular-nums text-green-700">
              {hasData ? d.meeting_mgmt.sentiment : '—'}
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">平均情緒指數</p>
          </div>
          <div className="w-px h-8 bg-stone-200" />
          <div>
            <p className="text-lg font-semibold leading-none tabular-nums text-stone-800">
              {hasData ? `${d.participation.balanced_pct}%` : '—'}
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">均衡會議比例</p>
          </div>
        </Card>
      )}

      {/* 2×2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeMgmtPanel  data={d.time_mgmt}     loading={loading} hasData={hasData} />
        <SchedulePanel  data={d.heatmap}        loading={loading} hasData={hasData} />
        <MeetingMgmtPanel data={d.meeting_mgmt} loading={loading} />
        <ParticipationPanel data={d.participation} loading={loading} hasData={hasData} />
      </div>

      <p className="mt-5 text-center text-xs text-stone-400">
        <Clock size={10} strokeWidth={1.75} className="inline mr-1" />
        資料範圍：近 30 天 · 共 {d.meeting_count} 場會議
        {useMock && ' · 預覽資料僅供展示'}
      </p>
      </div>
    </div>
  );
};

export default WorkspacePage;
