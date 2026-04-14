/**
 * Centralized API client with auth token injection.
 * Reads token directly from localStorage for cross-session persistence.
 */

const BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('app_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // User-friendly error messages — never expose HTTP status codes or technical details
    if (res.status === 401) {
      localStorage.removeItem('app_token');
      localStorage.removeItem('app_user');
      window.location.href = '/';
      throw new Error('登入已過期，請重新登入');
    }
    if (res.status === 403) {
      throw new Error('您沒有權限存取此內容');
    }
    if (res.status === 404) {
      throw new Error('找不到此內容，可能已被刪除');
    }
    if (res.status === 413) {
      throw new Error('檔案超過大小限制');
    }
    if (res.status === 429) {
      throw new Error('操作過於頻繁，請稍後再試');
    }
    throw new Error('系統發生錯誤，請稍後再試');
  }
  return res.json();
}

const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export default api;
