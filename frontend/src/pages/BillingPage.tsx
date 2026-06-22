import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Download, CheckCircle2, Clock,
  Users, Mic, Building2, ChevronRight, AlertCircle,
  RefreshCw, Plus, ArrowUpRight, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  Button, Card, Badge, Input, Field, EmptyState, Skeleton, Spinner, Modal, IconButton,
} from '../components/ui';

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
const CardHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
    <p className="text-sm font-semibold text-stone-900">{title}</p>
    {action}
  </div>
);

const StatusChip: React.FC<{ status: Invoice['status'] }> = ({ status }) => {
  const map = {
    paid:    { label: '已付款', tone: 'success' as const, icon: <CheckCircle2 size={11} strokeWidth={1.75} /> },
    pending: { label: '待付款', tone: 'warning' as const, icon: <Clock size={11} strokeWidth={1.75} /> },
    failed:  { label: '失敗',   tone: 'error'   as const, icon: <AlertCircle size={11} strokeWidth={1.75} /> },
  };
  const { label, tone, icon } = map[status];
  return <Badge tone={tone}>{icon}{label}</Badge>;
};

const UsageBar: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden bg-stone-100 mt-2">
      <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
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
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-3">
            <Building2 size={12} strokeWidth={1.75} />
            <button onClick={() => navigate('/workspace-admin')} className="hover:text-stone-600 transition-colors">管理工作區</button>
            <ChevronRight size={11} strokeWidth={1.75} />
            <span>計劃和賬單</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-stone-900">計劃和賬單</h1>
              <Badge tone="neutral">預覽</Badge>
            </div>
            <div className="flex items-center gap-2">
              {isMock && <Badge tone="warning">預覽模式</Badge>}
              <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}
                icon={<RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />}>
                重新整理
              </Button>
            </div>
          </div>
        </div>

        {/* ── Top 2-col grid ── */}
        <div className="grid grid-cols-2 gap-5 mb-5">

          {/* 當前計劃 */}
          <Card>
            <CardHeader title="當前計劃"
              action={<button onClick={() => { setShowUpgrade(true); setUpgradeSuccess(false); }}
                className="flex items-center gap-1 text-xs text-teal-700 font-medium hover:text-teal-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 rounded">
                比較計劃 <ArrowUpRight size={12} strokeWidth={1.75} />
              </button>}
            />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-6 w-24" /><Skeleton className="h-4 w-40" /></div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xl font-bold text-stone-900">{p.planName}</span>
                    <Badge tone="neutral">每月</Badge>
                  </div>
                  {p.nextInvoice && (
                    <p className="text-xs text-stone-600 mb-4">
                      下一張發票 {p.nextInvoice} · (US${p.nextAmount.toFixed(2)})
                    </p>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Button variant="primary" size="sm" onClick={() => { setShowUpgrade(true); setUpgradeSuccess(false); }}>
                      更改計劃
                    </Button>
                    <Button variant="secondary" size="sm" disabled title="即將推出">
                      取消計劃（即將推出）
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* 許可使用情況 */}
          <Card>
            <CardHeader title="許可使用情況"
              action={<button disabled title="即將推出"
                className="flex items-center gap-1 text-xs text-stone-400 font-medium opacity-60 cursor-not-allowed">
                管理人員 <ArrowUpRight size={12} strokeWidth={1.75} />
              </button>}
            />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-2 w-full" /></div>
              ) : (
                <>
                  <p className="text-sm text-stone-700 mb-2">
                    {p.seatsUsed} 個 {p.seatsTotal} 許可證已被使用
                  </p>
                  <UsageBar used={p.seatsUsed} total={p.seatsTotal} />
                  <Button variant="primary" size="sm" className="mt-4"
                    onClick={() => { setShowAddSeats(true); setSeatsInput(String(p.seatsTotal)); setSeatsError(''); }}
                    icon={<Plus size={14} strokeWidth={1.75} />}>
                    添加許可證
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* 文件上傳額度 */}
          <Card>
            <CardHeader title="文件上傳額度" />
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-2 w-full" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-stone-400 mb-1">
                        <Mic size={11} strokeWidth={1.75} /> 每月積分
                      </div>
                      <p className="text-xl font-bold text-stone-900">{p.uploadTotalMin} 分鐘</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-stone-400 mb-1">
                        <Users size={11} strokeWidth={1.75} /> 已購買積分
                      </div>
                      <p className="text-xl font-bold text-stone-900">{p.uploadUsedMin} 分鐘</p>
                    </div>
                  </div>
                  <UsageBar used={p.uploadUsedMin} total={p.uploadTotalMin} />
                  <Button variant="secondary" size="sm" className="mt-4" disabled title="即將推出">
                    購買文件上傳額度（即將推出）
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* 付款方式 */}
          <Card>
            <CardHeader title="付款方式" />
            <div className="px-5 py-4">
              {loading ? (
                <Skeleton className="h-14 w-full" />
              ) : p.cardLast4 ? (
                <div className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg border border-stone-200">
                  <div className="flex items-center gap-3">
                    <CreditCard size={20} strokeWidth={1.75} className="text-stone-400" />
                    <div>
                      <p className="text-sm font-medium text-stone-900 flex items-center">
                        {p.cardBrand} 以 {p.cardLast4} 結束
                        <span className="ml-2"><Badge tone="neutral">默認</Badge></span>
                      </p>
                      <p className="text-xs text-stone-600">過期時間 2031/7</p>
                    </div>
                  </div>
                  <IconButton aria-label="移除付款方式（即將推出）" disabled title="即將推出">
                    <X size={14} strokeWidth={1.75} />
                  </IconButton>
                </div>
              ) : (
                <div className="px-4 py-3 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                  <p className="text-xs text-stone-600 text-center">尚未綁定付款方式</p>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <Button variant="primary" size="sm" disabled title="即將推出">
                  更新支付方式（即將推出）
                </Button>
                <Button variant="secondary" size="sm" disabled title="即將推出">
                  管理稅號（即將推出）
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Billing history ── */}
        <Card>
          <CardHeader title="賬單歷史" />
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <EmptyState icon={<CreditCard size={28} strokeWidth={1.75} />} title="尚無賬單記錄" />
          ) : (
            <>
              <div className="grid px-5 py-2.5 bg-stone-50 border-b border-stone-100 text-xs font-medium text-stone-500 uppercase tracking-wider"
                style={{ gridTemplateColumns: '120px 1fr 60px 1fr 80px 90px 32px' }}>
                <span>發票日期</span><span>描述</span><span>數量</span>
                <span>計費周期</span><span className="text-right">發票金額</span>
                <span className="text-center">狀態</span><span />
              </div>
              {invoices.map((inv, i) => (
                <div key={inv.id}
                  className={`grid items-center px-5 py-3.5 hover:bg-stone-50 transition-colors ${i < invoices.length - 1 ? 'border-b border-stone-100' : ''}`}
                  style={{ gridTemplateColumns: '120px 1fr 60px 1fr 80px 90px 32px' }}>
                  <span className="text-xs text-stone-600">{inv.date}</span>
                  <span className="text-sm text-stone-900 font-medium">{inv.description}</span>
                  <span className="text-xs text-stone-600">{inv.qty}</span>
                  <span className="text-xs text-stone-600">{inv.period}</span>
                  <span className="text-sm font-semibold text-stone-900 text-right">US${inv.amount.toFixed(2)}</span>
                  <div className="flex justify-center"><StatusChip status={inv.status} /></div>
                  <button onClick={() => handleDownload(inv)} disabled={downloadingId === inv.id}
                    aria-label={`下載發票 ${inv.id}`}
                    className="flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 rounded"
                    title="下載發票">
                    {downloadingId === inv.id
                      ? <Spinner size={14} />
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
        <Modal onClose={() => setShowAddSeats(false)} labelledBy="add-seats-title" maxWidth="max-w-sm" className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 id="add-seats-title" className="text-base font-bold text-stone-900">調整許可席位</h3>
            <IconButton aria-label="關閉" onClick={() => setShowAddSeats(false)}>
              <X size={18} strokeWidth={1.75} />
            </IconButton>
          </div>
          <p className="text-xs text-stone-600 mb-4">
            目前方案每人每月 US${p.pricePerSeat}，調整後費用即時生效。
          </p>
          <Field label="席位數量" htmlFor="seats-input"
            error={seatsError || undefined}
            helper={
              !seatsError && seatsInput && !isNaN(parseInt(seatsInput)) && parseInt(seatsInput) > 0
                ? `每月費用：US$${(p.pricePerSeat * parseInt(seatsInput)).toFixed(2)}`
                : undefined
            }
            className="mb-4">
            <Input id="seats-input" type="number" min={1} value={seatsInput}
              onChange={e => { setSeatsInput(e.target.value); setSeatsError(''); }}
            />
          </Field>
          <div className="flex gap-3">
            <Button variant="primary" className="flex-1" onClick={handleAddSeats} loading={seatsLoading}>
              確認更新
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setShowAddSeats(false)}>
              取消
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Upgrade modal ── */}
      {showUpgrade && (
        <Modal onClose={() => { setShowUpgrade(false); setUpgradeSuccess(false); }} labelledBy="upgrade-title" maxWidth="max-w-md" className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 id="upgrade-title" className="text-base font-bold text-stone-900">比較計劃</h3>
            <IconButton aria-label="關閉" onClick={() => setShowUpgrade(false)}>
              <X size={18} strokeWidth={1.75} />
            </IconButton>
          </div>
          {[
            { name: '個人版', price: 'US$9.75/月', desc: '300 分鐘/月 · 1 席位', highlight: false },
            { name: '專業版', price: 'US$19.75/月', desc: '600 分鐘/月 · 最多 3 席位', highlight: false },
            { name: '企業版', price: 'US$29.75/人/月', desc: '無限上傳 · 優先支援 · SLA', highlight: true },
          ].map(plan => (
            <div key={plan.name}
              className={`flex items-center justify-between p-4 rounded-xl mb-3 border ${
                plan.highlight ? 'bg-teal-50 border-teal-200' : 'bg-stone-50 border-stone-200'
              }`}>
              <div>
                <p className={`text-sm font-semibold ${plan.highlight ? 'text-teal-700' : 'text-stone-900'}`}>{plan.name}</p>
                <p className="text-xs text-stone-600 mt-0.5">{plan.desc}</p>
              </div>
              <span className={`text-sm font-semibold whitespace-nowrap ml-4 ${plan.highlight ? 'text-teal-700' : 'text-stone-700'}`}>{plan.price}</span>
            </div>
          ))}
          {upgradeSuccess ? (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4 bg-green-50 border border-green-200">
              <CheckCircle2 size={15} strokeWidth={1.75} className="text-green-600 shrink-0" />
              <p className="text-xs text-green-700">已收到您的需求，業務將於 1 個工作天內與您聯絡。</p>
            </div>
          ) : null}
          <div className="flex gap-3 mt-2">
            {!upgradeSuccess && (
              <Button variant="primary" className="flex-1" onClick={handleUpgradeInquiry} loading={upgradeLoading}>
                聯絡業務
              </Button>
            )}
            <Button variant="secondary" className="flex-1" onClick={() => { setShowUpgrade(false); setUpgradeSuccess(false); }}>
              {upgradeSuccess ? '關閉' : '取消'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BillingPage;
