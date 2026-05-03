export interface ExtUser {
  id:     string;
  email:  string;
  name:   string;
  avatar?: string;
}

export interface ExtMeeting {
  id:         string;
  title:      string;
  status:     'recording' | 'processing' | 'completed' | 'error';
  created_at: string;
  duration?:  number;
}

export interface StoredAuth {
  accessToken: string;
  user:        ExtUser;
  expiresAt:   number;
}

export type MessageType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'GET_AUTH'
  | 'OPEN_APP'
  | 'OPEN_RECORDING'
  | 'OPEN_UPLOAD';

export interface ExtMessage {
  type:    MessageType;
  payload?: unknown;
}
