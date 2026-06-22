import React from 'react';
import { MessageSquare } from 'lucide-react';
import { TranscriptSegment } from '../types';
import { EmptyState } from './ui';

interface Props {
  segments: TranscriptSegment[];
  isRecording?: boolean;
}

const fmtMs = (ms?: number) => {
  if (!ms && ms !== 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};

// Light-theme speaker accents (avatar background tints).
const SPEAKER_COLORS = [
  '#0F766E', '#7C3AED', '#059669', '#D97706',
  '#DC2626', '#2563EB', '#DB2777', '#0D9488',
];

const TranscriptView: React.FC<Props> = ({ segments, isRecording }) => {
  const speakerMap = React.useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    segments.forEach(s => {
      if (!map.has(s.speakerId)) {
        map.set(s.speakerId, SPEAKER_COLORS[idx % SPEAKER_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [segments]);

  if (!segments.length) {
    return (
      <EmptyState
        icon={<MessageSquare size={26} strokeWidth={1.75} />}
        title="尚無逐字稿"
        description={isRecording ? '錄音進行中,逐字稿將即時顯示' : '逐字稿產生後會顯示於此'}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {segments.map((seg, i) => {
        const color = speakerMap.get(seg.speakerId) || '#78716C';
        const showSpeaker = i === 0 || segments[i-1].speakerId !== seg.speakerId;
        return (
          <div key={seg.id} className={showSpeaker ? 'pt-1' : ''}>
            {showSpeaker && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                     style={{ background: color }}>
                  {seg.speaker?.[0]?.toUpperCase() || 'S'}
                </div>
                <span className="text-xs font-medium text-stone-700">{seg.speaker || '說話者'}</span>
                {seg.offset !== undefined && (
                  <span className="text-xs text-stone-400 font-mono">{fmtMs(seg.offset)}</span>
                )}
              </div>
            )}
            <p className="text-sm text-stone-700 leading-relaxed pl-7">{seg.text}</p>
          </div>
        );
      })}
    </div>
  );
};

export default TranscriptView;
