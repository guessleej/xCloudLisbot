import type { StoredAuth, ExtUser } from './types';

const KEY = 'xmeet_auth';

export function getStoredAuth(): Promise<StoredAuth | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY], (result) => {
      const auth = result[KEY] as StoredAuth | undefined;
      if (!auth || Date.now() > auth.expiresAt) {
        resolve(null);
      } else {
        resolve(auth);
      }
    });
  });
}

export function storeAuth(token: string, user: ExtUser, expiresIn = 3600): Promise<void> {
  const auth: StoredAuth = {
    accessToken: token,
    user,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [KEY]: auth }, resolve);
  });
}

export function clearAuth(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([KEY], resolve);
  });
}
