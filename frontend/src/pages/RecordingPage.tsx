import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mic, Square, ChevronDown, AlertCircle, CheckCircle2,
  Loader2, Volume2, MonitorOff, BatteryWarning,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWakeLock, keepAliveAudio } from '../hooks/useWakeLock';
import {
  MEETING_MODES, SPEECH_LANGUAGES, DEFAULT_MEETING_CONFIG, MeetingConfig,
} from '../types';

// ── Types ──────────────────────────────────────────────────────
interface TranscriptLine {
  speaker: string;
  text: string;
  final: boolean;
}

type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'saving' | 'done' | 'error';

// ── Helpers ────────────────────────────────────────────────────
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};

const SPEAKER_COLORS: Record<string, string> = {
  Guest_1: '#00D4FF',
  Guest_2: '#7B2FFF',
  Guest_3: '#10B981',
  Guest_4: '#F59E0B',
  Guest_5: '#EF4444',
};
const speakerColor = (s: string) => SPEAKER_COLORS[s] ?? '#94A3B8';

// ── Select field ───────────────────────────────────────────────
const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}> = ({ label, value, onChange, options, disabled }) => (
  <div>
    <label className="block text-[12px] font-medium text-slate-500 mb-1.5">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 pl-3 pr-7 rounded-lg border border-slate-200 text-[13px] text-slate-700 bg-white focus:outline-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} strokeWidth={2} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  </div>
);

// ── Main ───────────────────────────────────────────────────────
const RecordingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [config, setConfig] = useState<MeetingConfig>({
    ...DEFAULT_MEETING_CONFIG,
    title: searchParams.get('title') || '',
    mode: (searchParams.get('mode') as any) || DEFAULT_MEETING_CONFIG.mode,
  });

  const [phase, setPhase]       = useState<Phase>('idle');
  const [elapsed, setElapsed]   = useState(0);
  const [lines, setLines]       = useState<TranscriptLine[]>([]);
  const [interim, setInterim]   = useState('');
  const [errMsg, setErrMsg]     = useState('');
  const [savedId, setSavedId]   = useState('');

  // Backgrounded warning: shown when user returns after tab/screen was hidden
  const [showBgWarning, setShowBgWarning] = useState(false);
  const wasHiddenRef = useRef(false);

  const recognizerRef = useRef<any>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // ── Wake Lock ──────────────────────────────────────────────
  const { status: wakeLockStatus, acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();

  // keepAliveAudio singleton — helps iOS keep mic capture alive in foreground
  const audioKeepAliveRef = useRef(keepAliveAudio());

  // ── Visibility change — detect screen lock / app switch ───
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        // Page going to background while recording
        if (phase === 'recording') {
          wasHiddenRef.current = true;
        }
      } else {
        // Page coming back to foreground
        if (wasHiddenRef.current) {
          wasHiddenRef.current = false;
          setShowBgWarning(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [phase]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, interim]);

  // Elapsed timer
  useEffect(() => {
    if (phase === 'recording') {
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Start recording ─────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setPhase('starting');
    setErrMsg('');
    setLines([]);
    setInterim('');
    setElapsed(0);
    setShowBgWarning(false);
    wasHiddenRef.current = false;

    // Start iOS audio keepalive (must happen on user gesture, which this click is)
    audioKeepAliveRef.current.stop();
    audioKeepAliveRef.current.start();

    // Request screen wake lock immediately (we're in a user-gesture callback)
    await acquireWakeLock();

    try {
      // 1. Get Speech token
      const token = await getToken();
      const tokenRes = await fetch(`${backendUrl}/api/speech-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tokenData = await tokenRes.json();
      const speechToken: string | null = tokenData.data?.token;
      const region: string = tokenData.data?.region || 'eastasia';

      // 2. Init SDK
      const SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk');

      let speechConfig: any;
      if (speechToken) {
        speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(speechToken, region);
      } else {
        // No Speech token. In production this is a real failure — never fabricate a
        // meeting from mock subtitles; only fall back to a mock transcript in dev.
        if (process.env.NODE_ENV === 'production') {
          setErrMsg('語音服務暫時無法使用,請稍後再試。');
          setPhase('error');
          return;
        }
        setPhase('recording');
        _startMockTranscript();
        return;
      }

      speechConfig.speechRecognitionLanguage = config.language === 'auto' ? 'zh-TW' : config.language;
      speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode,
        'Continuous'
      );

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer  = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      recognizerRef.current = recognizer;

      // Interim result
      recognizer.recognizing = (_: any, e: any) => {
        setInterim(e.result.text);
      };

      // Final result
      recognizer.recognized = (_: any, e: any) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
          setLines(prev => [...prev, { speaker: 'Guest_1', text: e.result.text, final: true }]);
          setInterim('');
        }
      };

      recognizer.canceled = (_: any, e: any) => {
        if (e.reason === SpeechSDK.CancellationReason.Error) {
          setErrMsg(`語音識別錯誤：${e.errorDetails}`);
          setPhase('error');
        }
      };

      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(resolve, reject);
      });

      setPhase('recording');
    } catch (err: any) {
      // Release lock if startup failed
      await releaseWakeLock();
      audioKeepAliveRef.current.stop();

      if (err?.message?.includes('Microphone')) {
        setErrMsg('無法存取麥克風，請確認瀏覽器權限設定。');
        setPhase('error');
      } else if (process.env.NODE_ENV === 'production') {
        setErrMsg(`啟動失敗：${err?.message ?? '未知錯誤'}`);
        setPhase('error');
      } else {
        // Local dev only: fall back to a mock transcript (clear the stale error first).
        setErrMsg('');
        setPhase('recording');
        await acquireWakeLock();
        audioKeepAliveRef.current.start();
        _startMockTranscript();
      }
    }
  }, [backendUrl, config.language, getToken, acquireWakeLock, releaseWakeLock]);

  // ── Mock transcription (dev / no token) ───────────────────
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const _startMockTranscript = useCallback(() => {
    const samples = [
      { speaker: 'Guest_1', text: '（開發模式：Azure Speech 未設定，顯示模擬字幕）' },
      { speaker: 'Guest_2', text: '請在環境變數設定 SPEECH_KEY 與 SPEECH_REGION 後重新啟動。' },
    ];
    let i = 0;
    mockTimerRef.current = setInterval(() => {
      if (i < samples.length) {
        setLines(prev => [...prev, { ...samples[i], final: true }]);
        i++;
      }
    }, 2500);
  }, []);

  useEffect(() => {
    return () => { if (mockTimerRef.current) clearInterval(mockTimerRef.current); };
  }, []);

  // ── Stop recording ──────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    setPhase('stopping');
    setInterim('');
    setShowBgWarning(false);

    // Release wake lock and keepalive audio
    await releaseWakeLock();
    audioKeepAliveRef.current.stop();

    if (mockTimerRef.current) { clearInterval(mockTimerRef.current); mockTimerRef.current = null; }

    if (recognizerRef.current) {
      await new Promise<void>(resolve => {
        recognizerRef.current.stopContinuousRecognitionAsync(resolve, resolve);
      });
      recognizerRef.current.close();
      recognizerRef.current = null;
    }

    // Save meeting + transcripts
    setPhase('saving');
    try {
      const token = await getToken();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // Create meeting
      const meetingRes = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: config.title || `錄音 ${new Date().toLocaleDateString('zh-TW')}`,
          mode: config.mode,
          language: config.language,
          source: 'recording',
        }),
      });
      if (!meetingRes.ok) throw new Error('建立會議失敗');
      const meetingData = await meetingRes.json();
      const meetingId: string = meetingData.data?.id ?? meetingData.id;

      // Save transcripts (batch)
      const finalLines = lines.filter(l => l.final && l.text.trim());
      if (finalLines.length > 0) {
        await fetch(`${backendUrl}/api/meetings/${meetingId}/transcripts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            segments: finalLines.map((l, idx) => ({
              speaker: l.speaker,
              text: l.text,
              offset: idx * 3000,
              duration: 3000,
              confidence: 0.95,
            })),
          }),
        }).catch(() => {}); // best-effort
      }

      // Mark completed
      await fetch(`${backendUrl}/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'completed' }),
      }).catch(() => {});

      setSavedId(meetingId);
      setPhase('done');
    } catch (err: any) {
      setErrMsg(`儲存失敗：${err?.message ?? '請稍後再試'}`);
      setPhase('error');
    }
  }, [backendUrl, config, getToken, lines, releaseWakeLock]);

  // Release everything on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock();
      audioKeepAliveRef.current.stop();
    };
  }, [releaseWakeLock]);

  // ── UI ──────────────────────────────────────────────────────
  const isActive    = phase === 'recording';
  const isBusy      = phase === 'starting' || phase === 'stopping' || phase === 'saving';
  const modeLabel   = MEETING_MODES.find(m => m.id === config.mode)?.label || '一般會議';

  // Wake lock status pill
  const WakeLockBadge = () => {
    if (!isActive) return null;
    if (wakeLockStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          螢幕保持喚醒
        </span>
      );
    }
    if (wakeLockStatus === 'released') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <MonitorOff size={10} strokeWidth={2} />
          螢幕已休眠
        </span>
      );
    }
    if (wakeLockStatus === 'unsupported') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
          <BatteryWarning size={10} strokeWidth={2} />
          請勿鎖定螢幕
        </span>
      );
    }
    return null;
  };

  return (
    <div className="min-h-full px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight mb-6">即時錄音</h1>

      {/* Background warning */}
      {showBgWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-amber-800">頁面曾在背景中執行</p>
            <p className="text-[12px] text-amber-600 mt-0.5">
              螢幕鎖定或切換應用程式期間，部分字幕可能遺漏。錄音已繼續進行中。
            </p>
          </div>
          <button onClick={() => setShowBgWarning(false)} className="text-amber-400 hover:text-amber-600">
            <span className="text-[16px] leading-none">×</span>
          </button>
        </div>
      )}

      {/* Done state */}
      {phase === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-5 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-emerald-800">錄音已儲存</p>
            <p className="text-[12px] text-emerald-600 mt-0.5">
              共 {lines.length} 段逐字稿，錄音時長 {fmtTime(elapsed)}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigate(`/meeting/${savedId}`)}
                className="h-8 px-4 rounded-lg text-[12px] font-semibold"
                style={{ background: '#00D4FF', color: '#0A0E27' }}
              >
                查看報告
              </button>
              <button
                onClick={() => { setPhase('idle'); setLines([]); setElapsed(0); setSavedId(''); }}
                className="h-8 px-4 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                再錄一次
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] text-red-700">{errMsg}</p>
            <button
              onClick={() => setPhase('idle')}
              className="mt-2 text-[12px] text-red-600 underline"
            >
              返回
            </button>
          </div>
        </div>
      )}

      {/* Config panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-slate-500 mb-1.5">會議名稱</label>
          <input
            value={config.title}
            onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
            placeholder="輸入會議名稱（選填）"
            disabled={isActive || isBusy}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 disabled:opacity-50"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="會議模式"
            value={config.mode}
            onChange={v => setConfig(c => ({ ...c, mode: v as any }))}
            options={MEETING_MODES.map(m => ({ value: m.id, label: `${m.icon} ${m.label}` }))}
            disabled={isActive || isBusy}
          />
          <SelectField
            label="語言"
            value={config.language}
            onChange={v => setConfig(c => ({ ...c, language: v as any }))}
            options={SPEECH_LANGUAGES.map(l => ({ value: l.code, label: `${l.flag} ${l.label}` }))}
            disabled={isActive || isBusy}
          />
        </div>
      </div>

      {/* Record control */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center gap-5 mb-4">
        {/* Timer */}
        <div className="text-center min-h-[52px] flex flex-col justify-center">
          {(isActive || isBusy) && (
            <div className="text-[36px] font-mono font-light text-slate-900 tabular-nums leading-none mb-1">
              {fmtTime(elapsed)}
            </div>
          )}
          <p className="text-[12px] text-slate-400">
            {phase === 'idle'     && '準備就緒'}
            {phase === 'starting' && '正在啟動麥克風...'}
            {phase === 'recording'&& `${modeLabel} · 錄音中`}
            {phase === 'stopping' && '正在停止...'}
            {phase === 'saving'   && '正在儲存...'}
            {phase === 'done'     && '已完成'}
          </p>
        </div>

        {/* Waveform indicator */}
        {isActive && (
          <div className="flex items-center gap-1 h-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full"
                style={{
                  background: '#00D4FF',
                  height: `${10 + Math.sin(Date.now() / 300 + i) * 8}px`,
                  animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}

        {/* Wake lock status */}
        <WakeLockBadge />

        {/* Button */}
        {phase !== 'done' && (
          <button
            onClick={isActive ? stopRecording : startRecording}
            disabled={isBusy || phase === 'error'}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: isActive ? '#EF4444' : '#00D4FF' }}
          >
            {isBusy
              ? <Loader2 size={22} strokeWidth={2} className="text-white animate-spin" />
              : isActive
              ? <Square size={20} strokeWidth={2} fill="white" className="text-white" />
              : <Mic size={22} strokeWidth={1.75} style={{ color: '#0A0E27' }} />
            }
          </button>
        )}

        <p className="text-[12px] text-slate-400">
          {isActive ? '點擊停止並儲存' : isBusy ? '請稍候...' : phase === 'done' ? '' : '點擊開始錄音'}
        </p>
      </div>

      {/* Live transcript */}
      {(isActive || lines.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Volume2 size={13} strokeWidth={1.75} className="text-slate-400" />
            <p className="text-[12px] font-medium text-slate-500">即時字幕</p>
            {isActive && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div
            ref={transcriptRef}
            className="p-4 space-y-3 max-h-[320px] overflow-y-auto text-[13px] leading-relaxed"
          >
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <div
                  className="w-1.5 flex-shrink-0 rounded-full mt-1"
                  style={{ background: speakerColor(line.speaker), minHeight: '16px' }}
                />
                <div>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide mr-2"
                    style={{ color: speakerColor(line.speaker) }}
                  >
                    {line.speaker.replace('Guest_', 'S')}
                  </span>
                  <span className="text-slate-700">{line.text}</span>
                </div>
              </div>
            ))}
            {interim && (
              <div className="flex gap-2 opacity-50">
                <div className="w-1.5 flex-shrink-0 rounded-full mt-1 bg-slate-300" style={{ minHeight: '16px' }} />
                <span className="text-slate-500 italic">{interim}</span>
              </div>
            )}
            {lines.length === 0 && !interim && (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-[12px]">
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                等待語音輸入...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingPage;
