import React, { useEffect, useRef } from 'react';
import { TranscriptSegment } from '../types';

// 依照說話者編號自動分配顏色
const SPEAKER_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500', text: 'text-blue-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-500', text: 'text-violet-700' },
  { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500', text: 'text-amber-700' },
  { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-500', text: 'text-rose-700' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', badge: 'bg-cyan-500', text: 'text-cyan-700' },
];

function getSpeakerColor(speakerId: string) {
  const idx = Math.abs(
    speakerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  ) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[idx];
}

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  isRecording: boolean;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ segments, isRecording }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自動捲動到最新內容
  useEffect(() => {
    if (isRecording) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, isRecording]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">📝</span> 即時逐字稿
        </h2>
        <span className="text-sm text-gray-400">{segments.length} 則發言</span>
      </div>

      <div className="h-[50vh] sm:h-96 overflow-y-auto space-y-3 pr-1">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <span className="text-5xl mb-3">🎤</span>
            <p className="text-sm">開始錄音後，逐字稿將即時顯示於此</p>
          </div>
        ) : (
          segments.map((seg) => {
            const color = getSpeakerColor(seg.speakerId);
            return (
              <div
                key={seg.id}
                className={`flex gap-3 p-3 rounded-xl border ${color.bg} ${color.border} transition-all`}
              >
                {/* 說話者徽章 */}
                <div className="flex-shrink-0">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold ${color.badge}`}
                  >
                    {seg.speaker.replace(/\D/g, '') || '?'}
                  </span>
                </div>

                {/* 內容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${color.text}`}>{seg.speaker}</span>
                    <span className="text-xs text-gray-400">{formatTime(seg.timestamp)}</span>
                    {seg.confidence < 0.75 && (
                      <span className="text-xs text-amber-500" title="信心度偏低">⚠️</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
                </div>
              </div>
            );
          })
        )}

        {/* 錄音中動態指示器 */}
        {isRecording && (
          <div className="flex items-center gap-2 p-3 text-sm text-gray-400">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            正在聆聽...
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default TranscriptView;
