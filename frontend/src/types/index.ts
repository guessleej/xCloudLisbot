// ==================== 使用者 ====================
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'microsoft' | 'google' | 'github' | 'apple';
  createdAt: string;
}

// ==================== 逐字稿 ====================
export interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  timestamp: Date;
  offset?: number;   // 毫秒，從錄音開始計算
  duration?: number; // 毫秒
  confidence: number;
}

// ==================== 待辦事項 ====================
export interface ActionItem {
  task: string;
  assignee: string;
  priority: '高' | '中' | '低';
  deadline: string | null;
  category: '技術' | '業務' | '行政' | '其他';
}

// ==================== 會議摘要 ====================
export interface MeetingSummary {
  markdown: string;
  actionItems: ActionItem[];
  keyDecisions: string[];
  nextMeetingTopics: string[];
  generatedAt: string;
}

// ==================== 會議 ====================
export type MeetingStatus = 'idle' | 'recording' | 'processing' | 'completed';

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  startTime: string;
  endTime?: string;
  status: MeetingStatus;
  audioUrl?: string;
  transcripts: TranscriptSegment[];
  summary?: MeetingSummary;
}

// ==================== WebSocket 訊息 ====================
export type WsMessageType = 'config' | 'transcript' | 'error' | 'done';

export interface WsConfigMessage {
  type: 'config';
  language: string;
  enableDiarization: boolean;
  meetingId: string;
}

export interface WsTranscriptMessage {
  type: 'transcript';
  speakerId: string;
  text: string;
  confidence: number;
  offset: number;
  duration: number;
}

export interface WsErrorMessage {
  type: 'error';
  message: string;
}

export type WsMessage = WsConfigMessage | WsTranscriptMessage | WsErrorMessage;

// ==================== API 回應 ====================
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface SummarizeRequest {
  meetingId: string;
  transcript: string;
  meetingTitle: string;
  speakers: string[];
}

export interface SummarizeResponse {
  summary: string;
  actionItems: ActionItem[];
  keyDecisions: string[];
  nextMeetingTopics: string[];
}
