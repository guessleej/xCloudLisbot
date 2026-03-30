import React, { useState } from 'react';
import { MeetingSummary, ActionItem } from '../types';

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
  onExport: (format: 'markdown' | 'json') => void;
}

type Tab = 'summary' | 'actions' | 'decisions';

const SummaryPanel: React.FC<SummaryPanelProps> = ({ summary, isLoading, onExport }) => {
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'summary', label: '會議摘要', emoji: '📄' },
    { key: 'actions', label: `待辦事項 ${summary ? `(${summary.actionItems.length})` : ''}`, emoji: '✅' },
    { key: 'decisions', label: '決議事項', emoji: '⚖️' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">🤖</span> AI 會議摘要
        </h2>
        {summary && (
          <div className="flex gap-2">
            <button
              onClick={() => onExport('markdown')}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition"
            >
              ↓ Markdown
            </button>
            <button
              onClick={() => onExport('json')}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
            >
              ↓ JSON
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-sm">GPT-4 正在分析會議內容...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !summary && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <span className="text-5xl mb-3">✨</span>
          <p className="text-sm">停止錄音後，AI 將自動生成摘要</p>
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
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="h-80 overflow-y-auto">
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
                    <div key={i} className="flex gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition">
                      <span className="text-lg">{CATEGORY_EMOJI[item.category]}</span>
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
                      <span className="text-green-500 font-bold text-sm">✓</span>
                      <p className="text-sm text-gray-800">{d}</p>
                    </div>
                  ))
                )}
                {summary.nextMeetingTopics.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">下次會議建議議題</p>
                    {summary.nextMeetingTopics.map((t, i) => (
                      <div key={i} className="flex gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl mb-2">
                        <span className="text-blue-400 text-sm">→</span>
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
