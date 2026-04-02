import React, { useState, useCallback, useEffect } from 'react';
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
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [termDicts, setTermDicts] = useState<TermDictionary[]>([]);

  // Load templates and terminology on mount
  useEffect(() => {
    api.get<{ templates: SummaryTemplate[] }>('/api/templates')
      .then(d => setCustomTemplates(d.templates?.filter(t => !t.isBuiltIn) || []))
      .catch(() => {});
    api.get<{ dictionaries: TermDictionary[] }>('/api/terminology')
      .then(d => setTermDicts(d.dictionaries || []))
      .catch(() => {});
  }, []);

  const handleTranscriptUpdate = useCallback((segment: TranscriptSegment) => {
    setTranscripts(prev => [...prev, segment]);
    setIsRecording(true);
  }, []);

  const handleRecordingStop = useCallback(
    async (meetingId: string, title: string, templateId: string) => {
      setIsRecording(false);
      setIsSummarizing(true);
      try {
        const fullText = transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
        const speakers = [...new Set(transcripts.map(t => t.speaker))];
        await api.post('/api/summarize', {
          meetingId, transcript: fullText, meetingTitle: title, speakers,
          templateId, mode: meetingConfig.mode, language: meetingConfig.language,
        });
        navigate(`/meeting/${meetingId}`);
      } catch (err) {
        console.error('摘要生成失敗:', err);
        navigate(`/meeting/${meetingId}`);
      } finally {
        setIsSummarizing(false);
      }
    },
    [transcripts, meetingConfig, navigate]
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
