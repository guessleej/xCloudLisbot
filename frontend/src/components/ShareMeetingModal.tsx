import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Mail, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Modal, Button, Input, Select, IconButton, Spinner } from './ui';

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
    <Modal onClose={onClose} labelledBy="share-title" maxWidth="max-w-md" className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 id="share-title" className="text-base font-semibold text-stone-900">分享會議記錄</h2>
          <IconButton onClick={onClose} aria-label="關閉">
            <X size={18} strokeWidth={1.75} />
          </IconButton>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="關閉錯誤訊息"><X size={12} strokeWidth={1.75} /></button>
            </div>
          )}

          {/* Public link section */}
          <div>
            <p className="text-xs font-medium text-stone-700 mb-2">公開分享連結</p>
            <p className="text-xs text-stone-400 mb-3">任何擁有連結的人皆可檢視此會議記錄</p>
            {!shareUrl ? (
              <Button
                variant="secondary"
                onClick={generateLink}
                disabled={loadingUrl}
                loading={loadingUrl}
                className="w-full"
              >
                {loadingUrl ? '產生中...' : '產生分享連結'}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-stone-50"
                />
                <Button
                  onClick={copyLink}
                  icon={copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
                  className="flex-shrink-0"
                >
                  {copied ? '已複製' : '複製'}
                </Button>
              </div>
            )}
          </div>

          {/* Invite by email */}
          <div className="border-t border-stone-200 pt-4">
            <p className="text-xs font-medium text-stone-700 mb-3 flex items-center gap-1.5">
              <UserPlus size={13} strokeWidth={1.75} className="text-stone-400" />
              邀請協作者
            </p>
            <div className="flex gap-2">
              <Input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') inviteMember(); }}
                placeholder="輸入電子郵件地址"
                type="email"
                className="flex-1 h-8"
              />
              <Select
                value={permission}
                onChange={e => setPermission(e.target.value as 'view' | 'edit')}
                aria-label="權限"
                className="h-8 w-auto"
              >
                <option value="view">檢視</option>
                <option value="edit">編輯</option>
              </Select>
              <Button
                size="sm"
                onClick={inviteMember}
                disabled={inviting || !email.trim()}
                loading={inviting}
                icon={<Mail size={13} strokeWidth={1.75} />}
                className="flex-shrink-0"
              >
                邀請
              </Button>
            </div>
          </div>

          {/* Existing shares list */}
          {(shares.length > 0 || loadingShares) && (
            <div className="border-t border-stone-200 pt-4">
              <p className="text-xs font-medium text-stone-700 mb-3">已分享對象</p>
              {loadingShares ? (
                <div className="flex justify-center py-3">
                  <Spinner size={16} />
                </div>
              ) : (
                <div className="space-y-2">
                  {shares.map(s => (
                    <div key={s.id} className="flex items-center gap-3 py-2 px-3 bg-stone-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-stone-500 font-medium">
                          {(s.memberEmail?.[0] ?? '?').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-stone-700 truncate">{s.memberEmail ?? '匿名'}</p>
                        {s.memberName && (
                          <p className="text-xs text-stone-400 truncate">{s.memberName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs text-stone-400">
                          <Shield size={9} strokeWidth={1.75} />
                          {s.permission === 'edit' ? '編輯' : '檢視'}
                        </span>
                        {s.memberEmail && (
                          <IconButton
                            onClick={() => removeShare(s.memberEmail!)}
                            aria-label={`移除 ${s.memberEmail}`}
                            className="h-7 w-7 hover:text-red-600"
                          >
                            <Trash2 size={12} strokeWidth={1.75} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex justify-end">
          <Button onClick={onClose}>
            完成
          </Button>
        </div>
    </Modal>
  );
};

export default ShareMeetingModal;
