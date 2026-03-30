import React, { useCallback, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { TranscriptSegment, MeetingConfig, SummaryTemplate, TermDictionary, BUILTIN_TEMPLATES } from '../types';
import MeetingConfigCard from './MeetingConfigCard';

interface RecordingPanelProps {
  config: MeetingConfig;
  onConfigChange: (cfg: MeetingConfig) => void;
  customTemplates: SummaryTemplate[];
  termDicts: TermDictionary[];
  onTranscriptUpdate: (segment: TranscriptSegment) => void;
  onRecordingStop: (meetingId: string, title: string, templateId: string) => void;
}

const RecordingPanel: React.FC<RecordingPanelProps> = ({
  config,
  onConfigChange,
  customTemplates,
  termDicts,
  onTranscriptUpdate,
  onRecordingStop,
}) => {
  const { getToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recError, setRecError] = useState('');

  // 取得啟用的術語詞彙
  const getActiveTerms = () => {
    return termDicts
      .filter((d) => d.isActive && config.terminologyIds.includes(d.id!))
      .flatMap((d) => d.terms.map((t) => t.preferred));
  };

  // WebSocket 訊息處理
  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript') {
          onTranscriptUpdate({
            id: crypto.randomUUID(),
            speaker: `說話者 ${data.speakerId || '1'}`,
            speakerId: data.speakerId || '1',
            text: data.text,
            timestamp: new Date(),
            offset: data.offset,
            duration: data.duration,
            confidence: data.confidence ?? 0.9,
            language: data.language,
          });
        }
      } catch { /* ignore */ }
    },
    [onTranscriptUpdate]
  );

  const handleAudioChunk = useCallback((pcmBuffer: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBuffer);
    }
  }, []);

  const { isRecording, error: audioError, start, stop } = useAudioRecorder({
    sampleRate: 16000,
    onAudioChunk: handleAudioChunk,
  });

  const startRecording = useCallback(async () => {
    if (!config.title.trim()) { setRecError('請先輸入會議標題'); return; }
    setRecError('');
    const token = await getToken();
    const backendUrl = process.env.REACT_APP_BACKEND_URL!;

    try {
      // 建立會議記錄
      const res = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: config.title,
          mode: config.mode,
          language: config.language,
          templateId: config.templateId,
        }),
      });
      if (!res.ok) throw new Error('無法建立會議記錄');
      const meeting = await res.json();
      meetingIdRef.current = meeting.id;

      // 取得 Azure Web PubSub client access URL（正確架構：前端連 PubSub，非直連 Function）
      const wsTokenRes = await fetch(`${backendUrl}/api/ws/token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!wsTokenRes.ok) throw new Error('無法取得 WebSocket 連線憑證');
      const { url: wsUrl } = await wsTokenRes.json();

      // 透過 Web PubSub URL 建立 WebSocket 連線
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        // 傳送設定訊息（含 meetingId 讓 event handler 存取）
        ws.send(JSON.stringify({
          type: 'config',
          language: config.language,
          enableDiarization: true,
          meetingId: meeting.id,
          mode: config.mode,
          maxSpeakers: config.maxSpeakers,
          terminology: getActiveTerms(),
        }));
      };
      ws.onmessage = handleWebSocketMessage;
      ws.onerror = (e) => console.error('WebSocket error:', e);
      wsRef.current = ws;

      // 計時器
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      await start();
    } catch (err: any) {
      setRecError(err.message || '啟動錄音失敗');
    }
  }, [config, getToken, handleWebSocketMessage, start, getActiveTerms]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    wsRef.current?.close();
    await stop();
    if (meetingIdRef.current) {
      onRecordingStop(meetingIdRef.current, config.title, config.templateId);
    }
  }, [stop, onRecordingStop, config.title, config.templateId]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];
  const templateName = allTemplates.find((t) => t.id === config.templateId)?.name;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-2xl">🎙️</span> 即時錄音
        {isRecording && (
          <span className="ml-auto text-xs font-normal px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-full">
            REC
          </span>
        )}
      </h2>

      {/* 會議標題 */}
      <input
        type="text"
        placeholder="輸入會議標題（必填）..."
        value={config.title}
        onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
        disabled={isRecording}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl mb-4 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 transition"
      />

      {/* 設定卡片 */}
      <div className={`mb-5 ${isRecording ? 'opacity-60 pointer-events-none' : ''}`}>
        <MeetingConfigCard
          config={config}
          onChange={onConfigChange}
          customTemplates={customTemplates}
          termDicts={termDicts}
          disabled={isRecording}
        />
      </div>

      {/* 錄音按鈕 */}
      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-md"
          >
            <span className="text-lg">▶</span> 開始錄音
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 active:scale-95 transition-all shadow-md recording-pulse"
          >
            <span className="inline-block w-3 h-3 bg-white rounded-sm" /> 停止錄音
          </button>
        )}

        {isRecording && (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-red-500 font-mono font-semibold">
              <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              {formatDuration(duration)}
            </div>
            {templateName && (
              <span className="text-xs text-gray-400 mt-0.5">範本：{templateName}</span>
            )}
          </div>
        )}
      </div>

      {/* 錯誤提示 */}
      {(recError || audioError) && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {recError || audioError}
        </div>
      )}

      {/* 錄音中提示 */}
      {isRecording && (
        <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse flex-shrink-0" />
          <span>
            正在錄音中，即時字幕顯示於下方。說話者辨識採用 Azure Speech SDK。
            {config.terminologyIds.length > 0 && ` 已套用 ${config.terminologyIds.length} 個術語辭典。`}
          </span>
        </div>
      )}
    </div>
  );
};

export default RecordingPanel;
