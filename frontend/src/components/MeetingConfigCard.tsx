import React, { useState } from 'react';
import {
  MeetingConfig, MeetingMode, SpeechLanguage,
  MEETING_MODES, SPEECH_LANGUAGES, BUILTIN_TEMPLATES,
  SummaryTemplate, TermDictionary,
} from '../types';

interface MeetingConfigCardProps {
  config: MeetingConfig;
  onChange: (cfg: MeetingConfig) => void;
  customTemplates: SummaryTemplate[];
  termDicts: TermDictionary[];
  disabled?: boolean;
}

const MeetingConfigCard: React.FC<MeetingConfigCardProps> = ({
  config, onChange, customTemplates, termDicts, disabled = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  const set = <K extends keyof MeetingConfig>(key: K, val: MeetingConfig[K]) =>
    onChange({ ...config, [key]: val });

  const toggleTerm = (id: string) => {
    const ids = config.terminologyIds.includes(id)
      ? config.terminologyIds.filter((x) => x !== id)
      : [...config.terminologyIds, id];
    set('terminologyIds', ids);
  };

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Row 1: Language + Mode */}
      <div className="grid grid-cols-2 gap-3">
        {/* 語言 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">語言</label>
          <select
            value={config.language}
            onChange={(e) => set('language', e.target.value as SpeechLanguage)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {SPEECH_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}{l.note ? ` (${l.note})` : ''}
              </option>
            ))}
          </select>
        </div>
        {/* 模式 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">會議模式</label>
          <select
            value={config.mode}
            onChange={(e) => set('mode', e.target.value as MeetingMode)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {MEETING_MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Template */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">摘要範本</label>
        <div className="grid grid-cols-4 gap-1.5">
          {allTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => set('templateId', t.id)}
              title={t.description}
              className={`px-2 py-1.5 text-xs rounded-lg border transition-all text-left truncate ${
                config.templateId === t.id
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold'
                  : 'border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Terminology (only shown if dicts exist) */}
      {termDicts.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">專業術語辭典</label>
          <div className="flex flex-wrap gap-2">
            {termDicts.map((d) => (
              <label
                key={d.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                  config.terminologyIds.includes(d.id!)
                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-amber-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={config.terminologyIds.includes(d.id!)}
                  onChange={() => toggleTerm(d.id!)}
                  className="hidden"
                />
                📚 {d.name}
                <span className="text-gray-400">({d.terms.length}詞)</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs text-gray-400 hover:text-indigo-500 transition flex items-center gap-1"
      >
        {showAdvanced ? '▲' : '▼'} 進階設定
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              最大說話者人數：{config.maxSpeakers}
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={config.maxSpeakers}
              onChange={(e) => set('maxSpeakers', Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>1</span><span>20</span>
            </div>
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enablePunctuation}
                onChange={(e) => set('enablePunctuation', e.target.checked)}
                className="rounded"
              />
              自動加入標點符號
            </label>
          </div>
        </div>
      )}

      {/* Language note for dialect */}
      {(config.language === 'nan-TW' || config.language === 'hak-TW') && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <span className="font-semibold">注意：</span>
          {config.language === 'nan-TW' ? '台語（閩南語）' : '客語'}
          辨識需要在 Azure Speech Studio 啟用自訂語音模型。目前將使用繁體中文模型搭配術語詞彙輔助，準確率可能有限。
        </div>
      )}
    </div>
  );
};

export default MeetingConfigCard;
