import React, { useCallback, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  MeetingConfig, SpeechLanguage, SPEECH_LANGUAGES,
  BUILTIN_TEMPLATES, SummaryTemplate, TranscriptSegment, MeetingSummary, UploadStatus,
} from '../types';

const ACCEPTED_TYPES = '.mp3,.wav,.mp4,.m4a,.ogg,.flac,.webm';
const MAX_FILE_MB = 200;

interface AudioUploadPanelProps {
  customTemplates: SummaryTemplate[];
  onSummaryReady: (summary: MeetingSummary, transcripts: TranscriptSegment[], title: string) => void;
}

const AudioUploadPanel: React.FC<AudioUploadPanelProps> = ({ customTemplates, onSummaryReady }) => {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<SpeechLanguage>('zh-TW');
  const [templateId, setTemplateId] = useState('standard');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setErrorMsg(`檔案大小超過 ${MAX_FILE_MB}MB 限制`);
      return;
    }
    setFile(f);
    setErrorMsg('');
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  }, [title]);

  const handleUpload = async () => {
    if (!file) return;
    if (!title.trim()) { setErrorMsg('請輸入會議標題'); return; }
    setErrorMsg('');
    setStatus('uploading');
    setProgress(10);

    try {
      const token = await getToken();
      const backendUrl = process.env.REACT_APP_BACKEND_URL!;

      // 1. 建立 meeting record
      const meetingRes = await fetch(`${backendUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), language, templateId }),
      });
      const meeting = await meetingRes.json();
      setProgress(20);

      // 2. 上傳音檔（raw binary + Content-Type）
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(20 + Math.floor((e.loaded / e.total) * 40));
        }
      };

      const uploadUrl = new URL(`${backendUrl}/api/meetings/${meeting.id}/upload`);
      uploadUrl.searchParams.set('language', language);
      uploadUrl.searchParams.set('title', title.trim());

      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', uploadUrl.toString());
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', file.type || 'audio/wav');
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.statusText}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });
      setProgress(65);
      setStatus('transcribing');

      // 3. 輪詢轉錄狀態（最多等 5 分鐘）
      let transcripts: TranscriptSegment[] = [];
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(
          `${backendUrl}/api/meetings/${meeting.id}/transcription-status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const statusData = await statusRes.json();
        setProgress(65 + Math.min(i, 25));

        if (statusData.status === 'completed') {
          transcripts = (statusData.segments || []).map((t: any, idx: number) => ({
            id: crypto.randomUUID(),
            speaker: t.speaker || `說話者 ${t.speakerId || '1'}`,
            speakerId: t.speakerId || '1',
            text: t.text,
            timestamp: new Date(Date.now() + idx * 1000),
            offset: t.offset,
            duration: t.duration,
            confidence: t.confidence ?? 0.9,
            language,
          }));
          break;
        }
        if (statusData.status === 'failed') {
          throw new Error('轉錄處理失敗，請確認音檔格式後重試');
        }
      }
      setProgress(92);

      // 4. 呼叫摘要
      const fullText = transcripts.map((t) => `${t.speaker}: ${t.text}`).join('\n');
      const speakers = [...new Set(transcripts.map((t) => t.speaker))];
      const sumRes = await fetch(`${backendUrl}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          meetingId: meeting.id,
          transcript: fullText,
          meetingTitle: title,
          speakers,
          templateId,
          language,
        }),
      });
      const sumData = await sumRes.json();
      setProgress(100);
      setStatus('completed');

      onSummaryReady(
        {
          markdown: sumData.summary,
          actionItems: sumData.actionItems ?? [],
          keyDecisions: sumData.keyDecisions ?? [],
          nextMeetingTopics: sumData.nextMeetingTopics ?? [],
          generatedAt: new Date().toISOString(),
          templateId,
          templateName: allTemplates.find((t) => t.id === templateId)?.name,
          language,
        },
        transcripts,
        title,
      );
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || '上傳失敗，請稍後再試');
      setProgress(0);
    }
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setStatus('idle');
    setProgress(0);
    setErrorMsg('');
  };

  const statusLabel: Record<UploadStatus, string> = {
    idle: '',
    uploading: '上傳中...',
    transcribing: 'AI 語音轉錄中...',
    completed: '完成！',
    error: '處理失敗',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-2xl">📁</span> 上傳音檔
      </h2>

      {status === 'completed' ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-gray-700 font-medium mb-1">轉錄與摘要已完成</p>
          <p className="text-sm text-gray-400 mb-4">請查看右側摘要面板</p>
          <button onClick={reset} className="px-4 py-2 text-sm bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition">
            上傳另一個音檔
          </button>
        </div>
      ) : (
        <>
          {/* 拖曳上傳區域 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4 ${
              isDragOver
                ? 'border-indigo-400 bg-indigo-50'
                : file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <div className="text-3xl mb-2">🎵</div>
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 text-xs text-red-400 hover:text-red-600"
                >
                  移除
                </button>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-3 text-gray-300">📂</div>
                <p className="text-gray-500 font-medium">拖曳音檔到此，或點擊選擇</p>
                <p className="text-xs text-gray-400 mt-1">
                  支援 MP3、WAV、MP4、M4A、OGG、FLAC（最大 {MAX_FILE_MB}MB）
                </p>
              </>
            )}
          </div>

          {/* 設定 */}
          <div className="space-y-3 mb-4">
            <input
              type="text"
              placeholder="會議標題（必填）..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={status !== 'idle'}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">語言</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
                  disabled={status !== 'idle'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
                >
                  {SPEECH_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">摘要範本</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={status !== 'idle'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
                >
                  {allTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 進度條 */}
          {status !== 'idle' && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{statusLabel[status]}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    status === 'error' ? 'bg-red-400' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !title.trim() || status !== 'idle'}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {status === 'idle' ? '開始轉錄與摘要' : statusLabel[status]}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            音檔將上傳至 Azure Blob Storage 進行安全處理
          </p>
        </>
      )}
    </div>
  );
};

export default AudioUploadPanel;
