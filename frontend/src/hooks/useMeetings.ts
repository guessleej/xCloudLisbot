import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export interface MeetingListItem {
  id: string;
  userId: string;
  title: string;
  mode: string;
  language: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  audioUrl: string | null;
  snippetText: string | null;
  hasSummary: boolean;
  transcriptCount: number;
}

interface MeetingsResponse {
  meetings: MeetingListItem[];
}

export function useMeetings() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MeetingsResponse>('/api/meetings');
      setMeetings(data.meetings);
    } catch (err: any) {
      setError(err.message || '載入會議列表失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  return { meetings, loading, error, refetch: fetchMeetings };
}
