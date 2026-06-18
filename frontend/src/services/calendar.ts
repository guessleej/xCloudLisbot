// Recall.ai Calendar V2 client. The backend runs the OAuth flow, registers the
// calendar with Recall, lists events, and schedules per-event recording bots.
// Pass the JWT from useAuth().getToken().

import { CalendarEvent } from '../types';

const BACKEND_URL = (): string => process.env.REACT_APP_BACKEND_URL || '';

export interface CalendarStatus {
  connected: boolean;
  status?: string;
  email?: string;
  autoJoinEnabled: boolean;
  autoJoinScope: 'all' | 'hosted';
}

export interface CalendarPreferences {
  autoJoinEnabled: boolean;
  autoJoinScope: 'all' | 'hosted';
}

async function parseData<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body.data as T;
}

/** Returns the Microsoft authorize URL; navigate the browser to it to connect.
 *  `returnTo` ('calendar' | 'settings') is where the backend callback lands you. */
export async function getConnectUrl(token: string, returnTo?: string): Promise<string> {
  const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/connect${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await parseData<{ url: string }>(res)).url;
}

export async function getCalendarStatus(token: string): Promise<CalendarStatus> {
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseData<CalendarStatus>(res);
}

export async function disconnectCalendar(token: string): Promise<void> {
  await fetch(`${BACKEND_URL()}/api/calendar/v2/disconnect`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listCalendarEvents(
  token: string, date: string,
): Promise<{ events: CalendarEvent[]; connected: boolean }> {
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/events?date=${date}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseData<{ events: CalendarEvent[]; connected: boolean }>(res);
}

export async function scheduleEventBot(token: string, recallEventId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/events/${recallEventId}/bot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseData(res);
}

export async function removeEventBot(token: string, recallEventId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/events/${recallEventId}/bot`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseData(res);
}

export async function saveCalendarPreferences(
  token: string, prefs: CalendarPreferences,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL()}/api/calendar/v2/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prefs),
  });
  await parseData(res);
}
