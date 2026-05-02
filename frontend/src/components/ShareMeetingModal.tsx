import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Mail, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ShareEntry {
  id: string;
  memberEmail: string | null;
  memberName: string | null;
  permission: string;
  sharedAt: string | null;
}

interface Props {
  meetingId: string;
  onClose: () => void;
}

const API = process.env.REACT_APP_BACKEND_URL || '';

const ShareMeetingModal: React.FC<Props> = ({ meetingId, onClose }) => {
  const { getToken } = useAuth();
  const [shareUrl, setShareUrl] = useState('');
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [loadingShares, setLoadingShares] = useState(true);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const fetchShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/share/${meetingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setShares(data.data ?? data);
      }
    } catch {
      // non-critical
    } finally {
      setLoadingShares(false);
    }
  }, [getToken, meetingId]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  const generateLink = async () => {
    setLoadingUrl(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId, permission: 'view' }),
      });
      if (res.ok) {
        const data = await res.json();
        const payload = data.data ?? data;
        setShareUrl(`${window.location.origin}/shared/${payload.shareToken}`);
        await fetchShares();
      }
    } catch {
      setError('產生連結失敗');
    } finally {
      setLoadingUrl(false);
    }
  };

  const inviteMember = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('請輸入有效的電子郵件地址');
      return;
    }
    setInviting(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId, permission, memberEmail: email.trim() }),
      });
      if (res.ok) {
        setEmail('');
        await fetchShares();
      } else {
        setError('邀請失敗，請稍後再試');
      }
    } catch {
      setError('邀請失敗');
    } finally {
      setInviting(false);
    }
  };

  const removeShare = async (memberEmail: string) => {
    try {
      const token = await getToken();
      await fetch(`${API}/api/share/${meetingId}/${encodeURIComponent(memberEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setShares(prev => prev.filter(s => s.memberEmail !== memberEmail));
    } catch {
      setError('移除失敗');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">分享會議記錄</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-[12px] rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')}><X size={12} /></button>
            </div>
          )}

          {/* Public link section */}
          <div>
            <p className="text-[12px] font-medium text-slate-700 mb-2">公開分享連結</p>
            <p className="text-[11px] text-slate-400 mb-3">任何擁有連結的人皆可檢視此會議記錄</p>
            {!shareUrl ? (
              <button
                onClick={generateLink}
                disabled={loadingUrl}
                className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {loadingUrl ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingUrl ? '產生中...' : '產生分享連結'}
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 h-9 px-3 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                />
                <button
                  onClick={copyLink}
                  className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors flex-shrink-0"
                  style={{ background: '#00D4FF', color: '#0A0E27' }}
                >
                  {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.75} />}
                  {copied ? '已複製' : '複製'}
                </button>
              </div>
            )}
          </div>

          {/* Invite by email */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[12px] font-medium text-slate-700 mb-3 flex items-center gap-1.5">
              <UserPlus size={13} strokeWidth={1.75} className="text-slate-400" />
              邀請協作者
            </p>
            <div className="flex gap-2">
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') inviteMember(); }}
                placeholder="輸入電子郵件地址"
                type="email"
                className="flex-1 h-8 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
              />
              <select
                value={permission}
                onChange={e => setPermission(e.target.value as 'view' | 'edit')}
                className="h-8 px-2 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 bg-white"
              >
                <option value="view">檢視</option>
                <option value="edit">編輯</option>
              </select>
              <button
                onClick={inviteMember}
                disabled={inviting || !email.trim()}
                className="h-8 px-3 flex items-center gap-1 rounded-lg text-[12px] font-semibold disabled:opacity-50 transition-colors flex-shrink-0"
                style={{ background: '#00D4FF', color: '#0A0E27' }}
              >
                {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} strokeWidth={1.75} />}
                邀請
              </button>
            </div>
          </div>

          {/* Existing shares list */}
          {(shares.length > 0 || loadingShares) && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[12px] font-medium text-slate-700 mb-3">已分享對象</p>
              {loadingShares ? (
                <div className="flex justify-center py-3">
                  <Loader2 size={16} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {shares.map(s => (
                    <div key={s.id} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {(s.memberEmail?.[0] ?? '?').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-slate-700 truncate">{s.memberEmail ?? '匿名'}</p>
                        {s.memberName && (
                          <p className="text-[10px] text-slate-400 truncate">{s.memberName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Shield size={9} strokeWidth={1.75} />
                          {s.permission === 'edit' ? '編輯' : '檢視'}
                        </span>
                        {s.memberEmail && (
                          <button
                            onClick={() => removeShare(s.memberEmail!)}
                            className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                          >
                            <Trash2 size={12} strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-semibold rounded-lg transition-colors"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareMeetingModal;
