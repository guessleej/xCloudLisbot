import { getStoredAuth } from './auth';
import type { ExtMeeting } from './types';

const BACKEND_URL: string = process.env.BACKEND_URL || '';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = await getStoredAuth();
  if (!auth) throw new Error('Not authenticated');

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      ...(options.headers as Record<string, string> ?? {}),
    },
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getRecentMeetings(limit = 5): Promise<ExtMeeting[]> {
  const data = await apiFetch<{ data: ExtMeeting[] }>(`/api/meetings?limit=${limit}`);
  return data.data ?? [];
}

export async function getActiveMeetings(): Promise<ExtMeeting[]> {
  const data = await apiFetch<{ data: ExtMeeting[] }>('/api/meetings?status=recording&limit=1');
  return data.data ?? [];
}
