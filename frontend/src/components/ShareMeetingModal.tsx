import React, { useCallback, useEffect, useState } from 'react';
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
  const [copyDone, setCopyDone] = useState(false);

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
    if (isOpen && meetingId) fetchShares();
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

  const copyLink = async () => {
    const link = `${window.location.origin}/meeting/${meetingId}`;
    await navigator.clipboard.writeText(link);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const PERMISSION_LABELS: Record<SharePermission, { label: string; desc: string; color: string }> = {
    view:  { label: '檢視者', desc: '可查看逐字稿和摘要', color: 'text-blue-600 bg-blue-50' },
    edit:  { label: '編輯者', desc: '可修改標題和備注',   color: 'text-indigo-600 bg-indigo-50' },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h2 className="text-lg font-bold text-gray-800">分享會議記錄</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 ml-7 truncate max-w-xs">{meetingTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Invite form */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">邀請協作者</label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="輸入 Email 地址"
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
            />
            {error && <p className="text-xs text-red-500 mb-2">⚠️ {error}</p>}
            <button
              onClick={handleShare}
              disabled={!email.trim() || sending}
              className="w-full py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              {sending ? '傳送中...' : '傳送邀請'}
            </button>
          </div>

          {/* Copy link */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-gray-400 text-sm flex-1 truncate">
              🔗 連結共享（需有帳號才能存取）
            </span>
            <button
              onClick={copyLink}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                copyDone ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
              }`}
            >
              {copyDone ? '✓ 已複製' : '複製連結'}
            </button>
          </div>

          {/* Current members */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              已分享對象
              {members.length > 0 && <span className="ml-1 text-gray-400 font-normal">({members.length})</span>}
            </label>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">尚未分享給任何人</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.email} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(m.name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name || m.email}</p>
                      {m.name && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERMISSION_LABELS[m.permission].color}`}>
                      {PERMISSION_LABELS[m.permission].label}
                    </span>
                    <button
                      onClick={() => revokeShare(m.email)}
                      className="text-gray-300 hover:text-red-400 text-sm transition flex-shrink-0"
                      title="撤銷存取"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            被邀請者將收到 Email 通知，需使用相同 Email 登入才能存取。
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareMeetingModal;
