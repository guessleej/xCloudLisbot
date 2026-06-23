import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mic, Square, AlertCircle, CheckCircle2,
  Loader2, Volume2, MonitorOff, BatteryWarning, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWakeLock, keepAliveAudio } from '../hooks/useWakeLock';
import {
  MEETING_MODES, SPEECH_LANGUAGES, DEFAULT_MEETING_CONFIG, MeetingConfig,
} from '../types';
import { Button, Card, Badge, Input, Select, Field } from '../components/ui';

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

// Speaker marker colours — functional differentiation only, mapped to Tailwind classes.
const SPEAKER_STYLES: Record<string, { dot: string; text: string }> = {
  Guest_1: { dot: 'bg-teal-600',   text: 'text-teal-700' },
  Guest_2: { dot: 'bg-indigo-500', text: 'text-indigo-600' },
  Guest_3: { dot: 'bg-emerald-500',text: 'text-emerald-600' },
  Guest_4: { dot: 'bg-amber-500',  text: 'text-amber-600' },
  Guest_5: { dot: 'bg-rose-500',   text: 'text-rose-600' },
};
const speakerStyle = (s: string) => SPEAKER_STYLES[s] ?? { dot: 'bg-stone-400', text: 'text-stone-500' };

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
        <Badge tone="success">
          <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
          螢幕保持喚醒
        </Badge>
      );
    }
    if (wakeLockStatus === 'released') {
      return (
        <Badge tone="warning">
          <MonitorOff size={12} strokeWidth={1.75} />
          螢幕已休眠
        </Badge>
      );
    }
    if (wakeLockStatus === 'unsupported') {
      return (
        <Badge tone="neutral">
          <BatteryWarning size={12} strokeWidth={1.75} />
          請勿鎖定螢幕
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="min-h-full px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-900 tracking-tight mb-6">即時錄音</h1>

      {/* Persistent "do not close page" notice while recording */}
      {isActive && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle size={16} strokeWidth={1.75} className="text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-teal-800">錄音進行中，請勿關閉或重新整理頁面</p>
            <p className="text-xs text-teal-700 mt-0.5">
              關閉頁面、切換應用程式或鎖定螢幕都可能中斷錄音並遺失字幕。
            </p>
          </div>
        </div>
      )}

      {/* Background warning */}
      {showBgWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertCircle size={16} strokeWidth={1.75} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">頁面曾在背景中執行</p>
            <p className="text-xs text-amber-700 mt-0.5">
              螢幕鎖定或切換應用程式期間，部分字幕可能遺漏。錄音已繼續進行中。
            </p>
          </div>
          <button
            onClick={() => setShowBgWarning(false)}
            aria-label="關閉提示"
            className="text-amber-500 hover:text-amber-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
      )}

      {/* Done state */}
      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5 flex items-start gap-3">
          <CheckCircle2 size={18} strokeWidth={1.75} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-green-800">錄音已儲存</p>
            <p className="text-xs text-green-700 mt-0.5">
              共 {lines.length} 段逐字稿，錄音時長 {fmtTime(elapsed)}
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="primary" onClick={() => navigate(`/meeting/${savedId}`)}>
                查看報告
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setPhase('idle'); setLines([]); setElapsed(0); setSavedId(''); }}
              >
                再錄一次
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertCircle size={16} strokeWidth={1.75} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-700">{errMsg}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="primary" icon={<RotateCcw size={14} strokeWidth={1.75} />} onClick={startRecording}>
                重試
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPhase('idle')}>
                返回
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Config panel */}
      <Card className="p-5 mb-4 space-y-4">
        <Field label="會議名稱" htmlFor="rec-title">
          <Input
            id="rec-title"
            value={config.title}
            onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
            placeholder="輸入會議名稱（選填）"
            disabled={isActive || isBusy}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="會議模式" htmlFor="rec-mode">
            <Select
              id="rec-mode"
              value={config.mode}
              onChange={e => setConfig(c => ({ ...c, mode: e.target.value as any }))}
              disabled={isActive || isBusy}
            >
              {MEETING_MODES.map(m => (
                <option key={m.id} value={m.id}>{`${m.icon} ${m.label}`}</option>
              ))}
            </Select>
          </Field>
          <Field label="語言" htmlFor="rec-lang">
            <Select
              id="rec-lang"
              value={config.language}
              onChange={e => setConfig(c => ({ ...c, language: e.target.value as any }))}
              disabled={isActive || isBusy}
            >
              {SPEECH_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{`${l.flag} ${l.label}`}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Record control */}
      <Card className="p-8 flex flex-col items-center gap-5 mb-4">
        {/* Timer */}
        <div className="text-center min-h-[52px] flex flex-col justify-center" aria-live="polite">
          {(isActive || isBusy) && (
            <div className="text-4xl font-mono font-light text-stone-900 tabular-nums leading-none mb-1">
              {fmtTime(elapsed)}
            </div>
          )}
          <p className="text-xs text-stone-400">
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
          <div className="flex items-end gap-1 h-6" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="w-1 h-6 rounded-full bg-teal-600 origin-bottom"
                style={{
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
            aria-label={isActive ? '停止並儲存錄音' : '開始錄音'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-pop text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {isBusy
              ? <Loader2 size={22} strokeWidth={1.75} className="animate-spin" />
              : isActive
              ? <Square size={20} strokeWidth={1.75} fill="currentColor" />
              : <Mic size={22} strokeWidth={1.75} />
            }
          </button>
        )}

        <p className="text-xs text-stone-400">
          {isActive ? '點擊停止並儲存' : isBusy ? '請稍候...' : phase === 'done' ? '' : '點擊開始錄音'}
        </p>
      </Card>

      {/* Live transcript */}
      {(isActive || lines.length > 0) && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
            <Volume2 size={14} strokeWidth={1.75} className="text-stone-400" />
            <p className="text-xs font-medium text-stone-500">即時字幕</p>
            {isActive && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div
            ref={transcriptRef}
            className="p-4 space-y-3 max-h-[320px] overflow-y-auto text-sm leading-relaxed"
          >
            {lines.map((line, i) => {
              const sc = speakerStyle(line.speaker);
              return (
                <div key={i} className="flex gap-2">
                  <div className={`w-1.5 flex-shrink-0 rounded-full mt-1 ${sc.dot}`} style={{ minHeight: '16px' }} />
                  <div>
                    <span className={`text-xs font-semibold uppercase tracking-wide mr-2 ${sc.text}`}>
                      {line.speaker.replace('Guest_', 'S')}
                    </span>
                    <span className="text-stone-700">{line.text}</span>
                  </div>
                </div>
              );
            })}
            {interim && (
              <div className="flex gap-2 opacity-60">
                <div className="w-1.5 flex-shrink-0 rounded-full mt-1 bg-stone-300" style={{ minHeight: '16px' }} />
                <span className="text-stone-500 italic">{interim}</span>
              </div>
            )}
            {lines.length === 0 && !interim && (
              <div className="flex items-center justify-center py-6 gap-2 text-stone-400 text-xs">
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                等待語音輸入...
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default RecordingPage;
