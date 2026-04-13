import React, { useState } from 'react';
import {
  FileText, Download, Share2, Sparkles,
  Code, TrendingUp, ClipboardList, Circle, Check,
} from 'lucide-react';
import { MeetingSummary, ActionItem, BUILTIN_TEMPLATES, SummaryTemplate, SPEECH_LANGUAGES } from '../types';

const PRIORITY_CLS: Record<ActionItem['priority'], string> = {
  '高': 'bg-red-50 text-red-700 border border-red-100',
  '中': 'bg-amber-50 text-amber-700 border border-amber-100',
  '低': 'bg-stone-100 text-stone-600 border border-stone-200',
};

const CATEGORY_ICON: Record<ActionItem['category'], React.ElementType> = {
  '技術': Code,
  '業務': TrendingUp,
  '行政': ClipboardList,
  '其他': Circle,
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

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'summary',   label: '摘要' },
    { key: 'actions',   label: '待辦', count: summary?.actionItems.length },
    { key: 'decisions', label: '決議' },
  ];

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <FileText size={16} strokeWidth={1.75} className="text-stone-500" />
            會議摘要
          </h2>
          {summary && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
              {templateInfo && (
                <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded font-medium">
                  {templateInfo.name}
                </span>
              )}
              {languageInfo && (
                <span className="text-stone-500">{languageInfo.label}</span>
              )}
              <span className="text-stone-400">
                {new Date(summary.generatedAt).toLocaleString('zh-TW', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
        {summary && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => onExport('markdown')}
              className="h-7 px-2.5 text-[11px] font-medium bg-white text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors inline-flex items-center gap-1 min-h-0 min-w-0"
              title="匯出 Markdown"
            >
              <Download size={11} strokeWidth={1.75} />
              MD
            </button>
            {onShare && meetingId && (
              <button
                onClick={onShare}
                className="h-7 px-2.5 text-[11px] font-medium bg-white text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors inline-flex items-center gap-1 min-h-0 min-w-0"
              >
                <Share2 size={11} strokeWidth={1.75} />
                分享
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <div className="relative mb-4">
            <div className="w-8 h-8 border-2 border-stone-200 rounded-full" />
            <div className="absolute inset-0 w-8 h-8 border-2 border-transparent border-t-stone-700 rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-stone-600">正在生成摘要...</p>
          <p className="text-xs mt-1 text-stone-400">AI 分析會議內容中</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !summary && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-300">
          <Sparkles size={28} strokeWidth={1.5} className="mb-3" />
          <p className="text-sm text-stone-400">停止錄音或上傳音檔後</p>
          <p className="text-xs text-stone-300 mt-0.5">AI 將自動產生摘要</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && summary && (
        <>
          {/* Tabs — underline style */}
          <div className="flex gap-5 border-b border-stone-200 mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px py-2 text-sm font-medium transition-colors min-h-0 min-w-0 inline-flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'text-stone-900 border-b-2 border-stone-900'
                    : 'text-stone-500 hover:text-stone-700 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] font-medium">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {activeTab === 'summary' && (
              <div className="prose prose-sm max-w-none text-stone-700 leading-relaxed whitespace-pre-wrap">
                {summary.markdown}
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-2">
                {summary.actionItems.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-8">無待辦事項</p>
                ) : (
                  summary.actionItems.map((item, i) => {
                    const Icon = CATEGORY_ICON[item.category] || Circle;
                    return (
                      <div
                        key={i}
                        className="flex gap-3 p-3 border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
                      >
                        <Icon size={16} strokeWidth={1.75} className="text-stone-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-900">{item.task}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-stone-500">{item.assignee}</span>
                            {item.deadline && (
                              <span className="text-xs text-stone-500">{item.deadline}</span>
                            )}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CLS[item.priority]}`}
                            >
                              {item.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'decisions' && (
              <div className="space-y-2">
                {summary.keyDecisions.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-8">無決議事項</p>
                ) : (
                  summary.keyDecisions.map((d, i) => (
                    <div key={i} className="flex gap-2.5 py-2 border-b border-stone-100 last:border-b-0">
                      <Check size={14} strokeWidth={2} className="text-teal-600 flex-shrink-0 mt-1" />
                      <p className="text-sm text-stone-700 leading-relaxed">{d}</p>
                    </div>
                  ))
                )}
                {summary.nextMeetingTopics.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-stone-200">
                    <p className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wide">下次議題</p>
                    {summary.nextMeetingTopics.map((t, i) => (
                      <div key={i} className="flex gap-2 py-1.5">
                        <span className="text-stone-300 text-xs mt-0.5">•</span>
                        <p className="text-sm text-stone-700 leading-relaxed">{t}</p>
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
