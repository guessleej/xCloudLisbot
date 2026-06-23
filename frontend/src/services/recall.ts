// Recall.ai online-meeting bot API client.
// The backend dispatches a bot to join Zoom/Meet/Teams calls and ingests the
// transcript. Pass the JWT from useAuth().getToken().

import { SpeechLanguage } from '../types';

const BACKEND_URL = (): string => process.env.REACT_APP_BACKEND_URL || '';

// Languages recall.ai cannot transcribe — keep these on the Azure Speech track.
export const RECALL_UNSUPPORTED_LANGUAGES: SpeechLanguage[] = ['nan-TW', 'hak-TW'];

export interface DispatchBotParams {
  meetingUrl: string;
  title?: string;
  language?: SpeechLanguage;
  meetingId?: string;
  joinAt?: string; // ISO datetime — schedule the bot to join later
}

export interface DispatchBotResult {
  meetingId: string;
  botId: string;
  status: string;
}

export interface RecallStatus {
  meetingId: string;
  botId: string | null;
  recallStatus: string | null;
  liveStatus: string | null;
  status: string;
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body.data as T;
}

export async function dispatchBot(token: string, params: DispatchBotParams): Promise<DispatchBotResult> {
  const res = await fetch(`${BACKEND_URL()}/api/recall/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      meeting_url: params.meetingUrl,
      title: params.title,
      language: params.language,
      meeting_id: params.meetingId,
      join_at: params.joinAt,
    }),
  });
  return parse<DispatchBotResult>(res);
}

export async function getRecallStatus(token: string, meetingId: string): Promise<RecallStatus> {
  const res = await fetch(`${BACKEND_URL()}/api/recall/meetings/${meetingId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parse<RecallStatus>(res);
}

// Re-pull this meeting's transcript from Recall and re-parse it (idempotent).
export async function reingestTranscript(token: string, meetingId: string): Promise<{ segments: number }> {
  const res = await fetch(`${BACKEND_URL()}/api/recall/meetings/${meetingId}/reingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parse<{ segments: number }>(res);
}
