import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
    <div className="max-w-[640px] mx-auto px-4 py-6">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-stone-500 hover:text-stone-900 transition-colors inline-flex items-center gap-1 mb-4 min-h-0 min-w-0"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        返回
      </button>
      <h1 className="text-[22px] font-semibold text-stone-900 tracking-tight mb-5">上傳音檔</h1>
      <AudioUploadPanel customTemplates={customTemplates} onSummaryReady={handleUploadDone} />
    </div>
  );
};

export default UploadPage;
