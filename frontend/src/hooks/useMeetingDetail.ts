import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { TranscriptSegment, MeetingSummary } from '../types';

export interface MeetingDetail {
  id: string;
  userId: string;
  title: string;
  mode: string;
  language: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  audioUrl: string | null;
  transcripts: TranscriptSegment[];
  summary: MeetingSummary | null;
}

export function useMeetingDetail(meetingId: string | undefined) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MeetingDetail>(`/api/meetings/${meetingId}`);
      // Ensure transcript timestamps are Date objects
      if (data.transcripts) {
        data.transcripts = data.transcripts.map(t => ({
          ...t,
          timestamp: new Date(t.timestamp),
        }));
      }
      setMeeting(data);
    } catch (err: any) {
      setError(err.message || '載入會議詳情失敗');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const updateTitle = useCallback(async (newTitle: string) => {
    if (!meetingId) return;
    await api.patch(`/api/meetings/${meetingId}`, { title: newTitle });
    setMeeting(prev => prev ? { ...prev, title: newTitle } : prev);
  }, [meetingId]);

  return { meeting, loading, error, refetch: fetchDetail, updateTitle };
}
