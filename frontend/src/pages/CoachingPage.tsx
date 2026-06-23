import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, MessageCircle, HelpCircle, RefreshCw,
  ChevronRight, Clock, Mic,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Badge, Skeleton, EmptyState } from '../components/ui';

// ── Types ──────────────────────────────────────────────────────
interface MeetingRow {
  id: string;
  title: string;
  created_at: string | null;
  wpm: number | null;
  talk_ratio: number | null;
  question_count: number;
  duration_min: number;
  word_count: number;
}

interface CoachingData {
  period_days: number;
  meeting_count: number;
  avg_wpm: number | null;
  avg_talk_ratio: number | null;
  avg_question_count: number | null;
  wpm_target: [number, number];
  meetings: MeetingRow[];
}

// ── Mock data ──────────────────────────────────────────────────
const MOCK: CoachingData = {
  period_days: 30,
  meeting_count: 6,
  avg_wpm: 156,
  avg_talk_ratio: 38,
  avg_question_count: 4.2,
  wpm_target: [130, 180],
  meetings: [
    { id: 'm1', title: '研華企業解決方案合作討論', created_at: new Date().toISOString(),                        wpm: 162, talk_ratio: 42, question_count: 5, duration_min: 47,  word_count: 7614  },
    { id: 'm2', title: '馬祖專案週進度同步',       created_at: new Date(Date.now()-86400000).toISOString(),    wpm: 148, talk_ratio: 35, question_count: 3, duration_min: 28,  word_count: 4144  },
    { id: 'm3', title: 'LINE Public System Dev',   created_at: new Date(Date.now()-86400000).toISOString(),    wpm: 134, talk_ratio: 29, question_count: 6, duration_min: 62,  word_count: 8308  },
    { id: 'm4', title: '每日摘要',                 created_at: new Date(Date.now()-2*86400000).toISOString(),  wpm: 171, talk_ratio: 55, question_count: 2, duration_min: 15,  word_count: 2565  },
    { id: 'm5', title: '昇恆昌品牌策略規劃',       created_at: new Date(Date.now()-2*86400000).toISOString(),  wpm: 159, talk_ratio: 33, question_count: 5, duration_min: 54,  word_count: 8586  },
    { id: 'm6', title: '產品路線圖腦力激盪',       created_at: new Date(Date.now()-3*86400000).toISOString(),  wpm: 161, talk_ratio: 40, question_count: 5, duration_min: 73,  word_count: 11753 },
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wpmPct = (wpm: number) => clamp((wpm / 300) * 100, 0, 100);
const WPM_BAND_L = (130 / 300) * 100;
const WPM_BAND_W = ((180 - 130) / 300) * 100;

// Status-driven text colour classes for the WPM value/labels.
const wpmTextClass = (wpm: number | null): string => {
  if (wpm === null) return 'text-stone-400';
  if (wpm < 100 || wpm > 220) return 'text-red-600';
  if (wpm >= 130 && wpm <= 180) return 'text-green-700';
  return 'text-amber-700';
};
// Status-driven fill colour classes for the WPM bar/marker.
const wpmFillClass = (wpm: number | null): string => {
  if (wpm === null) return 'bg-stone-300';
  if (wpm < 100 || wpm > 220) return 'bg-red-500';
  if (wpm >= 130 && wpm <= 180) return 'bg-green-600';
  return 'bg-amber-500';
};

// ── Stat card ──────────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string; value: string; sub: string;
  valueClass?: string;
  children?: React.ReactNode;
}> = ({ icon, label, value, sub, valueClass = 'text-stone-900', children }) => (
  <Card className="p-5">
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50">
        {icon}
      </div>
      <span className="text-xs text-stone-500 font-medium">{label}</span>
    </div>
    <p className={`text-3xl font-semibold leading-none tabular-nums mb-1 ${valueClass}`}>{value}</p>
    <p className="text-xs text-stone-400 mb-4">{sub}</p>
    {children}
  </Card>
);

// ── WPM gauge bar ───────────────────────────────────────────────
const WpmBar: React.FC<{ wpm: number | null; target: [number, number] }> = ({ wpm, target }) => {
  const fill = wpmFillClass(wpm);
  const pct  = wpm ? wpmPct(wpm) : 0;
  return (
    <div>
      <div className="relative h-3 bg-stone-100 rounded-full overflow-hidden mb-2">
        <div className="absolute inset-y-0 rounded-full bg-green-600 opacity-20"
             style={{ left: `${WPM_BAND_L}%`, width: `${WPM_BAND_W}%` }} />
        {wpm !== null && (
          <>
            <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${fill}`}
                 style={{ width: `${pct}%` }} />
            <div className={`absolute top-0 bottom-0 w-0.5 rounded-full ${fill}`}
                 style={{ left: `${pct}%` }} />
          </>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-stone-400">
        <span>0</span>
        <span className="text-green-700 font-medium">建議 {target[0]}–{target[1]}</span>
        <span>300</span>
      </div>
    </div>
  );
};

// ── Horizontal progress bar ─────────────────────────────────────
const ProgressBar: React.FC<{ pct: number | null; barClass: string; hint?: string }> = ({ pct, barClass, hint }) => (
  <div>
    <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-1.5">
      {pct !== null && (
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${clamp(pct, 0, 100)}%` }} />
      )}
    </div>
    {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
  </div>
);

// ── Per-meeting table row ───────────────────────────────────────
const RowItem: React.FC<{ row: MeetingRow; target: [number, number]; onClick: () => void }> = ({ row, onClick }) => {
  const fill = wpmFillClass(row.wpm);
  const text = wpmTextClass(row.wpm);
  return (
    <button
      onClick={onClick}
      className="w-full grid items-center gap-4 px-5 py-3.5 hover:bg-stone-100 transition-colors text-left border-b border-stone-100 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
      style={{ gridTemplateColumns: '1fr 120px 80px 64px 24px' }}
    >
      <div className="min-w-0">
        <p className="text-xs text-stone-700 font-medium truncate">{row.title}</p>
        <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1">
          <Clock size={10} strokeWidth={1.75} />
          {fmtRelative(row.created_at)} · {row.duration_min} 分鐘
        </p>
      </div>

      {/* WPM mini bar */}
      <div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className={`text-xs font-semibold tabular-nums ${text}`}>{row.wpm ?? '--'}</span>
          <span className="text-[10px] text-stone-400">詞/分</span>
        </div>
        <div className="relative h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 rounded-full bg-green-600 opacity-20"
               style={{ left: `${WPM_BAND_L}%`, width: `${WPM_BAND_W}%` }} />
          {row.wpm !== null && (
            <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`}
                 style={{ width: `${wpmPct(row.wpm)}%` }} />
          )}
        </div>
      </div>

      {/* Talk ratio */}
      <div className="text-center">
        <p className="text-sm font-semibold text-stone-700 tabular-nums leading-none">
          {row.talk_ratio ?? '--'}<span className="text-[10px] font-normal text-stone-400">%</span>
        </p>
        <p className="text-[10px] text-stone-400 mt-0.5">說話</p>
      </div>

      {/* Questions */}
      <div className="text-center">
        <p className="text-sm font-semibold text-stone-700 tabular-nums leading-none">{row.question_count}</p>
        <p className="text-[10px] text-stone-400 mt-0.5">提問</p>
      </div>

      <ChevronRight size={13} strokeWidth={1.75} className="text-stone-300 justify-self-end" />
    </button>
  );
};

// ── Main page ──────────────────────────────────────────────────
const CoachingPage: React.FC = () => {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const backendUrl   = process.env.REACT_APP_BACKEND_URL || '';

  const [data, setData]       = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');
      const res = await fetch(`${backendUrl}/api/analytics/coaching`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('api error');
      const json = await res.json();
      const d: CoachingData = json.data ?? json;
      if (d.meeting_count === 0) { setData(MOCK); setUseMock(true); }
      else                       { setData(d);    setUseMock(false); }
    } catch {
      setData(MOCK); setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const wpm     = data?.avg_wpm ?? null;
  const wpmText = wpmTextClass(wpm);
  const talkPct = data?.avg_talk_ratio ?? null;
  const qAvg    = data?.avg_question_count ?? null;

  return (
    <div className="min-h-full bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">說話分析</h1>
            <Badge tone="neutral">預覽</Badge>
          </div>
          <p className="text-sm text-stone-500">
            透過數據了解您在會議中的表現，持續改善溝通效果
            {useMock && (
              <Badge tone="warning" className="ml-2 align-middle">預覽模式</Badge>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          icon={<RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />}
        >
          重新整理
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* WPM */}
        <StatCard
          icon={<TrendingUp size={15} strokeWidth={1.75} className={wpmText} />}
          label="講話節奏"
          value={wpm !== null ? String(wpm) : '--'}
          valueClass={wpmText}
          sub={wpm !== null ? '詞/分鐘（近 30 天平均）' : '詞/分鐘（需更多資料）'}
        >
          {loading
            ? <Skeleton className="h-6 w-full" />
            : <WpmBar wpm={wpm} target={data?.wpm_target ?? [130, 180]} />}
          {!loading && wpm !== null && (
            <p className={`mt-2 text-xs font-medium ${wpmText}`}>
              {wpm < 100    ? '語速偏慢，可嘗試加快節奏'
               : wpm > 220  ? '語速偏快，建議放慢語速'
               : wpm >= 130 && wpm <= 180 ? '節奏理想，繼續保持'
               : '接近理想範圍'}
            </p>
          )}
        </StatCard>

        {/* Talk ratio */}
        <StatCard
          icon={<MessageCircle size={15} strokeWidth={1.75} className="text-teal-700" />}
          label="說話比例"
          value={talkPct !== null ? `${talkPct}%` : '--'}
          sub={talkPct !== null ? '佔總會議時間（主要發言者）' : '佔總會議時間'}
        >
          {loading
            ? <Skeleton className="h-4 w-full" />
            : <ProgressBar
                pct={talkPct}
                barClass="bg-teal-700"
                hint={
                  talkPct === null ? undefined
                  : talkPct < 20  ? '參與度偏低，多分享您的觀點'
                  : talkPct > 60  ? '說話比例偏高，多給他人空間'
                  : '說話比例適中'
                }
              />}
        </StatCard>

        {/* Questions */}
        <StatCard
          icon={<HelpCircle size={15} strokeWidth={1.75} className="text-teal-700" />}
          label="提問數"
          value={qAvg !== null ? String(qAvg) : '--'}
          sub={qAvg !== null ? '每次會議平均提問次數' : '每次會議平均'}
        >
          {loading
            ? <Skeleton className="h-4 w-full" />
            : <ProgressBar
                pct={qAvg !== null ? clamp((qAvg / 10) * 100, 0, 100) : null}
                barClass="bg-teal-700"
                hint={
                  qAvg === null ? undefined
                  : qAvg < 2   ? '多提問有助釐清議題'
                  : qAvg >= 4  ? '提問積極，有助推進討論'
                  : '提問頻率適中'
                }
              />}
        </StatCard>
      </div>

      {/* Per-meeting table */}
      <Card className="overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
          <p className="text-sm font-semibold text-stone-700">近期會議</p>
          {data && (
            <span className="text-xs text-stone-400">{data.meetings.length} 場 · 近 30 天</span>
          )}
        </div>

        {/* Column headers */}
        {!loading && (data?.meetings.length ?? 0) > 0 && (
          <div className="grid gap-4 px-5 py-2 bg-stone-50 border-b border-stone-100"
               style={{ gridTemplateColumns: '1fr 120px 80px 64px 24px' }}>
            {['會議', '講話節奏', '說話比例', '提問', ''].map((h, i) => (
              <p key={i} className={`text-xs text-stone-400 font-medium ${i === 2 || i === 3 ? 'text-center' : ''}`}>{h}</p>
            ))}
          </div>
        )}

        {loading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (data?.meetings.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Mic size={28} strokeWidth={1.75} />}
            title="還沒有會議記錄"
            description="完成會議錄音後，這裡將顯示您的說話數據"
          />
        ) : (
          data!.meetings.map(row => (
            <RowItem
              key={row.id}
              row={row}
              target={data!.wpm_target}
              onClick={() => navigate(`/meeting/${row.id}`)}
            />
          ))
        )}
      </Card>

      {/* Tips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { title: '理想語速', desc: '130–180 詞/分鐘是大多數聽眾最舒適的節奏，太快難以理解，太慢容易失去注意力。' },
          { title: '說話比例', desc: '在團隊會議中，理想說話比例約 20–40%。一對一時可適度提高至 50%。' },
          { title: '主動提問', desc: '每次會議提問 3–5 次，能有效促進雙向溝通並釐清關鍵議題。' },
        ].map(tip => (
          <Card key={tip.title} className="px-4 py-3">
            <p className="text-xs font-semibold text-stone-700 mb-1">{tip.title}</p>
            <p className="text-xs text-stone-500 leading-relaxed">{tip.desc}</p>
          </Card>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-stone-400">
        <Clock size={10} strokeWidth={1.75} className="inline mr-1" />
        資料來源：近 30 天 · 共 {data?.meeting_count ?? 0} 場會議
        {useMock && ' · 預覽資料僅供展示'}
      </p>
      </div>
    </div>
  );
};

export default CoachingPage;
