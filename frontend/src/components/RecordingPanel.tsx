import React, { useCallback, useRef, useState } from 'react';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import { useAuth } from '../contexts/AuthContext';
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
  config, onConfigChange, customTemplates, termDicts, onTranscriptUpdate, onRecordingStop,
}) => {
  const { getToken } = useAuth();
  const recognizerRef = useRef<speechsdk.SpeechRecognizer | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recError, setRecError] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];
  const templateName = allTemplates.find((t) => t.id === config.templateId)?.name;

  const startRecording = useCallback(async () => {
    // Auto-generate title if empty
    if (!config.title.trim()) {
      const now = new Date();
      const autoTitle = `會議 ${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      onConfigChange({ ...config, title: autoTitle });
      config.title = autoTitle;
    }
    setRecError('');

    const token = await getToken();
    const backendUrl = process.env.REACT_APP_BACKEND_URL!;

    try {
      // 1. Create meeting
      const meetingRes = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: config.title, mode: config.mode, language: config.language, templateId: config.templateId }),
      });
      if (!meetingRes.ok) throw new Error('無法建立會議記錄');
      const meeting = await meetingRes.json();
      meetingIdRef.current = meeting.id;

      // 2. Get speech token from backend (keeps Speech key secure)
      const tokenRes = await fetch(`${backendUrl}/api/speech-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!tokenRes.ok) throw new Error('無法取得語音辨識憑證');
      const { token: speechToken, region } = await tokenRes.json();

      // 3. Create Speech recognizer (browser → Azure Speech directly)
      const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(speechToken, region);
      speechConfig.speechRecognitionLanguage = config.language === 'auto' ? 'zh-TW' : config.language;
      // Dialect fallback
      if (config.language === 'nan-TW' || config.language === 'hak-TW') {
        speechConfig.speechRecognitionLanguage = 'zh-TW';
      }

      const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

      // Add phrase list for terminology
      const activeTerms = termDicts
        .filter((d) => d.isActive && config.terminologyIds.includes(d.id!))
        .flatMap((d) => d.terms.map((t) => t.preferred));
      if (activeTerms.length > 0) {
        const phraseList = speechsdk.PhraseListGrammar.fromRecognizer(recognizer);
        activeTerms.forEach((term) => phraseList.addPhrase(term));
      }

      // 4. Handle recognition results
      let speakerCounter = 1;
      recognizer.recognized = (_sender, event) => {
        if (event.result.reason === speechsdk.ResultReason.RecognizedSpeech && event.result.text) {
          onTranscriptUpdate({
            id: crypto.randomUUID(),
            speaker: `說話者 ${speakerCounter}`,
            speakerId: String(speakerCounter),
            text: event.result.text,
            timestamp: new Date(),
            offset: event.result.offset / 10000,
            duration: event.result.duration / 10000,
            confidence: 0.95,
            language: config.language,
          });
        }
      };

      recognizer.canceled = (_sender, event) => {
        if (event.reason === speechsdk.CancellationReason.Error) {
          console.error('Speech recognition error:', event.errorDetails);
          setRecError(`語音辨識錯誤: ${event.errorDetails}`);
        }
      };

      // 5. Start continuous recognition
      recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('Speech recognition started');
          recognizerRef.current = recognizer;
          setIsRecording(true);
          setDuration(0);
          timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        },
        (error) => {
          console.error('Failed to start recognition:', error);
          setRecError(`啟動錄音失敗: ${error}`);
        }
      );

    } catch (err: any) {
      setRecError(err.message || '啟動錄音失敗');
    }
  }, [config, getToken, onConfigChange, onTranscriptUpdate, termDicts]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync(
        () => {
          recognizerRef.current?.close();
          recognizerRef.current = null;
        },
        (error) => console.error('Stop error:', error)
      );
    }

    setIsRecording(false);
    if (meetingIdRef.current) {
      onRecordingStop(meetingIdRef.current, config.title, config.templateId);
    }
  }, [onRecordingStop, config.title, config.templateId]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-2xl">🎙️</span> 即時錄音
        {isRecording && (
          <span className="ml-auto text-xs font-normal px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-full">
            REC
          </span>
        )}
      </h2>

      <input
        type="text"
        placeholder="會議標題（選填，自動生成）"
        value={config.title}
        onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
        disabled={isRecording}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl mb-4 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 transition"
      />

      <div className={`mb-5 ${isRecording ? 'opacity-60 pointer-events-none' : ''}`}>
        <MeetingConfigCard config={config} onChange={onConfigChange} customTemplates={customTemplates}
          termDicts={termDicts} disabled={isRecording} />
      </div>

      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button onClick={startRecording}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-md text-base">
            <span className="text-xl">▶</span> 開始錄音
          </button>
        ) : (
          <button onClick={stopRecording}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-4 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 active:scale-95 transition-all shadow-md recording-pulse text-base">
            <span className="inline-block w-4 h-4 bg-white rounded-sm" /> 停止錄音
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

      {recError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {recError}
        </div>
      )}

      {isRecording && (
        <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse flex-shrink-0" />
          <span>
            正在錄音中，即時字幕顯示於下方。直接連線 Azure Speech 辨識。
            {config.terminologyIds.length > 0 && ` 已套用 ${config.terminologyIds.length} 個術語辭典。`}
          </span>
        </div>
      )}
    </div>
  );
};

export default RecordingPanel;
