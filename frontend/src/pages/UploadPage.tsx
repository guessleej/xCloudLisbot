import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, File, X, ChevronDown, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MEETING_MODES, SPEECH_LANGUAGES, DEFAULT_MEETING_CONFIG, MeetingConfig } from '../types';

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

const STATUS_TO_PHASE: Record<string, Phase> = {
  pending: 'transcribing',
  processing: 'transcribing',
  completed: 'completed',
  error: 'error',
};

// ── Select field ───────────────────────────────────────────────
const SelectField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean;
}> = ({ label, value, onChange, options, disabled }) => (
  <div>
    <label className="block text-[12px] font-medium text-slate-500 mb-1.5">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 pl-3 pr-7 rounded-lg border border-slate-200 text-[13px] text-slate-700 bg-white focus:outline-none appearance-none disabled:opacity-50"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} strokeWidth={2} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  </div>
);

// ── Progress bar ───────────────────────────────────────────────
const ProgressBar: React.FC<{ progress: number; phase: Phase }> = ({ progress, phase }) => {
  const color = phase === 'error' ? '#EF4444' : phase === 'completed' ? '#10B981' : '#00D4FF';
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-[12px] text-slate-500">{PHASE_LABEL[phase]}</span>
        <span className="text-[12px] font-medium" style={{ color }}>{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────
const UploadPage: React.FC = () => {
  const navigate  = useNavigate();
  const { getToken, getMSGraphToken, user } = useAuth();
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
          clearInterval(pollRef.current!);
          setProgress(100);
          setPhase('completed');
        } else if (status === 'error') {
          clearInterval(pollRef.current!);
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
          clearInterval(pollRef.current!);
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
      <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight mb-6">上傳音檔</h1>

      {/* Completed */}
      {phase === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-5 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-medium text-emerald-800">轉錄完成！</p>
            <p className="text-[12px] text-emerald-600 mt-0.5">
              AI 摘要和逐字稿已準備就緒
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigate(`/meeting/${meetingId}`)}
                className="h-8 px-4 rounded-lg text-[12px] font-semibold"
                style={{ background: '#00D4FF', color: '#0A0E27' }}
              >
                查看報告
              </button>
              <button
                onClick={() => { setPhase('idle'); setFile(null); setProgress(0); setMeetingId(''); setConfig(DEFAULT_MEETING_CONFIG); }}
                className="h-8 px-4 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                再上傳一個
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] text-red-700">{errMsg}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setPhase('idle')} className="text-[12px] text-red-600 underline">重試</button>
              {meetingId && (
                <button onClick={() => navigate(`/meeting/${meetingId}`)} className="text-[12px] text-slate-500 underline">
                  查看報告頁面
                </button>
              )}
            </div>
          </div>
        </div>
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
              ? 'border-slate-100 bg-slate-50 cursor-not-allowed'
              : dragging
              ? 'border-[#00D4FF] bg-[#00D4FF]/[0.04]'
              : file
              ? 'border-slate-200 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
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
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <File size={20} strokeWidth={1.5} className="text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-slate-900">{file.name}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">{fmtSize(file.size)}</p>
              </div>
              {!isBusy && (
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); setFileError(''); setProgress(0); setPhase('idle'); }}
                  className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                   style={{ background: 'rgba(0,212,255,0.1)' }}>
                <Upload size={20} strokeWidth={1.5} style={{ color: '#00D4FF' }} />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-slate-700">拖曳音檔至此，或點擊選取</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  MP3 · WAV · M4A · OGG · WebM · AAC · FLAC · 上限 {MAX_MB} MB
                </p>
              </div>
            </>
          )}
        </div>

        {fileError && (
          <p className="flex items-center gap-1.5 text-[12px] text-red-500 -mt-2">
            <AlertCircle size={12} /> {fileError}
          </p>
        )}

        {/* Progress */}
        {isBusy && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <ProgressBar progress={progress} phase={phase} />
            <p className="text-[11px] text-slate-400 mt-2">
              {phase === 'uploading' && '正在上傳音訊檔案...'}
              {phase === 'transcribing' && '轉錄通常需要 1–5 分鐘，可離開此頁面稍後回來查看。'}
            </p>
          </div>
        )}

        {/* Config */}
        {phase !== 'completed' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-slate-500 mb-1.5">會議名稱</label>
              <input
                value={config.title}
                onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                placeholder="輸入會議名稱..."
                disabled={isBusy}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="會議模式"
                value={config.mode}
                onChange={v => setConfig(c => ({ ...c, mode: v as any }))}
                options={MEETING_MODES.map(m => ({ value: m.id, label: `${m.icon} ${m.label}` }))}
                disabled={isBusy}
              />
              <SelectField
                label="語言"
                value={config.language}
                onChange={v => setConfig(c => ({ ...c, language: v as any }))}
                options={SPEECH_LANGUAGES.map(l => ({ value: l.code, label: `${l.flag} ${l.label}` }))}
                disabled={isBusy}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        {phase !== 'completed' && (
          <button
            onClick={handleSubmit}
            disabled={!file || isBusy || !!fileError}
            className="w-full h-10 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            {isBusy
              ? <><Loader2 size={14} strokeWidth={2.5} className="animate-spin" /> {PHASE_LABEL[phase]}</>
              : <><Upload size={14} strokeWidth={2.5} /> 開始轉錄</>
            }
          </button>
        )}
      </div>
    </div>
  );
};

export default UploadPage;
