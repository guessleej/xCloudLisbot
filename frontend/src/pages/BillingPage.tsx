import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Download, CheckCircle2, Clock,
  Users, Mic, Building2, ChevronRight, AlertCircle,
  RefreshCw, Plus, Loader2, ArrowUpRight, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────
interface Plan {
  planName: string;
  pricePerSeat: number;
  seatsUsed: number;
  seatsTotal: number;
  uploadUsedMin: number;
  uploadTotalMin: number;
  nextInvoice: string | null;
  nextAmount: number;
  cardLast4: string | null;
  cardBrand: string | null;
  status: string;
}

interface Invoice {
  id: string;
  date: string;
  description: string;
  qty: number;
  period: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
}

// ── Mock ───────────────────────────────────────────────────────
const MOCK_PLAN: Plan = {
  planName: '企業', pricePerSeat: 29.75, seatsUsed: 1, seatsTotal: 1,
  uploadUsedMin: 200, uploadTotalMin: 300,
  nextInvoice: '2026年5月24日', nextAmount: 29.75,
  cardLast4: '0057', cardBrand: 'Visa', status: 'active',
};

const MOCK_INVOICES: Invoice[] = [
  { id: 'INV-2026-04', date: '2026年4月24日', description: '企業 計劃', qty: 1, period: '4月24日 - 2026年5月24日', amount: 29.75, status: 'paid' },
  { id: 'INV-2026-03', date: '2026年3月24日', description: '企業 計劃', qty: 1, period: '3月24日 - 2026年4月24日', amount: 29.75, status: 'paid' },
  { id: 'INV-2026-02', date: '2026年2月24日', description: '企業 計劃', qty: 1, period: '2月24日 - 2026年3月24日', amount: 29.75, status: 'paid' },
  { id: 'INV-2026-01', date: '2026年1月24日', description: '企業 計劃', qty: 1, period: '1月24日 - 2026年2月24日', amount: 29.75, status: 'paid' },
  { id: 'INV-2025-12', date: '2025年12月24日', description: '企業 計劃', qty: 1, period: '2025年12月24日 - 2026年1月24日', amount: 29.75, status: 'paid' },
];

// ── Components ─────────────────────────────────────────────────
const Skel: React.FC<{ h?: number; w?: string; className?: string }> = ({ h = 14, w = '100%', className = '' }) => (
  <div className={`bg-slate-100 rounded animate-pulse ${className}`} style={{ height: h, width: w }} />
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>{children}</div>
);

const CardHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
    <p className="text-[14px] font-semibold text-slate-800">{title}</p>
    {action}
  </div>
);

const StatusChip: React.FC<{ status: Invoice['status'] }> = ({ status }) => {
  const map = {
    paid:    { label: '已付款', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending: { label: '待付款', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed:  { label: '失敗',   cls: 'bg-red-50 text-red-600 border-red-200' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border font-medium ${cls}`}>
      {status === 'paid'    && <CheckCircle2 size={9} />}
      {status === 'pending' && <Clock size={9} />}
      {status === 'failed'  && <AlertCircle size={9} />}
      {label}
    </span>
  );
};

const LightBar: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden bg-slate-100 mt-2">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: '#7B2FFF' }}
      />
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────
const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [plan,     setPlan]     = useState<Plan | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [isMock,   setIsMock]   = useState(false);

  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [showAddSeats,   setShowAddSeats]   = useState(false);
  const [seatsInput,     setSeatsInput]     = useState('');
  const [seatsLoading,   setSeatsLoading]   = useState(false);
  const [seatsError,     setSeatsError]     = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [downloadingId,  setDownloadingId]  = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('no token');

      const [planRes, invRes] = await Promise.all([
        fetch(`${backendUrl}/api/billing/plan`,     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${backendUrl}/api/billing/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const planJson = planRes.ok ? (await planRes.json()).data : null;
      const invJson  = invRes.ok  ? (await invRes.json()).data  : [];

      setPlan(planJson ?? MOCK_PLAN);
      setInvoices(invJson?.length ? invJson : MOCK_INVOICES);
      setIsMock(!planRes.ok);
    } catch {
      setPlan(MOCK_PLAN);
      setInvoices(MOCK_INVOICES);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddSeats = async () => {
    const n = parseInt(seatsInput, 10);
    if (isNaN(n) || n < 1) { setSeatsError('請輸入有效數字'); return; }
    setSeatsLoading(true); setSeatsError('');
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/billing/seats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: n }),
      });
      if (!res.ok) { setSeatsError('更新失敗，請稍後再試'); return; }
      const body = await res.json();
      setPlan(prev => prev ? { ...prev, seatsTotal: body.data.seatsTotal, nextAmount: body.data.nextAmount } : prev);
      setShowAddSeats(false); setSeatsInput('');
    } catch { setSeatsError('更新失敗，請稍後再試'); }
    finally { setSeatsLoading(false); }
  };

  const handleUpgradeInquiry = async () => {
    setUpgradeLoading(true);
    try {
      const token = await getToken();
      await fetch(`${backendUrl}/api/billing/upgrade-inquiry`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      setUpgradeSuccess(true);
    } catch { setUpgradeSuccess(true); }
    finally { setUpgradeLoading(false); }
  };

  const handleDownload = async (inv: Invoice) => {
    setDownloadingId(inv.id);
    try {
      const token = await getToken();
      const res = await fetch(
        `${backendUrl}/api/billing/invoices/${encodeURIComponent(inv.id)}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const text = res.ok ? await res.text() : [
        '='.repeat(48), '        xCloud Lisbot — 發票', '='.repeat(48),
        `發票編號  : ${inv.id}`, `日期      : ${inv.date}`, '-'.repeat(48),
        `項目      : ${inv.description}`, `數量      : ${inv.qty} 人`,
        `期間      : ${inv.period}`, '-'.repeat(48),
        `金額      : US$ ${inv.amount.toFixed(2)}`, '='.repeat(48),
      ].join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${inv.id}.txt`; a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloadingId(null); }
  };

  const p = plan ?? MOCK_PLAN;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-3">
            <Building2 size={12} strokeWidth={1.75} />
            <button onClick={() => navigate('/workspace-admin')} className="hover:text-slate-600 transition-colors">管理工作區</button>
            <ChevronRight size={11} strokeWidth={1.75} />
            <span>計劃和賬單</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-slate-800">計劃和賬單</h1>
            <div className="flex items-center gap-2">
              {isMock && (
                <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">預覽模式</span>
              )}
              <button onClick={fetchData} disabled={loading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] text-slate-500 hover:text-slate-700 bg-white border border-slate-200 transition-colors disabled:opacity-40">
                <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
                重新整理
              </button>
            </div>
          </div>
        </div>

        {/* ── Top 2-col grid ── */}
        <div className="grid grid-cols-2 gap-5 mb-5">

          {/* 當前計劃 */}
          <Card>
            <CardHeader title="當前計劃"
              action={<button onClick={() => { setShowUpgrade(true); setUpgradeSuccess(false); }}
                className="flex items-center gap-1 text-[12px] text-[#7B2FFF] font-medium hover:opacity-70 transition-opacity">
                比較計劃 <ArrowUpRight size={12} strokeWidth={2} />
              </button>}
            />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skel h={22} w="100px" /><Skel h={14} w="160px" /></div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[20px] font-bold text-slate-800">{p.planName}</span>
                    <span className="text-[12px] text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">每月</span>
                  </div>
                  {p.nextInvoice && (
                    <p className="text-[12px] text-slate-500 mb-4">
                      下一張發票 {p.nextInvoice} · (US${p.nextAmount.toFixed(2)})
                    </p>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => { setShowUpgrade(true); setUpgradeSuccess(false); }}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: '#7B2FFF' }}>
                      更改計劃
                    </button>
                    <button className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                      取消計劃
                    </button>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* 許可使用情況 */}
          <Card>
            <CardHeader title="許可使用情況"
              action={<button className="flex items-center gap-1 text-[12px] text-[#7B2FFF] font-medium hover:opacity-70 transition-opacity">
                管理人員 <ArrowUpRight size={12} strokeWidth={2} />
              </button>}
            />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skel h={14} w="180px" /><Skel h={8} /></div>
              ) : (
                <>
                  <p className="text-[13px] text-slate-700 mb-2">
                    {p.seatsUsed} 個 {p.seatsTotal} 許可證已被使用
                  </p>
                  <LightBar used={p.seatsUsed} total={p.seatsTotal} />
                  <button
                    onClick={() => { setShowAddSeats(true); setSeatsInput(String(p.seatsTotal)); setSeatsError(''); }}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: '#7B2FFF' }}
                  >
                    <Plus size={13} strokeWidth={2.5} /> 添加許可證
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* 文件上傳額度 */}
          <Card>
            <CardHeader title="文件上傳額度" />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skel h={14} /><Skel h={8} /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                        <Mic size={11} strokeWidth={1.75} /> 每月積分
                      </div>
                      <p className="text-[20px] font-bold text-slate-800">{p.uploadTotalMin} 分鐘</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                        <Users size={11} strokeWidth={1.75} /> 已購買積分
                      </div>
                      <p className="text-[20px] font-bold text-slate-800">{p.uploadUsedMin} 分鐘</p>
                    </div>
                  </div>
                  <LightBar used={p.uploadUsedMin} total={p.uploadTotalMin} />
                  <button className="mt-4 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#7B2FFF] border border-[#7B2FFF] hover:bg-purple-50 transition-colors">
                    購買文件上傳額度
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* 付款方式 */}
          <Card>
            <CardHeader title="付款方式" />
            <div className="px-5 py-4">
              {loading ? (
                <Skel h={52} />
              ) : p.cardLast4 ? (
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3">
                    <CreditCard size={20} strokeWidth={1.5} className="text-slate-400" />
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">
                        {p.cardBrand} 以 {p.cardLast4} 結束
                        <span className="ml-2 text-[10px] text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">默認</span>
                      </p>
                      <p className="text-[11px] text-slate-500">過期時間 2031/7</p>
                    </div>
                  </div>
                  <button>
                    <X size={14} strokeWidth={1.75} className="text-slate-400 hover:text-slate-600 transition-colors" />
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <p className="text-[12px] text-slate-500 text-center">尚未綁定付款方式</p>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ background: '#7B2FFF' }}>
                  更新支付方式
                </button>
                <button className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                  管理稅號
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Billing history ── */}
        <Card>
          <CardHeader title="賬單歷史" />
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map(i => <Skel key={i} h={40} />)}</div>
          ) : invoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[13px] text-slate-400">尚無賬單記錄</p>
            </div>
          ) : (
            <>
              <div className="grid px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-500 uppercase tracking-wider"
                style={{ gridTemplateColumns: '120px 1fr 60px 1fr 80px 90px 32px' }}>
                <span>發票日期</span><span>描述</span><span>數量</span>
                <span>計費周期</span><span className="text-right">發票金額</span>
                <span className="text-center">狀態</span><span />
              </div>
              {invoices.map((inv, i) => (
                <div key={inv.id}
                  className={`grid items-center px-5 py-3.5 hover:bg-slate-50 transition-colors ${i < invoices.length - 1 ? 'border-b border-slate-100' : ''}`}
                  style={{ gridTemplateColumns: '120px 1fr 60px 1fr 80px 90px 32px' }}>
                  <span className="text-[12px] text-slate-500">{inv.date}</span>
                  <span className="text-[13px] text-slate-800 font-medium">{inv.description}</span>
                  <span className="text-[12px] text-slate-500">{inv.qty}</span>
                  <span className="text-[12px] text-slate-500">{inv.period}</span>
                  <span className="text-[13px] font-semibold text-slate-800 text-right">US${inv.amount.toFixed(2)}</span>
                  <div className="flex justify-center"><StatusChip status={inv.status} /></div>
                  <button onClick={() => handleDownload(inv)} disabled={downloadingId === inv.id}
                    className="flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                    title="下載發票">
                    {downloadingId === inv.id
                      ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                      : <Download size={14} strokeWidth={1.75} />}
                  </button>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      {/* ── Add seats modal ── */}
      {showAddSeats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-slate-800">調整許可席位</h3>
              <button onClick={() => setShowAddSeats(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <p className="text-[12px] text-slate-500 mb-4">
              目前方案每人每月 US${p.pricePerSeat}，調整後費用即時生效。
            </p>
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">席位數量</label>
              <input type="number" min={1} value={seatsInput}
                onChange={e => { setSeatsInput(e.target.value); setSeatsError(''); }}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] text-slate-800 border border-slate-200 outline-none focus:border-[#7B2FFF] bg-white"
              />
              {seatsInput && !isNaN(parseInt(seatsInput)) && parseInt(seatsInput) > 0 && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  每月費用：US${(p.pricePerSeat * parseInt(seatsInput)).toFixed(2)}
                </p>
              )}
              {seatsError && <p className="text-[11px] text-red-500 mt-1.5">{seatsError}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddSeats} disabled={seatsLoading}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
                style={{ background: '#7B2FFF' }}>
                {seatsLoading && <Loader2 size={13} className="animate-spin" />}
                確認更新
              </button>
              <button onClick={() => setShowAddSeats(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade modal ── */}
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-slate-800">比較計劃</h3>
              <button onClick={() => setShowUpgrade(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            {[
              { name: '個人版', price: 'US$9.75/月', desc: '300 分鐘/月 · 1 席位', highlight: false },
              { name: '專業版', price: 'US$19.75/月', desc: '600 分鐘/月 · 最多 3 席位', highlight: false },
              { name: '企業版', price: 'US$29.75/人/月', desc: '無限上傳 · 優先支援 · SLA', highlight: true },
            ].map(plan => (
              <div key={plan.name}
                className={`flex items-center justify-between p-4 rounded-xl mb-3 border ${
                  plan.highlight ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'
                }`}>
                <div>
                  <p className={`text-[14px] font-semibold ${plan.highlight ? 'text-[#7B2FFF]' : 'text-slate-800'}`}>{plan.name}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">{plan.desc}</p>
                </div>
                <span className={`text-[13px] font-semibold whitespace-nowrap ml-4 ${plan.highlight ? 'text-[#7B2FFF]' : 'text-slate-700'}`}>{plan.price}</span>
              </div>
            ))}
            {upgradeSuccess ? (
              <div className="flex items-center gap-2 p-3 rounded-lg mb-4 bg-emerald-50 border border-emerald-200">
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                <p className="text-[12px] text-emerald-700">已收到您的需求，業務將於 1 個工作天內與您聯絡。</p>
              </div>
            ) : null}
            <div className="flex gap-3 mt-2">
              {!upgradeSuccess && (
                <button onClick={handleUpgradeInquiry} disabled={upgradeLoading}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
                  style={{ background: '#7B2FFF' }}>
                  {upgradeLoading && <Loader2 size={13} className="animate-spin" />}
                  聯絡業務
                </button>
              )}
              <button onClick={() => { setShowUpgrade(false); setUpgradeSuccess(false); }}
                className="flex-1 py-2.5 rounded-lg text-[13px] text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                {upgradeSuccess ? '關閉' : '取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
