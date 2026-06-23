import React from 'react';
import { MessageSquare } from 'lucide-react';
import { TranscriptSegment } from '../types';
import { EmptyState } from './ui';

interface Props {
  segments: TranscriptSegment[];
  isRecording?: boolean;
  /** When provided, timestamps become clickable and seek the recording (ms). */
  onSeek?: (ms: number) => void;
}

const fmtMs = (ms?: number | null) => {
  if (ms === undefined || ms === null) return '';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Functional speaker accents (avatar/dot tints) on a light theme.
const SPEAKER_COLORS = ['#0F766E', '#7C3AED', '#059669', '#D97706', '#DC2626', '#2563EB', '#DB2777', '#0D9488'];

const TranscriptView: React.FC<Props> = ({ segments, isRecording, onSeek }) => {
  // Stable colour per speaker (by speakerId, falling back to display name).
  const colorFor = React.useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    segments.forEach(s => {
      const k = s.speakerId || s.speaker || 'S';
      if (!map.has(k)) { map.set(k, SPEAKER_COLORS[i % SPEAKER_COLORS.length]); i++; }
    });
    return (s: TranscriptSegment) => map.get(s.speakerId || s.speaker || 'S') || '#78716C';
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

  const tsOf = (s: TranscriptSegment): number | null | undefined => (s.offsetMs ?? s.offset);

  return (
    <div className="space-y-5 max-w-3xl">
      {segments.map((seg, i) => {
        const color = colorFor(seg);
        const key = seg.speakerId || seg.speaker || 'S';
        const prevKey = i > 0 ? (segments[i - 1].speakerId || segments[i - 1].speaker || 'S') : null;
        const showSpeaker = key !== prevKey;
        const ms = tsOf(seg);
        const hasTs = ms !== undefined && ms !== null;
        return (
          <div key={seg.id} className={showSpeaker ? '' : '-mt-3.5'}>
            {showSpeaker && (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-sm font-semibold text-stone-800">{seg.speaker || '說話者'}</span>
              </div>
            )}
            <div className="flex gap-3 pl-4">
              {hasTs && onSeek ? (
                <button
                  onClick={() => onSeek(ms as number)}
                  title="跳到此處播放"
                  className="text-xs text-stone-400 hover:text-teal-700 font-mono pt-0.5 w-11 flex-shrink-0 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 rounded"
                >
                  {fmtMs(ms)}
                </button>
              ) : (
                <span className="text-xs text-stone-400 font-mono pt-0.5 w-11 flex-shrink-0 text-right">{fmtMs(ms)}</span>
              )}
              <p className="text-sm text-stone-700 leading-relaxed flex-1">{seg.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TranscriptView;
