import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import { Mic, Square, Settings as SettingsIcon, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TranscriptSegment, MeetingConfig, SummaryTemplate, TermDictionary, BUILTIN_TEMPLATES, SPEECH_LANGUAGES, MEETING_MODES } from '../types';

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
  const [showSettings, setShowSettings] = useState(false);

  // Cleanup timer and recognizer on unmount (e.g. user navigates away during recording)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(() => {
          recognizerRef.current?.close();
          recognizerRef.current = null;
        }, () => {});
      }
    };
  }, []);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];
  const currentLang = SPEECH_LANGUAGES.find(l => l.code === config.language);
  const currentMode = MEETING_MODES.find(m => m.id === config.mode);

  const set = <K extends keyof MeetingConfig>(key: K, val: MeetingConfig[K]) =>
    onConfigChange({ ...config, [key]: val });

  const startRecording = useCallback(async () => {
    let effectiveTitle = config.title.trim();
    if (!effectiveTitle) {
      const now = new Date();
      effectiveTitle = `會議 ${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      onConfigChange({ ...config, title: effectiveTitle });
    }
    setRecError('');
    const token = await getToken();
    const backendUrl = process.env.REACT_APP_BACKEND_URL!;

    try {
      const meetingRes = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: effectiveTitle, mode: config.mode, language: config.language, templateId: config.templateId }),
      });
      if (!meetingRes.ok) throw new Error('無法建立會議記錄');
      const meeting = await meetingRes.json();
      meetingIdRef.current = meeting.id;

      const tokenRes = await fetch(`${backendUrl}/api/speech-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!tokenRes.ok) throw new Error('無法取得語音辨識憑證');
      const { token: speechToken, region } = await tokenRes.json();

      const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(speechToken, region);
      speechConfig.speechRecognitionLanguage = config.language === 'auto' ? 'zh-TW' :
        (config.language === 'nan-TW' || config.language === 'hak-TW') ? 'zh-TW' : config.language;

      const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

      const activeTerms = termDicts
        .filter((d) => d.isActive && config.terminologyIds.includes(d.id!))
        .flatMap((d) => d.terms.map((t) => t.preferred));
      if (activeTerms.length > 0) {
        const phraseList = speechsdk.PhraseListGrammar.fromRecognizer(recognizer);
        activeTerms.forEach((term) => phraseList.addPhrase(term));
      }

      let speakerCounter = 1;
      recognizer.recognized = (_s, e) => {
        if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech && e.result.text) {
          onTranscriptUpdate({
            id: crypto.randomUUID(), speaker: `說話者 ${speakerCounter}`,
            speakerId: String(speakerCounter), text: e.result.text, timestamp: new Date(),
            offset: e.result.offset / 10000, duration: e.result.duration / 10000,
            confidence: 0.95, language: config.language,
          });
        }
      };
      recognizer.canceled = (_s, e) => {
        if (e.reason === speechsdk.CancellationReason.Error) setRecError(`語音辨識錯誤: ${e.errorDetails}`);
      };

      recognizer.startContinuousRecognitionAsync(
        () => { recognizerRef.current = recognizer; setIsRecording(true); setDuration(0);
          timerRef.current = setInterval(() => setDuration(d => d + 1), 1000); },
        (err) => setRecError(`啟動失敗: ${err}`)
      );
    } catch (err: any) { setRecError(err.message || '啟動錄音失敗'); }
  }, [config, getToken, onConfigChange, onTranscriptUpdate, termDicts]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const doStop = () => {
      setIsRecording(false);
      if (meetingIdRef.current) onRecordingStop(meetingIdRef.current, config.title, config.templateId);
    };
    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync(
        () => {
          recognizerRef.current?.close();
          recognizerRef.current = null;
          // Wait briefly for final recognized events to flush
          setTimeout(doStop, 300);
        },
        (err) => { console.error('Stop error:', err); doStop(); }
      );
    } else {
      doStop();
    }
  }, [onRecordingStop, config.title, config.templateId]);

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // ========== Recording Mode UI ==========
  if (isRecording) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 text-center py-8 px-5">
        <div className="mb-3 text-[11px] font-semibold tracking-wider uppercase text-red-700 inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
          錄音中
        </div>
        <div className="text-[48px] font-light tracking-wider mb-6 text-stone-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(duration)}
        </div>

        {/* Waveform visual */}
        <div className="flex items-center justify-center gap-[3px] h-10 mb-6">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-[2px] rounded-full animate-pulse bg-stone-400"
              style={{
                opacity: 0.3 + Math.random() * 0.5,
                height: `${10 + Math.random() * 24}px`,
                animationDelay: `${i * 0.05}s`,
                animationDuration: `${0.5 + Math.random() * 0.4}s`,
              }}
            />
          ))}
        </div>

        <button
          onClick={stopRecording}
          className="rec-btn-stop recording-pulse mx-auto bg-red-700 hover:bg-red-800 min-h-0 min-w-0"
          aria-label="停止錄音"
        >
          <Square size={18} fill="white" strokeWidth={0} className="text-white" />
        </button>
        <p className="text-xs mt-4 text-stone-500">點擊停止 · 自動生成摘要</p>

        {config.title && (
          <div className="mt-5 px-3 py-2 rounded-md text-xs bg-stone-100 text-stone-600 inline-flex items-center gap-1.5">
            <FileText size={12} strokeWidth={1.75} />
            {config.title}
          </div>
        )}
      </div>
    );
  }

  // ========== Pre-recording UI ==========
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-5">
      {/* Title */}
      <input
        type="text"
        placeholder="會議標題（選填）"
        value={config.title}
        onChange={(e) => set('title', e.target.value)}
        className="w-full h-10 px-3 rounded-md text-sm mb-3 outline-none bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-stone-500 transition-colors"
      />

      {/* Quick settings row */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors min-h-0 min-w-0"
        >
          {currentLang?.label || '繁體中文'}
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors min-h-0 min-w-0"
        >
          {currentMode?.label || '一般會議'}
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-stone-500 hover:bg-stone-100 transition-colors min-h-0 min-w-0"
          title="更多設定"
        >
          <SettingsIcon size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* Expandable settings */}
      {showSettings && (
        <div className="mb-4 p-4 rounded-md space-y-3 slide-up bg-stone-50 border border-stone-200">
          <div>
            <label className="block text-[11px] font-medium mb-1.5 text-stone-500 uppercase tracking-wide">語言</label>
            <select
              value={config.language}
              onChange={e => set('language', e.target.value as any)}
              className="w-full h-9 px-3 rounded-md text-sm outline-none bg-white border border-stone-300 text-stone-900 focus:border-stone-500 transition-colors"
            >
              {SPEECH_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1.5 text-stone-500 uppercase tracking-wide">會議模式</label>
            <select
              value={config.mode}
              onChange={e => set('mode', e.target.value as any)}
              className="w-full h-9 px-3 rounded-md text-sm outline-none bg-white border border-stone-300 text-stone-900 focus:border-stone-500 transition-colors"
            >
              {MEETING_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1.5 text-stone-500 uppercase tracking-wide">摘要範本</label>
            <div className="flex flex-wrap gap-1.5">
              {allTemplates.slice(0, 7).map(t => (
                <button
                  key={t.id}
                  onClick={() => set('templateId', t.id)}
                  className={`h-8 px-3 rounded-md text-[11px] font-medium transition-colors min-h-0 min-w-0 ${
                    config.templateId === t.id
                      ? 'bg-stone-900 text-white border border-stone-900'
                      : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Record button — centered */}
      <div className="flex flex-col items-center py-6">
        <button
          onClick={startRecording}
          className="rec-btn bg-teal-600 hover:bg-teal-700 min-h-0 min-w-0"
          aria-label="開始錄音"
        >
          <Mic size={24} strokeWidth={2} className="text-white" />
        </button>
        <p className="text-xs mt-3 text-stone-500">點擊開始錄音</p>
      </div>

      {recError && (
        <div className="px-3 py-2.5 rounded-md text-xs bg-red-50 text-red-700 border border-red-100 inline-flex items-start gap-2">
          <AlertCircle size={13} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" />
          {recError}
        </div>
      )}
    </div>
  );
};

export default RecordingPanel;
