import React, { useState } from 'react';
import { Bot, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SPEECH_LANGUAGES, SpeechLanguage } from '../types';
import { dispatchBot, RECALL_UNSUPPORTED_LANGUAGES } from '../services/recall';
import { Modal, Button, Input, Select, Field, IconButton } from './ui';

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
    <Modal onClose={onClose} labelledBy="recall-bot-title" maxWidth="max-w-md" className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 id="recall-bot-title" className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Bot size={17} strokeWidth={1.75} className="text-stone-500" />
            錄製線上會議
          </h2>
          <IconButton onClick={onClose} aria-label="關閉">
            <X size={18} strokeWidth={1.75} />
          </IconButton>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-stone-400 leading-relaxed">
            貼上 Microsoft Teams、Google Meet 或 Zoom 會議連結，系統會派出 AI 機器人加入會議、錄音並轉錄。
            台語／客語請改用「實體錄音」。
          </p>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="關閉錯誤訊息"><X size={12} strokeWidth={1.75} /></button>
            </div>
          )}

          <Field label="會議連結" htmlFor="recall-bot-url">
            <Input
              id="recall-bot-url"
              value={meetingUrl}
              onChange={e => setMeetingUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="https://teams.microsoft.com/... 或 https://meet.google.com/..."
            />
          </Field>

          <Field label="會議標題（選填）" htmlFor="recall-bot-title-input">
            <Input
              id="recall-bot-title-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="線上會議錄音"
            />
          </Field>

          <Field label="語言" htmlFor="recall-bot-language">
            <Select
              id="recall-bot-language"
              value={language}
              onChange={e => setLanguage(e.target.value as SpeechLanguage)}
            >
              {SUPPORTED.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={loading || !meetingUrl.trim()}
            loading={loading}
            icon={<Bot size={15} strokeWidth={1.75} />}
          >
            {loading ? '派遣中...' : '派遣機器人'}
          </Button>
        </div>
    </Modal>
  );
};

export default RecallBotModal;
