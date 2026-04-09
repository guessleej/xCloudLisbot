import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
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
      <div className="card text-center py-8">
        <div className="mb-2 text-xs font-semibold tracking-wider uppercase" style={{color: 'var(--danger)'}}>
          <span className="inline-block w-2 h-2 rounded-full mr-1.5 animate-pulse" style={{background: 'var(--danger)'}} />
          錄音中
        </div>
        <div className="text-5xl font-light tracking-wider mb-6" style={{color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums'}}>
          {fmt(duration)}
        </div>

        {/* Waveform visual */}
        <div className="flex items-center justify-center gap-[3px] h-12 mb-6">
          {Array.from({length: 20}).map((_, i) => (
            <div key={i} className="w-[3px] rounded-full animate-pulse"
              style={{
                background: 'var(--danger)', opacity: 0.4 + Math.random() * 0.6,
                height: `${12 + Math.random() * 28}px`,
                animationDelay: `${i * 0.05}s`, animationDuration: `${0.4 + Math.random() * 0.4}s`,
              }} />
          ))}
        </div>

        <button onClick={stopRecording}
          className="rec-btn-stop recording-pulse mx-auto"
          style={{background: 'var(--danger)'}}>
          <span className="block w-6 h-6 rounded-sm bg-white" />
        </button>
        <p className="text-xs mt-4" style={{color: 'var(--text-tertiary)'}}>點擊停止 · 自動生成摘要</p>

        {config.title && (
          <div className="mt-4 px-3 py-2 rounded-xl text-xs" style={{background: 'var(--primary-light)', color: 'var(--primary)'}}>
            📋 {config.title}
          </div>
        )}
      </div>
    );
  }

  // ========== Pre-recording UI ==========
  return (
    <div className="card">
      {/* Title */}
      <input type="text" placeholder="會議標題（選填）" value={config.title}
        onChange={(e) => set('title', e.target.value)}
        className="w-full px-4 py-3.5 rounded-2xl text-sm mb-4 outline-none transition-all"
        style={{background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text-primary)'}}
        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border)'} />

      {/* Quick settings row */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
          {currentLang?.flag} {currentLang?.label || '繁體中文'}
          <span className="text-[10px] opacity-50">▼</span>
        </button>
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
          {currentMode?.icon} {currentMode?.label || '一般會議'}
          <span className="text-[10px] opacity-50">▼</span>
        </button>
      </div>

      {/* Expandable settings */}
      {showSettings && (
        <div className="mb-4 p-4 rounded-2xl space-y-3 slide-up" style={{background: 'var(--surface)', border: '1px solid var(--border)'}}>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{color: 'var(--text-tertiary)'}}>語言</label>
            <select value={config.language} onChange={e => set('language', e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)'}}>
              {SPEECH_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{color: 'var(--text-tertiary)'}}>會議模式</label>
            <select value={config.mode} onChange={e => set('mode', e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)'}}>
              {MEETING_MODES.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{color: 'var(--text-tertiary)'}}>摘要範本</label>
            <div className="flex flex-wrap gap-2">
              {allTemplates.slice(0, 7).map(t => (
                <button key={t.id} onClick={() => set('templateId', t.id)}
                  className="px-3 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: config.templateId === t.id ? 'var(--primary-light)' : 'var(--card)',
                    color: config.templateId === t.id ? 'var(--primary)' : 'var(--text-secondary)',
                    border: `1px solid ${config.templateId === t.id ? 'var(--primary)' : 'var(--border)'}`,
                  }}>
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Record button — centered, big */}
      <div className="flex flex-col items-center py-4">
        <button onClick={startRecording} className="rec-btn" style={{background: 'var(--primary)'}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
        <p className="text-xs mt-3 font-medium" style={{color: 'var(--text-tertiary)'}}>點擊開始錄音</p>
      </div>

      {recError && (
        <div className="p-3 rounded-xl text-xs" style={{background: 'var(--danger-light)', color: 'var(--danger)'}}>
          ⚠️ {recError}
        </div>
      )}
    </div>
  );
};

export default RecordingPanel;
