import React from 'react';
import { CheckSquare, Lightbulb, ArrowRight, FileText } from 'lucide-react';
import { MeetingSummary } from '../types';

interface Props {
  summary: MeetingSummary | null;
  meetingId?: string;
  isLoading?: boolean;
  onExport?: (format: 'markdown' | 'json') => void;
}

const SummaryPanel: React.FC<Props> = ({ summary, isLoading }) => {
  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 rounded-full border-2 border-slate-200 animate-spin" style={{ borderTopColor: '#00D4FF' }} />
    </div>
  );
  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <FileText size={18} strokeWidth={1.5} className="text-slate-400" />
        </div>
        <p className="text-[13px] text-slate-500">尚無摘要</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Markdown summary */}
      {summary.markdown && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wide mb-3">會議摘要</p>
          <div className="prose prose-sm max-w-none text-slate-700 text-[13px] leading-relaxed whitespace-pre-wrap">
            {summary.markdown}
          </div>
        </div>
      )}

      {/* Action items */}
      {summary.actionItems?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} strokeWidth={1.75} className="text-emerald-500" />
            <p className="text-[12px] font-medium text-slate-700">行動事項</p>
          </div>
          <div className="space-y-2.5">
            {summary.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] text-slate-700">{item.task}</p>
                  {item.assignee && (
                    <p className="text-[11px] text-slate-400 mt-0.5">負責人：{item.assignee}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key decisions */}
      {summary.keyDecisions?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} strokeWidth={1.75} className="text-amber-500" />
            <p className="text-[12px] font-medium text-slate-700">關鍵決策</p>
          </div>
          <div className="space-y-2">
            {summary.keyDecisions.map((d, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <p className="text-[13px] text-slate-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next topics */}
      {summary.nextMeetingTopics?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight size={14} strokeWidth={1.75} style={{ color: '#00D4FF' }} />
            <p className="text-[12px] font-medium text-slate-700">下次會議議題</p>
          </div>
          <div className="space-y-2">
            {summary.nextMeetingTopics.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#00D4FF' }} />
                <p className="text-[13px] text-slate-700">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;
