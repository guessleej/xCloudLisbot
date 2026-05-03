import React from 'react';
import { TranscriptSegment } from '../types';

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

const SPEAKER_COLORS = [
  '#00D4FF', '#7B2FFF', '#10B981', '#F59E0B',
  '#EF4444', '#3B82F6', '#EC4899', '#14B8A6',
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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[13px] text-slate-500">尚無逐字稿</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {segments.map((seg, i) => {
        const color = speakerMap.get(seg.speakerId) || '#94A3B8';
        const showSpeaker = i === 0 || segments[i-1].speakerId !== seg.speakerId;
        return (
          <div key={seg.id} className={showSpeaker ? 'pt-1' : ''}>
            {showSpeaker && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                     style={{ background: color }}>
                  {seg.speaker?.[0]?.toUpperCase() || 'S'}
                </div>
                <span className="text-[12px] font-medium text-slate-700">{seg.speaker || '說話者'}</span>
                {seg.offset !== undefined && (
                  <span className="text-[11px] text-slate-400 font-mono">{fmtMs(seg.offset)}</span>
                )}
              </div>
            )}
            <p className="text-[13px] text-slate-700 leading-relaxed pl-7">{seg.text}</p>
          </div>
        );
      })}
    </div>
  );
};

export default TranscriptView;
