import React, { useState } from 'react';
import { Bot, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SPEECH_LANGUAGES, SpeechLanguage } from '../types';
import { dispatchBot, RECALL_UNSUPPORTED_LANGUAGES } from '../services/recall';

interface Props {
  onClose: () => void;
  onCreated?: (meetingId: string) => void;
}

// recall.ai cannot transcribe Taiwanese / Hakka — those use the Azure (實體錄音) track.
const SUPPORTED = SPEECH_LANGUAGES.filter(
  l => !RECALL_UNSUPPORTED_LANGUAGES.includes(l.code),
);

const RecallBotModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const { getToken } = useAuth();
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<SpeechLanguage>('zh-TW');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const url = meetingUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setError('請輸入有效的會議連結（Teams / Google Meet / Zoom）');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const result = await dispatchBot(token, {
        meetingUrl: url,
        title: title.trim() || undefined,
        language,
      });
      onCreated?.(result.meetingId);
      onClose();
    } catch (e: any) {
      setError(e?.message || '派遣機器人失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <Bot size={17} strokeWidth={1.75} className="text-slate-500" />
            錄製線上會議
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            貼上 Microsoft Teams、Google Meet 或 Zoom 會議連結，系統會派出 AI 機器人加入會議、錄音並轉錄。
            台語／客語請改用「實體錄音」。
          </p>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-[12px] rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')}><X size={12} /></button>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1.5 block">會議連結</label>
            <input
              value={meetingUrl}
              onChange={e => setMeetingUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="https://teams.microsoft.com/... 或 https://meet.google.com/..."
              className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1.5 block">會議標題（選填）</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="線上會議錄音"
              className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-700 mb-1.5 block">語言</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as SpeechLanguage)}
              className="w-full h-9 px-2 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 bg-white"
            >
              {SUPPORTED.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-[12px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={loading || !meetingUrl.trim()}
            className="h-9 px-4 flex items-center gap-1.5 text-[12px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} strokeWidth={1.75} />}
            {loading ? '派遣中...' : '派遣機器人'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecallBotModal;
