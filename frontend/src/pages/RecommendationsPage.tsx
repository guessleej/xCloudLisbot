import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  User, CheckCircle, XCircle, RefreshCw, Users, AlertTriangle,
  ThumbsUp, Clock, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────
interface Recommendation {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  reasons: string[];
  talk_pct?: number;
  turns?: number;
}

interface MeetingWithRecs {
  id: string;
  title: string;
  date: string;
  rec_count: number;
  recommendations: Recommendation[];
}

type PanelTab = 'new' | 'reviewed';

// ── Mock data ──────────────────────────────────────────────────
const MOCK: MeetingWithRecs[] = [
  {
    id: 'r1', title: '業務週會', date: '週一 4/27 10:00–11:00', rec_count: 3,
    recommendations: [
      { id: 'r1-1', name: '吳柏緯', title: '建議將 吳柏緯 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 2 場會議中攝影機均未開啟', '近 1 場會議整體情緒偏負面'], talk_pct: 3.2, turns: 2 },
      { id: 'r1-2', name: '劉自仁', title: '建議將 劉自仁 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['說話時間不足總時長 5%', '近 2 場會議中提早離線'], talk_pct: 4.1, turns: 3 },
      { id: 'r1-3', name: '衛泰宏', title: '建議將 衛泰宏 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 3 場會議中均未發言'], talk_pct: 0.8, turns: 1 },
    ],
  },
  {
    id: 'r2', title: '輔英科大-AI 會議', date: '週四 4/16 10:00–10:30', rec_count: 2,
    recommendations: [
      { id: 'r2-1', name: '黃淑英', title: '建議將 黃淑英 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 2 場會議中攝影機均未開啟', '說話時間不足總時長 5%'], talk_pct: 2.9, turns: 2 },
      { id: 'r2-2', name: '陳建志', title: '建議將 陳建志 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 1 場會議整體情緒偏負面', '近 2 場會議中提早離線'], talk_pct: 1.5, turns: 1 },
    ],
  },
  {
    id: 'r3', title: '馬祖專案討論', date: '週五 4/17 11:00–12:00', rec_count: 1,
    recommendations: [
      { id: 'r3-1', name: '吳柏緯', title: '建議將 吳柏緯 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 3 場會議中均未發言', '近 2 場會議中攝影機均未開啟'], talk_pct: 1.2, turns: 1 },
    ],
  },
  {
    id: 'r4', title: '研華企業合作討論', date: '週二 4/22 14:00–15:00', rec_count: 2,
    recommendations: [
      { id: 'r4-1', name: '劉自仁', title: '建議將 劉自仁 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['說話時間不足總時長 5%'], talk_pct: 3.8, turns: 2 },
      { id: 'r4-2', name: '衛泰宏', title: '建議將 衛泰宏 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 2 場會議中提早離線', '近 1 場會議整體情緒偏負面'], talk_pct: 2.1, turns: 2 },
    ],
  },
  {
    id: 'r5', title: '昇恆昌品牌策略規劃', date: '週三 4/23 15:30–16:00', rec_count: 1,
    recommendations: [
      { id: 'r5-1', name: '黃淑英', title: '建議將 黃淑英 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 3 場會議中均未發言'], talk_pct: 0.5, turns: 1 },
    ],
  },
  {
    id: 'r6', title: '產品路線圖腦力激盪', date: '週四 4/24 09:00–10:00', rec_count: 1,
    recommendations: [
      { id: 'r6-1', name: '陳建志', title: '建議將 陳建志 改為選填出席', subtitle: 'xCloud Lisbot 建議將此人設為選填出席者', reasons: ['近 2 場會議中攝影機均未開啟', '說話時間不足總時長 5%'], talk_pct: 1.9, turns: 1 },
    ],
  },
];

// ── Avatar ─────────────────────────────────────────────────────
const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <div
    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[15px] font-semibold select-none"
    style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
  >
    {name.slice(0, 1)}
  </div>
);

// ── Skeleton ───────────────────────────────────────────────────
const Skel: React.FC<{ h?: number; w?: string }> = ({ h = 12, w = '100%' }) => (
  <div className="bg-slate-100 rounded animate-pulse" style={{ height: h, width: w }} />
);

// ── Recommendation card ────────────────────────────────────────
const RecCard: React.FC<{
  rec: Recommendation;
  status: 'new' | 'accepted' | 'ignored';
  onAccept: () => void;
  onIgnore: () => void;
  onUndo: () => void;
}> = ({ rec, status, onAccept, onIgnore, onUndo }) => (
  <div className={`bg-white rounded-xl border transition-all ${
    status === 'accepted' ? 'border-emerald-200 bg-emerald-50/40'
    : status === 'ignored' ? 'border-slate-200 opacity-50'
    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
  }`}>
    <div className="p-4">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative flex-shrink-0">
          <Avatar name={rec.name} />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center">
            <AlertTriangle size={9} strokeWidth={2.5} className="text-amber-500" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 leading-snug">{rec.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{rec.subtitle}</p>
        </div>
        {status === 'accepted' && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
            <Check size={9} strokeWidth={3} /> 已接受
          </span>
        )}
        {status === 'ignored' && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            已忽略
          </span>
        )}
      </div>

      {/* Talk stats */}
      {rec.talk_pct !== undefined && (
        <div className="flex items-center gap-4 mb-3 px-1">
          <div className="text-center">
            <p className="text-[16px] font-semibold text-slate-700 tabular-nums leading-none">{rec.talk_pct}%</p>
            <p className="text-[10px] text-slate-400 mt-0.5">說話比例</p>
          </div>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(rec.talk_pct, 100)}%`, background: rec.talk_pct < 5 ? '#f87171' : '#10b981' }} />
          </div>
          <div className="text-center">
            <p className="text-[16px] font-semibold text-slate-700 tabular-nums leading-none">{rec.turns ?? '--'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">發言次</p>
          </div>
        </div>
      )}

      {/* Reason bullets */}
      <p className="text-[11px] text-slate-400 mb-1.5">更多詳情</p>
      <ul className="space-y-1.5 mb-4">
        {rec.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="text-[12px] text-slate-600 leading-snug">{r}</span>
          </li>
        ))}
      </ul>

      {/* Actions */}
      {status === 'new' ? (
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: '#10b981' }}
          >
            <CheckCircle size={11} strokeWidth={2.5} /> 接受
          </button>
          <button
            onClick={onIgnore}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
          >
            <XCircle size={11} strokeWidth={2.5} /> 忽略
          </button>
        </div>
      ) : (
        <button
          onClick={onUndo}
          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          撤銷
        </button>
      )}
    </div>
  </div>
);

// ── Main page ──────────────────────────────────────────────────
const RecommendationsPage: React.FC = () => {
  const { getToken } = useAuth();
  const backendUrl   = process.env.REACT_APP_BACKEND_URL || '';

  const [meetings,    setMeetings]    = useState<MeetingWithRecs[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [useMock,     setUseMock]     = useState(false);
  const [selectedId,  setSelectedId]  = useState('');
  const [panelTab,    setPanelTab]    = useState<PanelTab>('new');

  // Per-rec status: undefined=new, 'accepted', 'ignored'
  const [statuses, setStatuses] = useState<Record<string, 'accepted' | 'ignored'>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');
      const res = await fetch(`${backendUrl}/api/analytics/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('api');
      const json = await res.json();
      const d = json.data ?? json;
      const list: MeetingWithRecs[] = d.meetings ?? [];
      if (!list.length) { setMeetings(MOCK); setUseMock(true); setSelectedId(MOCK[0]?.id ?? ''); }
      else              { setMeetings(list); setUseMock(false); setSelectedId(list[0]?.id ?? ''); }
    } catch {
      setMeetings(MOCK); setUseMock(true); setSelectedId(MOCK[0]?.id ?? '');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const accept = useCallback((id: string) => setStatuses(s => ({ ...s, [id]: 'accepted' })), []);
  const ignore = useCallback((id: string) => setStatuses(s => ({ ...s, [id]: 'ignored' })),  []);
  const undo   = useCallback((id: string) => setStatuses(s => { const n = { ...s }; delete n[id]; return n; }), []);

  const acceptAll = useCallback((meetingRecs: Recommendation[]) => {
    setStatuses(s => {
      const n = { ...s };
      meetingRecs.forEach(r => { if (!n[r.id]) n[r.id] = 'accepted'; });
      return n;
    });
  }, []);

  const selectedMeeting = useMemo(() => meetings.find(m => m.id === selectedId), [meetings, selectedId]);

  // Global stats
  const allRecs = useMemo(() => meetings.flatMap(m => m.recommendations), [meetings]);
  const totalNew      = allRecs.filter(r => !statuses[r.id]).length;
  const totalAccepted = allRecs.filter(r => statuses[r.id] === 'accepted').length;
  const totalIgnored  = allRecs.filter(r => statuses[r.id] === 'ignored').length;

  // Left-panel badge: remaining new recs per meeting
  const newCountFor = useCallback((m: MeetingWithRecs) =>
    m.recommendations.filter(r => !statuses[r.id]).length,
  [statuses]);

  // Right-panel filtered recs
  const displayRecs = useMemo(() => {
    if (!selectedMeeting) return [];
    return selectedMeeting.recommendations.filter(r =>
      panelTab === 'new' ? !statuses[r.id] : !!statuses[r.id]
    );
  }, [selectedMeeting, statuses, panelTab]);

  const reviewedCount = selectedMeeting?.recommendations.filter(r => !!statuses[r.id]).length ?? 0;
  const newCount      = selectedMeeting?.recommendations.filter(r => !statuses[r.id]).length ?? 0;

  return (
    <div className="min-h-full" style={{ background: '#F1F5F9' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight mb-1">推薦</h1>
          <p className="text-[13px] text-slate-500">
            AI 建議優化會議出席名單，減少不必要的打擾
            {useMock && (
              <span className="ml-2 inline-flex items-center text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
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

      {/* Summary stat bar */}
      {!loading && (
        <div className="flex items-center gap-6 mb-5 px-4 py-3 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center gap-2">
            <ThumbsUp size={14} strokeWidth={1.75} className="text-amber-500" />
            <div>
              <p className="text-[18px] font-semibold text-slate-900 tabular-nums leading-none">{totalNew}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">待處理</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2">
            <CheckCircle size={14} strokeWidth={1.75} className="text-emerald-500" />
            <div>
              <p className="text-[18px] font-semibold text-slate-900 tabular-nums leading-none">{totalAccepted}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">已接受</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2">
            <XCircle size={14} strokeWidth={1.75} className="text-slate-400" />
            <div>
              <p className="text-[18px] font-semibold text-slate-900 tabular-nums leading-none">{totalIgnored}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">已忽略</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2">
            <Users size={14} strokeWidth={1.75} className="text-slate-400" />
            <div>
              <p className="text-[18px] font-semibold text-slate-900 tabular-nums leading-none">{meetings.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">場會議</p>
            </div>
          </div>
          {totalNew > 0 && (
            <button
              onClick={() => meetings.forEach(m => acceptAll(m.recommendations))}
              className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#10b981' }}
            >
              <Check size={13} strokeWidth={2.5} />
              全部接受
            </button>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-4" style={{ minHeight: 560 }}>
        {/* Left: meeting list */}
        <div className="w-72 flex-shrink-0 flex flex-col">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Users size={13} strokeWidth={1.75} className="text-slate-400" />
              <p className="text-[12px] font-semibold text-slate-600">近期會議</p>
              {!loading && <span className="ml-auto text-[11px] text-slate-400">{meetings.length} 場</span>}
            </div>

            {loading ? (
              <div className="p-4 space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="space-y-2">
                    <Skel h={13} w="75%" />
                    <Skel h={11} w="55%" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {meetings.map(m => {
                  const pending = newCountFor(m);
                  const isSelected = m.id === selectedId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedId(m.id); setPanelTab('new'); }}
                      className={`w-full text-left px-4 py-3.5 border-b border-slate-50 last:border-0 transition-colors ${
                        isSelected
                          ? 'bg-[#00D4FF]/5 border-l-2 border-l-[#00D4FF]'
                          : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[12px] font-medium leading-snug truncate ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                          {m.title}
                        </p>
                        {pending > 0 && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[10px] font-semibold text-white"
                                style={{ background: '#f59e0b' }}>
                            <ThumbsUp size={8} strokeWidth={2.5} />
                            {pending}
                          </span>
                        )}
                        {pending === 0 && m.recommendations.length > 0 && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 h-4 px-1.5 rounded-full text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200">
                            <Check size={8} strokeWidth={3} />
                            完成
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={9} strokeWidth={2} />
                        {m.date}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: recommendation cards */}
        <div className="flex-1 min-w-0 flex flex-col">
          {loading ? (
            <div className="space-y-4">
              {[1,2].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skel h={13} w="60%" /><Skel h={11} w="40%" />
                    </div>
                  </div>
                  <Skel h={11} /><Skel h={11} w="75%" />
                  <div className="flex gap-2 pt-1"><Skel h={28} w="64px" /><Skel h={28} w="64px" /></div>
                </div>
              ))}
            </div>
          ) : !selectedMeeting ? null : (
            <>
              {/* Sub-tabs */}
              <div className="flex items-center gap-0 border-b border-slate-200 mb-4">
                {([
                  { id: 'new'      as PanelTab, label: '新',   count: newCount },
                  { id: 'reviewed' as PanelTab, label: '已審核', count: reviewedCount },
                ]).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPanelTab(t.id)}
                    className={`flex items-center gap-1.5 px-1 pb-2.5 mr-5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                      panelTab === t.id
                        ? 'border-[#00D4FF] text-[#00D4FF]'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-semibold ${
                        panelTab === t.id ? 'bg-[#00D4FF] text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}

                {/* Accept all (for new tab) */}
                {panelTab === 'new' && newCount > 0 && (
                  <button
                    onClick={() => acceptAll(selectedMeeting.recommendations)}
                    className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium text-white mb-2 transition-opacity hover:opacity-90"
                    style={{ background: '#10b981' }}
                  >
                    <Check size={11} strokeWidth={2.5} /> 全部接受
                  </button>
                )}
              </div>

              {/* Cards */}
              {displayRecs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    {panelTab === 'new'
                      ? <CheckCircle size={24} strokeWidth={1.5} className="text-emerald-300" />
                      : <User size={24} strokeWidth={1.5} className="text-slate-300" />}
                  </div>
                  <p className="text-[14px] font-medium text-slate-500 mb-1">
                    {panelTab === 'new' ? '此會議已全部處理完畢' : '尚無已審核的推薦'}
                  </p>
                  <p className="text-[12px] text-slate-400">
                    {panelTab === 'new' ? '切換至「已審核」分頁查看記錄' : '接受或忽略推薦後將顯示於此'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto">
                  {displayRecs.map(rec => (
                    <RecCard
                      key={rec.id}
                      rec={rec}
                      status={statuses[rec.id] ?? 'new'}
                      onAccept={() => accept(rec.id)}
                      onIgnore={() => ignore(rec.id)}
                      onUndo={()   => undo(rec.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default RecommendationsPage;
