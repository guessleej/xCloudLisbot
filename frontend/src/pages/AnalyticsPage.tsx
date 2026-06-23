import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, Skeleton } from '../components/ui';

// ── Types ──────────────────────────────────────────────────────
type TabId = 'lisbot' | 'sentiment' | 'engagement' | 'compliance';

interface DistItem  { label: string; count: number; pct?: number }
interface PolicyData {
  period_days: number;
  meeting_count: number;
  scores: Record<TabId, number | null>;
  benchmarks: Record<TabId, number>;
  weekday: DistItem[];
  time_of_day: DistItem[];
  size: DistItem[];
  duration: DistItem[];
}

// ── Mock data ──────────────────────────────────────────────────
const MOCK: PolicyData = {
  period_days: 30,
  meeting_count: 18,
  scores:     { lisbot: 71, sentiment: 68, engagement: 75, compliance: 82 },
  benchmarks: { lisbot: 74, sentiment: 72, engagement: 70, compliance: 78 },
  weekday: [
    { label: '週一', count: 5 },
    { label: '週二', count: 4 },
    { label: '週三', count: 6 },
    { label: '週四', count: 5 },
    { label: '週五', count: 3 },
    { label: '週六', count: 0 },
    { label: '週日', count: 0 },
  ],
  time_of_day: [
    { label: '06–09', count: 1 },
    { label: '09–12', count: 9 },
    { label: '12–15', count: 3 },
    { label: '15–18', count: 5 },
    { label: '18–21', count: 0 },
  ],
  size: [
    { label: '一對一', count: 5,  pct: 28 },
    { label: '2–3 人', count: 8,  pct: 44 },
    { label: '4+ 人',  count: 5,  pct: 28 },
  ],
  duration: [
    { label: '< 30 分鐘',  count: 4, pct: 22 },
    { label: '30–60 分鐘', count: 9, pct: 50 },
    { label: '> 60 分鐘',  count: 5, pct: 28 },
  ],
};

// ── Tab config ─────────────────────────────────────────────────
// color: primary chart accent (teal for neutral metrics, semantic for sentiment/compliance)
// shades: 3-step ramp for donut/multi-segment charts, all within the same hue
const TABS: { id: TabId; label: string; color: string; shades: [string, string, string]; desc: string }[] = [
  { id: 'lisbot',     label: 'xCloud Lisbot 分數', color: '#0f766e', shades: ['#0f766e', '#14b8a6', '#99f6e4'], desc: '綜合會議品質評分，涵蓋效率、參與度與產出完整性' },
  { id: 'sentiment',  label: '情緒',   color: '#15803d', shades: ['#15803d', '#22c55e', '#bbf7d0'], desc: '會議中整體情緒氛圍指數，反映對話正向程度' },
  { id: 'engagement', label: '參與度', color: '#0f766e', shades: ['#0f766e', '#14b8a6', '#99f6e4'], desc: '出席者互動頻率，衡量會議中的主動投入程度' },
  { id: 'compliance', label: '遵行率', color: '#b45309', shades: ['#b45309', '#f59e0b', '#fde68a'], desc: '會議流程遵循情況，包含準時開始、準時結束' },
];

// ── Helpers ────────────────────────────────────────────────────
const clamp = (v: number) => Math.min(100, Math.max(0, v));

// ── Score gauge (horizontal slider-style) ─────────────────────
const ScoreGauge: React.FC<{
  score: number | null;
  benchmark: number;
  color: string;
}> = ({ score, benchmark, color }) => {
  const scorePct = score !== null ? clamp(score) : null;
  const benchPct = clamp(benchmark);

  return (
    <div className="mt-4">
      <div className="relative h-4 bg-stone-100 rounded-full overflow-visible">
        {/* Benchmark marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-stone-400 rounded-full z-10"
          style={{ left: `${benchPct}%` }}
        />
        {/* Score fill */}
        {scorePct !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{ width: `${scorePct}%`, background: color }}
          />
        )}
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-stone-400">
        <span>0</span>
        <span style={{ marginLeft: `${benchPct - 5}%` }} className="text-stone-500">
          基準 {benchmark}
        </span>
        <span>100</span>
      </div>
    </div>
  );
};

// ── Vertical bar chart (weekday / time-of-day) ─────────────────
const VerticalBars: React.FC<{ data: DistItem[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map(d => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-stone-400 tabular-nums">{d.count > 0 ? d.count : ''}</span>
          <div className="w-full flex items-end" style={{ height: '80px' }}>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${d.count === 0 ? 2 : (d.count / max) * 80}px`,
                background: d.count === 0 ? '#e7e5e4' : color,
              }}
            />
          </div>
          <span className="text-xs text-stone-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ── Horizontal bar ─────────────────────────────────────────────
const HBar: React.FC<{ label: string; pct: number; count: number; color: string; max?: number }> = ({ label, pct, count, color }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm text-stone-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-400">{count} 場</span>
        <span className="text-sm font-medium text-stone-700 tabular-nums w-8 text-right">{pct}%</span>
      </div>
    </div>
    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${clamp(pct)}%`, background: color }} />
    </div>
  </div>
);

// ── Donut chart (SVG) ──────────────────────────────────────────
const Donut: React.FC<{ segments: { label: string; pct: number; color: string }[] }> = ({ segments }) => {
  const r = 42, cx = 52, cy = 52, stroke = 18;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width="104" height="104" viewBox="0 0 104 104" className="flex-shrink-0">
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f5f5f4" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const dashLen = (seg.pct / 100) * circumference;
          const dashGap = circumference - dashLen;
          const rotate  = -90 + (offset / 100) * 360;
          offset += seg.pct;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeLinecap="butt"
              transform={`rotate(${rotate} ${cx} ${cy})`}
            />
          );
        })}
        {/* Center text */}
        <text x={cx} y={cy - 5}  textAnchor="middle" fontSize="16" fontWeight="700" fill="#1c1917">
          {segments[0]?.pct}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9"  fill="#a8a29e">
          {segments[0]?.label}
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-sm text-stone-600">{s.label}</span>
            <span className="text-sm font-medium text-stone-700 tabular-nums ml-auto pl-3">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Chart panel shell ──────────────────────────────────────────
const ChartPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="p-5">
    <p className="text-sm font-semibold text-stone-700 mb-4">{title}</p>
    {children}
  </Card>
);

// ── Main page ──────────────────────────────────────────────────
const AnalyticsPage: React.FC = () => {
  const { getToken }  = useAuth();
  const backendUrl    = process.env.REACT_APP_BACKEND_URL || '';

  const [tab,     setTab]     = useState<TabId>('lisbot');
  const [data,    setData]    = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');
      const res = await fetch(`${backendUrl}/api/analytics/meeting-policy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('api');
      const json = await res.json();
      const d: PolicyData = json.data ?? json;
      if (d.meeting_count === 0) { setData(MOCK); setUseMock(true); }
      else                       { setData(d);    setUseMock(false); }
    } catch {
      setData(MOCK); setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tabCfg    = TABS.find(t => t.id === tab)!;
  const myScore   = data?.scores[tab] ?? null;
  const benchmark = data?.benchmarks[tab] ?? 74;
  const diff      = myScore !== null ? myScore - benchmark : null;

  return (
    <div className="min-h-full bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">會議政策</h1>
            <Badge tone="neutral">預覽</Badge>
          </div>
          <p className="text-sm text-stone-500">
            分析您的會議模式，發現可改善的面向
            {useMock && (
              <span className="ml-2 inline-flex items-center text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                預覽模式
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          icon={<RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />}
        >
          重新整理
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-stone-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-1 pb-2.5 mr-6 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/20 rounded-sm ${
              tab === t.id
                ? 'border-teal-700 text-teal-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* My score */}
        <Card className="p-5 md:col-span-2">
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs text-stone-500">我的{tabCfg.label}</p>
            {diff !== null && (
              <Badge tone={diff >= 0 ? 'success' : 'error'}>
                {diff >= 0 ? '+' : ''}{diff} vs 基準
              </Badge>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <p className="text-4xl font-bold leading-none tabular-nums" style={{ color: myScore !== null ? tabCfg.color : '#d6d3d1' }}>
              {myScore ?? '--'}
            </p>
          )}
          <p className="text-xs text-stone-400 mt-1">{tabCfg.desc}</p>
          {loading ? <Skeleton className="h-6 w-full mt-4" /> : <ScoreGauge score={myScore} benchmark={benchmark} color={tabCfg.color} />}
        </Card>

        {/* Stats */}
        <div className="flex flex-col gap-3">
          <Card className="p-4 flex-1">
            <p className="text-xs text-stone-400 mb-1">基準分數</p>
            <p className="text-2xl font-semibold text-stone-700 tabular-nums leading-none">{benchmark}</p>
            <p className="text-xs text-stone-400 mt-1">xCloud Lisbot 平均</p>
          </Card>
          <Card className="p-4 flex-1">
            <p className="text-xs text-stone-400 mb-1">會議總數</p>
            <p className="text-2xl font-semibold text-stone-700 tabular-nums leading-none">{loading ? '--' : (data?.meeting_count ?? 0)}</p>
            <p className="text-xs text-stone-400 mt-1">近 30 天</p>
          </Card>
        </div>
      </div>

      {/* Charts 2×2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weekday */}
        <ChartPanel title="星期幾分布">
          {loading
            ? <div className="flex items-end gap-1.5 h-28">{[...Array(7)].map((_, i) => <Skeleton key={i} className="flex-1 h-full" />)}</div>
            : <VerticalBars data={data?.weekday ?? []} color={tabCfg.color} />}
        </ChartPanel>

        {/* Time of day */}
        <ChartPanel title="一天時間段分布">
          {loading
            ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            : (
              <div className="space-y-2">
                {(data?.time_of_day ?? []).map(d => {
                  const max = Math.max(...(data?.time_of_day ?? []).map(x => x.count), 1);
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="text-xs text-stone-400 w-14 flex-shrink-0 text-right">{d.label}</span>
                      <div className="flex-1 h-6 bg-stone-50 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all flex items-center pl-2"
                          style={{ width: `${d.count === 0 ? 4 : (d.count / max) * 100}%`, background: d.count === 0 ? '#fafaf9' : tabCfg.color }}
                        />
                      </div>
                      <span className="text-xs text-stone-500 tabular-nums w-6 text-right">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
        </ChartPanel>

        {/* Meeting size */}
        <ChartPanel title="會議規模">
          {loading
            ? <Skeleton className="h-20 w-full" />
            : (
              <Donut
                segments={(data?.size ?? []).map((s, i) => ({
                  label: s.label,
                  pct: s.pct ?? 0,
                  color: tabCfg.shades[i] ?? tabCfg.shades[2],
                }))}
              />
            )}
        </ChartPanel>

        {/* Duration */}
        <ChartPanel title="會議時長">
          {loading
            ? <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            : (
              <div className="space-y-4">
                {(data?.duration ?? []).map(d => (
                  <HBar
                    key={d.label}
                    label={d.label}
                    pct={d.pct ?? 0}
                    count={d.count}
                    color={tabCfg.color}
                  />
                ))}
              </div>
            )}
        </ChartPanel>
      </div>

      {/* Footer */}
      <p className="mt-5 text-center text-xs text-stone-400">
        <Clock size={10} strokeWidth={1.75} className="inline mr-1" />
        資料來源：近 {data?.period_days ?? 30} 天 · 共 {data?.meeting_count ?? 0} 場會議
        {useMock && ' · 預覽資料僅供展示'}
      </p>
      </div>
    </div>
  );
};

export default AnalyticsPage;
