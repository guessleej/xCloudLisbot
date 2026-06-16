import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  PublicClientApplication,
  Configuration,
  AccountInfo,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import { User } from '../types';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID || 'placeholder-client-id',
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'localStorage' },
};

export const msalInstance = new PublicClientApplication(msalConfig);

let msalInitialized = false;
const ensureMsal = async () => {
  if (!msalInitialized) {
    await msalInstance.initialize();
    msalInitialized = true;
  }
};

// Parse JWT exp claim (seconds) without a library
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenFresh(token: string): boolean {
  const exp = jwtExpiry(token);
  if (exp === null) return true; // non-JWT (MSAL token) — treat as valid
  return exp * 1000 > Date.now() + 60_000; // 1-min buffer
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
  getToken: () => Promise<string>;
  getMSGraphToken: () => Promise<string>;
  loginWithMicrosoft: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'lisbot_user';
const TOKEN_KEY = 'lisbot_token';
const BACKEND_URL = () => process.env.REACT_APP_BACKEND_URL || '';

async function exchangeMsalToken(msalAccessToken: string): Promise<{ token: string; user: User } | null> {
  try {
    const res = await fetch(`${BACKEND_URL()}/api/auth/microsoft/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: msalAccessToken }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const token: string | undefined = body.data?.token;
    const user: User | undefined = body.data?.user;
    if (token && user) return { token, user };
    return null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached && isTokenFresh(cached)) return cached;

    // Token missing or expired — try MSAL silent refresh → re-exchange
    if (cached) localStorage.removeItem(TOKEN_KEY);

    try {
      await ensureMsal();
      const accounts = msalInstance.getAllAccounts();
      if (!accounts.length) return '';
      const result = await msalInstance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: accounts[0] as AccountInfo,
      });
      const exchanged = await exchangeMsalToken(result.accessToken);
      if (exchanged) {
        localStorage.setItem(TOKEN_KEY, exchanged.token);
        return exchanged.token;
      }
      // Backend unreachable — return raw MSAL token as fallback
      return result.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        logout();
      }
      return '';
    }
  }, [logout]);

  // Acquire a Microsoft Graph token with Files.ReadWrite scope for OneDrive uploads
  const getMSGraphToken = useCallback(async (): Promise<string> => {
    try {
      await ensureMsal();
      const accounts = msalInstance.getAllAccounts();
      if (!accounts.length) return '';
      const result = await msalInstance.acquireTokenSilent({
        scopes: ['Files.ReadWrite'],
        account: accounts[0] as AccountInfo,
      });
      return result.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        try {
          const result = await msalInstance.acquireTokenPopup({ scopes: ['Files.ReadWrite'] });
          return result.accessToken;
        } catch {
          return '';
        }
      }
      return '';
    }
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const loginWithMicrosoft = useCallback(async () => {
    try {
      await ensureMsal();
      const result = await msalInstance.loginPopup({
        scopes: ['User.Read'],
      });
      if (!result.account) return;

      const exchanged = await exchangeMsalToken(result.accessToken);
      const u: User = exchanged?.user ?? {
        id: result.account.localAccountId,
        email: result.account.username,
        name: result.account.name || result.account.username,
        provider: 'microsoft',
        createdAt: new Date().toISOString(),
      };

      if (exchanged?.token) {
        localStorage.setItem(TOKEN_KEY, exchanged.token);
      }
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
    } catch (e: any) {
      if (e?.errorCode !== 'user_cancelled') {
        console.error('Microsoft login failed:', e);
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, getToken, getMSGraphToken, loginWithMicrosoft, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
