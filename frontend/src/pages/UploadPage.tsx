import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AudioUploadPanel from '../components/AudioUploadPanel';
import { SummaryTemplate, TranscriptSegment, MeetingSummary } from '../types';
import api from '../services/api';

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);

  useEffect(() => {
    api.get<{ templates: SummaryTemplate[] }>('/api/templates')
      .then(d => setCustomTemplates(d.templates?.filter(t => !t.isBuiltIn) || []))
      .catch(() => {});
  }, []);

  const handleUploadDone = (_summary: MeetingSummary, _transcripts: TranscriptSegment[], _title: string, meetingId: string) => {
    navigate(`/meeting/${meetingId}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4">
        <button onClick={() => navigate('/')}
          className="text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
      </div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">上傳音檔</h1>
      <AudioUploadPanel customTemplates={customTemplates} onSummaryReady={handleUploadDone} />
    </div>
  );
};

export default UploadPage;
