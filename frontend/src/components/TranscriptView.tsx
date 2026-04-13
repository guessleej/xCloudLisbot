import React, { useEffect, useRef } from 'react';
import { AlignLeft, Mic, AlertCircle } from 'lucide-react';
import { TranscriptSegment } from '../types';

// Speaker accent colors (only for avatar badge) — muted professional palette
const SPEAKER_ACCENTS = [
  'bg-teal-700',
  'bg-amber-700',
  'bg-blue-700',
  'bg-stone-700',
  'bg-rose-700',
  'bg-emerald-700',
];

function getSpeakerAccent(speakerId: string) {
  const idx = Math.abs(
    speakerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  ) % SPEAKER_ACCENTS.length;
  return SPEAKER_ACCENTS[idx];
}

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  isRecording: boolean;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ segments, isRecording }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRecording) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, isRecording]);

  const formatTime = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
          <AlignLeft size={16} strokeWidth={1.75} className="text-stone-500" />
          逐字稿
        </h2>
        <span className="text-xs text-stone-500">{segments.length} 則發言</span>
      </div>

      <div className="h-[50vh] sm:h-96 overflow-y-auto space-y-3 pr-1 -mr-1">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-stone-300">
            <Mic size={32} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm text-stone-400">開始錄音後，逐字稿將即時顯示於此</p>
          </div>
        ) : (
          segments.map((seg) => {
            const accent = getSpeakerAccent(seg.speakerId);
            return (
              <div key={seg.id} className="flex gap-3 py-1">
                {/* Speaker badge */}
                <div className="flex-shrink-0 pt-0.5">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-semibold ${accent}`}
                  >
                    {seg.speaker.replace(/\D/g, '') || '?'}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-stone-700">{seg.speaker}</span>
                    <span className="text-[11px] text-stone-400">{formatTime(seg.timestamp)}</span>
                    {seg.confidence < 0.75 && (
                      <AlertCircle size={12} strokeWidth={1.75} className="text-amber-600" aria-label="信心度偏低" />
                    )}
                  </div>
                  <p className="text-sm text-stone-800 leading-relaxed">{seg.text}</p>
                </div>
              </div>
            );
          })
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 py-2 text-xs text-stone-400">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-1 h-1 bg-stone-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            聆聽中...
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default TranscriptView;
