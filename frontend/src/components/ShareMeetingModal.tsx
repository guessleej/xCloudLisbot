import React, { useCallback, useEffect, useState } from 'react';
import { Users, Link2, X, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ShareMember, SharePermission } from '../types';

interface ShareMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
}

const ShareMeetingModal: React.FC<ShareMeetingModalProps> = ({
  isOpen, onClose, meetingId, meetingTitle,
}) => {
  const { getToken } = useAuth();
  const [members, setMembers] = useState<ShareMember[]>([]);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL!;

  const fetchShares = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/meetings/${meetingId}/share`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [meetingId, backendUrl, getToken]);

  useEffect(() => {
    if (isOpen && meetingId) {
      fetchShares();
      // Auto-enable public share and get token
      getToken().then(token => {
        if (!token) return;
        // First check if already public
        fetch(`${backendUrl}/api/meetings/${meetingId}/share/public`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data?.isPublic && data.shareToken) {
            setShareToken(data.shareToken);
          } else {
            // Auto-enable public share
            fetch(`${backendUrl}/api/meetings/${meetingId}/share/public`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.ok ? r.json() : null).then(newData => {
              if (newData?.shareToken) setShareToken(newData.shareToken);
            }).catch(() => {});
          }
        }).catch(() => {});
      });
    }
  }, [isOpen, meetingId]);

  const handleShare = async () => {
    if (!email.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('請輸入有效的 Email 地址');
      return;
    }
    setError('');
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/meetings/${meetingId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), permission, message }),
      });
      if (res.ok) {
        setEmail('');
        setMessage('');
        setShareSuccess('已分享，通知郵件已發送');
        setTimeout(() => setShareSuccess(''), 4000);
        await fetchShares();
      } else {
        const data = await res.json();
        setError(data.error || '分享失敗');
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    }
    setSending(false);
  };

  const revokeShare = async (memberEmail: string) => {
    if (!window.confirm(`確定撤銷 ${memberEmail} 的存取權限？`)) return;
    const token = await getToken();
    await fetch(`${backendUrl}/api/meetings/${meetingId}/share/${encodeURIComponent(memberEmail)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchShares();
  };

  const copyPublicLink = async () => {
    if (!shareToken) return;
    const link = `${window.location.origin}/shared/${shareToken}`;
    await navigator.clipboard.writeText(link);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const PERMISSION_LABELS: Record<SharePermission, { label: string; desc: string; color: string }> = {
    view:  { label: '檢視者', desc: '可查看逐字稿和摘要', color: 'text-stone-600 bg-stone-100 border border-stone-200' },
    edit:  { label: '編輯者', desc: '可修改標題和備注',   color: 'text-teal-700 bg-teal-50 border border-teal-100' },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-stone-900/40 fade-in">
      <div className="bg-white rounded-t-lg sm:rounded-lg border border-stone-200 w-full sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="text-stone-500" />
              <h2 className="text-base font-semibold text-stone-900">分享會議記錄</h2>
            </div>
            <p className="text-xs text-stone-500 mt-0.5 ml-6 truncate">{meetingTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-900 transition-colors min-h-0 min-w-0"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Invite form */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2 uppercase tracking-wide">邀請協作者</label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="輸入 Email 地址"
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                className="flex-1 h-9 px-3 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-stone-500 transition-colors"
              />
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
                className="h-9 px-3 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-stone-500 transition-colors"
              >
                <option value="view">檢視</option>
                <option value="edit">編輯</option>
              </select>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="邀請訊息（選填）"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md resize-none focus:outline-none focus:border-stone-500 transition-colors mb-2"
            />
            {shareSuccess && (
              <p className="text-xs text-teal-700 mb-2 bg-teal-50 border border-teal-100 px-3 py-2 rounded-md inline-flex items-center gap-1.5 w-full">
                <Check size={12} strokeWidth={2} />
                {shareSuccess}
              </p>
            )}
            {error && <p className="text-xs text-red-700 mb-2">{error}</p>}
            <button
              onClick={handleShare}
              disabled={!email.trim() || sending}
              className="w-full h-10 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-800 disabled:bg-stone-300 transition-colors min-h-0"
            >
              {sending ? '傳送中...' : '傳送邀請'}
            </button>
          </div>

          {/* Public share link */}
          {shareToken && (
            <div className="p-4 bg-stone-50 rounded-md border border-stone-200 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 size={14} strokeWidth={1.75} className="text-stone-500" />
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide">公開連結</p>
              </div>
              <p className="text-xs text-stone-500">任何人透過此連結都能查看會議記錄（不需登入）</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/shared/${shareToken}`}
                  className="flex-1 h-8 px-2.5 text-xs bg-white border border-stone-300 rounded-md text-stone-600 truncate"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={copyPublicLink}
                  className={`h-8 px-3 text-xs font-medium rounded-md transition-colors flex-shrink-0 min-h-0 min-w-0 ${
                    copyDone
                      ? 'bg-teal-600 text-white'
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                  }`}
                >
                  {copyDone ? '已複製' : '複製'}
                </button>
              </div>
            </div>
          )}

          {/* Current members */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2 uppercase tracking-wide">
              已分享對象
              {members.length > 0 && <span className="ml-1 text-stone-500 font-normal">({members.length})</span>}
            </label>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-3">尚未分享給任何人</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.email} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-stone-50">
                    <div className="w-7 h-7 bg-stone-200 text-stone-700 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {(m.name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{m.name || m.email}</p>
                      {m.name && <p className="text-xs text-stone-500 truncate">{m.email}</p>}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PERMISSION_LABELS[m.permission].color}`}>
                      {PERMISSION_LABELS[m.permission].label}
                    </span>
                    <button
                      onClick={() => revokeShare(m.email)}
                      className="text-stone-400 hover:text-red-700 transition-colors flex-shrink-0 min-h-0 min-w-0"
                      title="撤銷存取"
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            被邀請者將收到 Email 通知，點擊連結即可直接查看（不需登入）。
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareMeetingModal;
