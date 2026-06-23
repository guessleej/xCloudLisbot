import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, File, X, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MEETING_MODES, SPEECH_LANGUAGES, DEFAULT_MEETING_CONFIG, MeetingConfig } from '../types';
import { Button, Card, Field, Input, Select, useToast } from '../components/ui';

// ── Types ──────────────────────────────────────────────────────
type Phase = 'idle' | 'uploading' | 'transcribing' | 'completed' | 'error';

const ACCEPT = '.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.opus';
const MAX_MB = 200;

// ── Helpers ────────────────────────────────────────────────────
const fmtSize = (b: number) => {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  uploading: '上傳中...',
  transcribing: '轉錄中（Azure Speech）...',
  completed: '完成！',
  error: '發生錯誤',
};

// ── Progress bar ───────────────────────────────────────────────
const ProgressBar: React.FC<{ progress: number; phase: Phase }> = ({ progress, phase }) => {
  const barColor =
    phase === 'error' ? 'bg-red-600' : phase === 'completed' ? 'bg-green-600' : 'bg-teal-700';
  const textColor =
    phase === 'error' ? 'text-red-600' : phase === 'completed' ? 'text-green-700' : 'text-teal-700';
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-stone-600">{PHASE_LABEL[phase]}</span>
        <span className={`text-xs font-medium ${textColor}`}>{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────
const UploadPage: React.FC = () => {
  const navigate  = useNavigate();
  const { getToken, getMSGraphToken, user } = useAuth();
  const { show } = useToast();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [config, setConfig] = useState<MeetingConfig>(DEFAULT_MEETING_CONFIG);
  const [file, setFile]     = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase]   = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [fileError, setFileError] = useState('');

  const inputRef   = useRef<HTMLInputElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBusy = phase === 'uploading' || phase === 'transcribing';

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Success toast when transcription completes
  useEffect(() => {
    if (phase === 'completed') show('轉錄完成，報告已準備就緒', 'success');
  }, [phase, show]);

  // ── File validation ─────────────────────────────────────────
  const validateAndSet = (f: File) => {
    const mb = f.size / 1024 / 1024;
    if (mb > MAX_MB) {
      setFileError(`檔案過大（${fmtSize(f.size)}），上限 ${MAX_MB} MB。`);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const allowed = ['mp3','wav','m4a','ogg','webm','aac','flac','opus'];
    if (!allowed.includes(ext) && !f.type.startsWith('audio/')) {
      setFileError('僅支援音訊格式：MP3、WAV、M4A、OGG、WebM、AAC、FLAC。');
      return;
    }
    setFileError('');
    setFile(f);
    // Auto-fill title from filename
    if (!config.title) {
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      setConfig(c => ({ ...c, title: name }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSet(f);
  };

  // ── Poll transcription status ───────────────────────────────
  const startPolling = useCallback((id: string, token: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/meetings/${id}/transcription-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data.data?.status ?? data.status;
        const prog: number   = data.data?.progress ?? data.progress ?? 50;

        if (status === 'completed') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setProgress(100);
          setPhase('completed');
        } else if (status === 'error') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setProgress(0);
          setErrMsg('轉錄失敗，請確認音檔格式後重試。');
          setPhase('error');
        } else {
          // Simulate progress between 30–90 while processing
          setProgress(Math.min(30 + prog * 0.6, 90));
        }

        attempts++;
        // Timeout after 10 minutes (200 × 3s)
        if (attempts > 200) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setErrMsg('轉錄逾時，請至報告頁面確認狀態。');
          setPhase('error');
        }
      } catch {}
    }, 3000);
  }, [backendUrl]);

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!file || isBusy) return;
    setPhase('uploading');
    setProgress(0);
    setErrMsg('');

    try {
      const token = await getToken();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // 1. Create meeting record
      setProgress(10);
      const meetRes = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: config.title || file.name.replace(/\.[^.]+$/, ''),
          mode: config.mode,
          language: config.language,
          source: 'upload',
        }),
      });
      if (!meetRes.ok) throw new Error('建立會議失敗');
      const meetData = await meetRes.json();
      const id: string = meetData.data?.id ?? meetData.id;
      setMeetingId(id);
      setProgress(20);

      // 2. Upload audio file (attach OneDrive token for Microsoft users)
      const form = new FormData();
      form.append('file', file);
      const uploadHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (user?.provider === 'microsoft') {
        const msToken = await getMSGraphToken();
        if (msToken) uploadHeaders['X-Storage-Token'] = msToken;
      }
      const uploadRes = await fetch(`${backendUrl}/api/meetings/${id}/upload`, {
        method: 'POST',
        headers: uploadHeaders,
        body: form,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `上傳失敗（HTTP ${uploadRes.status}）`);
      }
      setProgress(30);
      setPhase('transcribing');

      // 3. Start polling
      startPolling(id, token);
    } catch (err: any) {
      setErrMsg(err?.message ?? '上傳失敗，請稍後再試。');
      setPhase('error');
      setProgress(0);
    }
  }, [backendUrl, config, file, getToken, getMSGraphToken, user, isBusy, startPolling]);

  // ── UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-full px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-900 tracking-tight mb-6">上傳音檔</h1>

      {/* Completed */}
      {phase === 'completed' && (
        <Card className="p-5 mb-5 bg-green-50 border-green-200 shadow-none">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} strokeWidth={1.75} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">轉錄完成！</p>
              <p className="text-xs text-green-700 mt-0.5">
                AI 摘要和逐字稿已準備就緒
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => navigate(`/meeting/${meetingId}`)}>
                  查看報告
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setPhase('idle'); setFile(null); setProgress(0); setMeetingId(''); setConfig(DEFAULT_MEETING_CONFIG); }}
                >
                  再上傳一個
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {phase === 'error' && (
        <Card className="p-4 mb-5 bg-red-50 border-red-200 shadow-none">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} strokeWidth={1.75} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700">{errMsg}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setPhase('idle')} className="text-xs text-red-600 underline">重試</button>
                {meetingId && (
                  <button onClick={() => navigate(`/meeting/${meetingId}`)} className="text-xs text-stone-500 underline">
                    查看報告頁面
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !file && !isBusy && inputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors ${
            isBusy
              ? 'border-stone-100 bg-stone-50 cursor-not-allowed'
              : dragging
              ? 'border-teal-600 bg-teal-50'
              : file
              ? 'border-stone-200 bg-stone-50'
              : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 cursor-pointer'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) validateAndSet(f); }}
            disabled={isBusy}
          />

          {file ? (
            <>
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                <File size={20} strokeWidth={1.75} className="text-stone-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-stone-900">{file.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">{fmtSize(file.size)}</p>
              </div>
              {!isBusy && (
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); setFileError(''); setProgress(0); setPhase('idle'); }}
                  aria-label="移除檔案"
                  className="absolute top-3 right-3 text-stone-400 hover:text-stone-600 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-teal-50">
                <Upload size={20} strokeWidth={1.75} className="text-teal-700" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-stone-700">拖曳音檔至此，或點擊選取</p>
                <p className="text-xs text-stone-400 mt-1">
                  MP3 · WAV · M4A · OGG · WebM · AAC · FLAC · 上限 {MAX_MB} MB
                </p>
              </div>
            </>
          )}
        </div>

        {fileError && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 -mt-2">
            <AlertCircle size={12} strokeWidth={1.75} /> {fileError}
          </p>
        )}

        {/* Progress */}
        {isBusy && (
          <Card className="p-5">
            <ProgressBar progress={progress} phase={phase} />
            <p className="text-xs text-stone-400 mt-2">
              {phase === 'uploading' && '正在上傳音訊檔案...'}
              {phase === 'transcribing' && '轉錄通常需要 1–5 分鐘，可離開此頁面稍後回來查看。'}
            </p>
          </Card>
        )}

        {/* Config */}
        {phase !== 'completed' && (
          <Card className="p-5 space-y-4">
            <Field label="會議名稱" htmlFor="upload-title">
              <Input
                id="upload-title"
                value={config.title}
                onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                placeholder="輸入會議名稱..."
                disabled={isBusy}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="會議模式" htmlFor="upload-mode">
                <Select
                  id="upload-mode"
                  value={config.mode}
                  onChange={e => setConfig(c => ({ ...c, mode: e.target.value as any }))}
                  disabled={isBusy}
                >
                  {MEETING_MODES.map(m => (
                    <option key={m.id} value={m.id}>{`${m.icon} ${m.label}`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="語言" htmlFor="upload-language">
                <Select
                  id="upload-language"
                  value={config.language}
                  onChange={e => setConfig(c => ({ ...c, language: e.target.value as any }))}
                  disabled={isBusy}
                >
                  {SPEECH_LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{`${l.flag} ${l.label}`}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        )}

        {/* Submit */}
        {phase !== 'completed' && (
          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            disabled={!file || isBusy || !!fileError}
            loading={isBusy}
            icon={!isBusy ? <Upload size={15} strokeWidth={1.75} /> : undefined}
          >
            {isBusy ? PHASE_LABEL[phase] : '開始轉錄'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default UploadPage;
