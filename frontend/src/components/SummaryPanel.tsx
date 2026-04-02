import React, { useState } from 'react';
import { MeetingSummary, ActionItem, BUILTIN_TEMPLATES, SummaryTemplate, SPEECH_LANGUAGES } from '../types';

const PRIORITY_STYLE: Record<ActionItem['priority'], string> = {
  '高': 'bg-red-100 text-red-700 border-red-200',
  '中': 'bg-amber-100 text-amber-700 border-amber-200',
  '低': 'bg-green-100 text-green-700 border-green-200',
};

const CATEGORY_EMOJI: Record<ActionItem['category'], string> = {
  '技術': '💻', '業務': '📊', '行政': '📋', '其他': '📌',
};

interface SummaryPanelProps {
  summary: MeetingSummary | null;
  isLoading: boolean;
  meetingId?: string;
  meetingTitle?: string;
  customTemplates?: SummaryTemplate[];
  onExport: (format: 'markdown' | 'json') => void;
  onShare?: () => void;
}

type Tab = 'summary' | 'actions' | 'decisions';

const SummaryPanel: React.FC<SummaryPanelProps> = ({
  summary, isLoading, meetingId, meetingTitle, customTemplates = [],
  onExport, onShare,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];
  const templateInfo = summary?.templateId
    ? allTemplates.find((t) => t.id === summary.templateId)
    : null;
  const languageInfo = summary?.language
    ? SPEECH_LANGUAGES.find((l) => l.code === summary.language)
    : null;

  const tabs: { key: Tab; label: string; emoji: string; count?: number }[] = [
    { key: 'summary',   label: '會議摘要',  emoji: '📄' },
    { key: 'actions',   label: '待辦事項',  emoji: '✅', count: summary?.actionItems.length },
    { key: 'decisions', label: '決議事項',  emoji: '⚖️' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🤖</span> AI 會議摘要
          </h2>
          {summary && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {templateInfo && (
                <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full">
                  {templateInfo.icon} {templateInfo.name}
                </span>
              )}
              {languageInfo && (
                <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded-full">
                  {languageInfo.flag} {languageInfo.label}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {new Date(summary.generatedAt).toLocaleString('zh-TW', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
        {summary && (
          <div className="flex flex-col gap-1.5 items-end">
            <div className="flex gap-1.5">
              <button
                onClick={() => onExport('markdown')}
                className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition"
              >
                ↓ MD
              </button>
              <button
                onClick={() => onExport('json')}
                className="px-2.5 py-1.5 text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
              >
                ↓ JSON
              </button>
            </div>
            {onShare && meetingId && (
              <button
                onClick={onShare}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-100 transition"
              >
                👥 分享
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="relative mb-4">
            <div className="w-12 h-12 border-4 border-indigo-100 rounded-full" />
            <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-indigo-600 rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-600">GPT-4 正在分析會議內容...</p>
          <p className="text-xs mt-1">依照選擇的摘要範本生成結構化摘要</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !summary && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <span className="text-5xl mb-3">✨</span>
          <p className="text-sm text-gray-400">停止錄音或上傳音檔後</p>
          <p className="text-xs text-gray-300 mt-1">AI 將自動依範本生成摘要</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && summary && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-50 rounded-xl p-1 mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.emoji} {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="h-[50vh] sm:h-96 overflow-y-auto">
            {activeTab === 'summary' && (
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                {summary.markdown}
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-3">
                {summary.actionItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">無待辦事項</p>
                ) : (
                  summary.actionItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition"
                    >
                      <span className="text-lg flex-shrink-0">{CATEGORY_EMOJI[item.category]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.task}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500">👤 {item.assignee}</span>
                          {item.deadline && (
                            <span className="text-xs text-gray-500">📅 {item.deadline}</span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_STYLE[item.priority]}`}
                          >
                            {item.priority}優先
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'decisions' && (
              <div className="space-y-2">
                {summary.keyDecisions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">無決議事項</p>
                ) : (
                  summary.keyDecisions.map((d, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
                      <span className="text-green-500 font-bold text-sm flex-shrink-0">✓</span>
                      <p className="text-sm text-gray-800">{d}</p>
                    </div>
                  ))
                )}
                {summary.nextMeetingTopics.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">下次會議建議議題</p>
                    {summary.nextMeetingTopics.map((t, i) => (
                      <div key={i} className="flex gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl mb-2">
                        <span className="text-blue-400 text-sm flex-shrink-0">→</span>
                        <p className="text-sm text-gray-700">{t}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SummaryPanel;
