import React from 'react';
import { CheckSquare, Lightbulb, ArrowRight, FileText } from 'lucide-react';
import { MeetingSummary } from '../types';
import { Card, EmptyState, Spinner } from './ui';

interface Props {
  summary: MeetingSummary | null;
  meetingId?: string;
  isLoading?: boolean;
  onExport?: (format: 'markdown' | 'json') => void;
}

const SummaryPanel: React.FC<Props> = ({ summary, isLoading }) => {
  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner size={22} />
    </div>
  );
  if (!summary) {
    return (
      <EmptyState
        icon={<FileText size={26} strokeWidth={1.75} />}
        title="尚無摘要"
        description="會議轉錄完成後,AI 會自動產生摘要與行動事項"
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Markdown summary */}
      {summary.markdown && (
        <Card className="p-5">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">會議摘要</p>
          <div className="prose prose-sm max-w-none text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">
            {summary.markdown}
          </div>
        </Card>
      )}

      {/* Action items */}
      {summary.actionItems?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} strokeWidth={1.75} className="text-teal-700" />
            <p className="text-xs font-medium text-stone-700">行動事項</p>
          </div>
          <div className="space-y-2.5">
            {summary.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-stone-700">{item.task}</p>
                  {item.assignee && (
                    <p className="text-xs text-stone-400 mt-0.5">負責人：{item.assignee}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Key decisions */}
      {summary.keyDecisions?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} strokeWidth={1.75} className="text-amber-700" />
            <p className="text-xs font-medium text-stone-700">關鍵決策</p>
          </div>
          <div className="space-y-2">
            {summary.keyDecisions.map((d, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                <p className="text-sm text-stone-700">{d}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Next topics */}
      {summary.nextMeetingTopics?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight size={14} strokeWidth={1.75} className="text-teal-700" />
            <p className="text-xs font-medium text-stone-700">下次會議議題</p>
          </div>
          <div className="space-y-2">
            {summary.nextMeetingTopics.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 flex-shrink-0" />
                <p className="text-sm text-stone-700">{t}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default SummaryPanel;
