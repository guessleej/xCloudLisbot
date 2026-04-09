import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import RecordingPanel from '../components/RecordingPanel';
import TranscriptView from '../components/TranscriptView';
import {
  TranscriptSegment, MeetingConfig, DEFAULT_MEETING_CONFIG,
  SummaryTemplate, TermDictionary,
} from '../types';
import api from '../services/api';

const RecordingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig>(() => {
    const cfg = { ...DEFAULT_MEETING_CONFIG };
    const title = searchParams.get('title');
    const mode = searchParams.get('mode');
    if (title) cfg.title = title;
    if (mode) cfg.mode = mode as any;
    return cfg;
  });

  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const transcriptsRef = useRef<TranscriptSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [termDicts, setTermDicts] = useState<TermDictionary[]>([]);

  // Keep ref in sync with state to avoid stale closure in handleRecordingStop
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  // Load templates and terminology on mount
  useEffect(() => {
    api.get<{ templates: SummaryTemplate[] }>('/api/templates')
      .then(d => setCustomTemplates(d.templates?.filter(t => !t.isBuiltIn) || []))
      .catch(err => console.warn('範本載入失敗:', err.message));
    api.get<{ dicts: TermDictionary[] }>('/api/terminology')
      .then(d => setTermDicts(d.dicts || []))
      .catch(err => console.warn('術語辭典載入失敗:', err.message));
  }, []);

  const handleTranscriptUpdate = useCallback((segment: TranscriptSegment) => {
    setTranscripts(prev => [...prev, segment]);
    setIsRecording(true);
  }, []);

  const handleRecordingStop = useCallback(
    async (meetingId: string, title: string, templateId: string) => {
      setIsRecording(false);
      setIsSummarizing(true);

      // Use ref to get the latest transcripts (avoids stale closure)
      const currentTranscripts = transcriptsRef.current;

      try {
        // Step 1: Persist transcript segments to backend
        if (currentTranscripts.length > 0) {
          await api.post(`/api/meetings/${meetingId}/transcripts`, {
            segments: currentTranscripts.map(t => ({
              id: t.id,
              speaker: t.speaker,
              text: t.text,
              offset: t.offset ?? 0,
              duration: t.duration ?? 0,
              confidence: t.confidence,
            })),
          });
        }
      } catch (err) {
        console.error('逐字稿儲存失敗:', err);
        // Even if transcript save fails, still try to summarize and navigate
      }

      try {
        // Step 2: Call summarize API
        const fullText = currentTranscripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
        const speakers = [...new Set(currentTranscripts.map(t => t.speaker))];
        await api.post('/api/summarize', {
          meetingId, transcript: fullText, meetingTitle: title, speakers,
          templateId, mode: meetingConfig.mode, language: meetingConfig.language,
        });
      } catch (err) {
        console.error('摘要生成失敗:', err);
        // Transcripts are already saved — user can still view them on detail page
      } finally {
        setIsSummarizing(false);
        navigate(`/meeting/${meetingId}`);
      }
    },
    [meetingConfig, navigate]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-4">
        <button onClick={() => navigate('/')}
          className="text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
      </div>

      {isSummarizing && (
        <div className="mb-4 p-4 rounded-2xl flex items-center gap-3"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm font-medium">GPT-4 正在生成摘要...</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr,1fr] gap-6">
        <RecordingPanel
          config={meetingConfig}
          onConfigChange={setMeetingConfig}
          customTemplates={customTemplates}
          termDicts={termDicts}
          onTranscriptUpdate={handleTranscriptUpdate}
          onRecordingStop={handleRecordingStop}
        />
        <TranscriptView segments={transcripts} isRecording={isRecording} />
      </div>
    </div>
  );
};

export default RecordingPage;
