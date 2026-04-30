// ==================== 使用者 ====================
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'microsoft' | 'google' | 'github' | 'apple' | 'local';
  createdAt: string;
}

// ==================== 語言設定 ====================
export type SpeechLanguage =
  | 'zh-TW'    // 繁體中文（台灣普通話）
  | 'nan-TW'   // 台語（閩南語）
  | 'hak-TW'   // 客語
  | 'en-US'    // 英文
  | 'ja-JP'    // 日文
  | 'zh-CN'    // 簡體中文
  | 'auto';    // 自動偵測

export const SPEECH_LANGUAGES: { code: SpeechLanguage; label: string; flag: string; note?: string }[] = [
  { code: 'zh-TW',  label: '繁體中文',     flag: '🇹🇼' },
  { code: 'nan-TW', label: '台語（閩南語）', flag: '🇹🇼', note: '需啟用自訂模型' },
  { code: 'hak-TW', label: '客語',          flag: '🇹🇼', note: '需啟用自訂模型' },
  { code: 'en-US',  label: 'English',       flag: '🇺🇸' },
  { code: 'ja-JP',  label: '日本語',        flag: '🇯🇵' },
  { code: 'zh-CN',  label: '简体中文',      flag: '🇨🇳' },
  { code: 'auto',   label: '自動偵測',      flag: '🌐' },
];

// ==================== 會議模式 ====================
export type MeetingMode =
  | 'meeting'     // 一般會議
  | 'interview'   // 訪談/面試
  | 'brainstorm'  // 腦力激盪
  | 'lecture'     // 課堂/演講
  | 'standup'     // 站立會議
  | 'review'      // 審查會議
  | 'client';     // 客戶會議

export const MEETING_MODES: { id: MeetingMode; label: string; icon: string; description: string }[] = [
  { id: 'meeting',    label: '一般會議',   icon: '🏢', description: '標準企業會議記錄' },
  { id: 'interview',  label: '訪談/面試',  icon: '🎤', description: 'Q&A 格式訪談記錄' },
  { id: 'brainstorm', label: '腦力激盪',   icon: '💡', description: '創意討論整理' },
  { id: 'lecture',    label: '課堂/演講',  icon: '📚', description: '教學或演講重點記錄' },
  { id: 'standup',    label: '站立會議',   icon: '🏃', description: '快速進度更新（每日同步）' },
  { id: 'review',     label: '審查會議',   icon: '🔍', description: '工作成果審查與反饋' },
  { id: 'client',     label: '客戶會議',   icon: '🤝', description: '客戶溝通需求確認' },
];

// ==================== 摘要範本 ====================
export interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  isBuiltIn: boolean;
  systemPromptOverride?: string;  // 自訂範本的 GPT 提示
  createdAt?: string;
}

export const BUILTIN_TEMPLATES: SummaryTemplate[] = [
  {
    id: 'standard',       name: '標準會議記錄',  icon: '📋',
    description: '通用企業會議記錄，包含摘要、決議、行動項目',  isBuiltIn: true,
  },
  {
    id: 'action_focused', name: '行動導向摘要',  icon: '✅',
    description: '強調待辦事項與負責人，適合執行導向的會議',    isBuiltIn: true,
  },
  {
    id: 'decision_log',   name: '決策紀錄',      icon: '⚖️',
    description: '聚焦於會議中做出的決定及背景原因',           isBuiltIn: true,
  },
  {
    id: 'brainstorm',     name: '腦力激盪整理',  icon: '💡',
    description: '將創意想法依主題分類，保留所有討論脈絡',      isBuiltIn: true,
  },
  {
    id: 'interview',      name: '訪談摘要',      icon: '🎙️',
    description: 'Q&A 格式，整理採訪或面試的核心內容',         isBuiltIn: true,
  },
  {
    id: 'lecture',        name: '學習筆記',      icon: '📚',
    description: '整理課程或演講的重點、例子和問答',            isBuiltIn: true,
  },
  {
    id: 'client',         name: '客戶會議報告',  icon: '🤝',
    description: '面向客戶的需求確認和下一步行動',              isBuiltIn: true,
  },
];

// ==================== 專業術語辭典 ====================
export interface TermEntry {
  original: string;   // 原始詞
  preferred: string;  // 偏好轉錄詞
  category?: string;
}

export interface TermDictionary {
  id?: string;
  name: string;
  description?: string;
  terms: TermEntry[];
  isActive: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ==================== 逐字稿 ====================
export interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  timestamp: Date;
  offset?: number;    // 毫秒
  duration?: number;  // 毫秒
  confidence: number;
  language?: string;  // 偵測到的語言
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
  templateId?: string;
  templateName?: string;
  language?: SpeechLanguage;
}

// ==================== 會議模式設定 ====================
export interface MeetingConfig {
  title: string;
  language: SpeechLanguage;
  mode: MeetingMode;
  templateId: string;
  terminologyIds: string[];
  maxSpeakers: number;
  enablePunctuation: boolean;
}

export const DEFAULT_MEETING_CONFIG: MeetingConfig = {
  title: '',
  language: 'zh-TW',
  mode: 'meeting',
  templateId: 'standard',
  terminologyIds: [],
  maxSpeakers: 8,
  enablePunctuation: true,
};

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
  mode?: MeetingMode;
  language?: SpeechLanguage;
  isShared?: boolean;
  sharedBy?: string;
  sharedByName?: string;
}

// ==================== 音檔上傳 ====================
export type UploadStatus = 'idle' | 'uploading' | 'transcribing' | 'completed' | 'error';

export interface AudioUploadState {
  file: File | null;
  meetingId?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

// ==================== 行事曆 ====================
export type CalendarProvider = 'microsoft';

export interface CalendarConnection {
  provider: CalendarProvider;
  connected: boolean;
  email?: string;
  expiresAt?: string;
}

export interface CalendarAttendee {
  name?: string;
  email: string;
  status?: 'accepted' | 'declined' | 'tentative' | 'none';
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees: CalendarAttendee[];
  description?: string;
  location?: string;
  provider: CalendarProvider;
  meetingUrl?: string;
  isAllDay?: boolean;
  isOnline?: boolean;
}

// ==================== 團隊協作 ====================
export type SharePermission = 'view' | 'edit';

export interface ShareMember {
  email: string;
  name?: string;
  permission: SharePermission;
  sharedAt: string;
}

export interface MeetingShare {
  meetingId: string;
  members: ShareMember[];
}

// ==================== WebSocket 訊息 ====================
export type WsMessageType = 'config' | 'transcript' | 'error' | 'done' | 'status';

export interface WsConfigMessage {
  type: 'config';
  language: SpeechLanguage;
  enableDiarization: boolean;
  meetingId: string;
  mode?: MeetingMode;
  maxSpeakers?: number;
  terminology?: string[];  // 術語詞彙列表，注入 Azure Speech PhraseList
}

export interface WsTranscriptMessage {
  type: 'transcript';
  speakerId: string;
  text: string;
  confidence: number;
  offset: number;
  duration: number;
  language?: string;
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
  templateId?: string;
  mode?: MeetingMode;
  language?: SpeechLanguage;
}

export interface SummarizeResponse {
  summary: string;
  actionItems: ActionItem[];
  keyDecisions: string[];
  nextMeetingTopics: string[];
  templateId?: string;
  templateName?: string;
}
