import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { PublicClientApplication, AccountInfo, BrowserAuthError } from '@azure/msal-browser';
import { User } from '../types';

// ==================== MSAL 設定 ====================
export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true },
});

// Module-level initialization: MUST complete before any MSAL interaction
// This resolves race conditions where loginRedirect is called before handleRedirectPromise
const msalReady = msalInstance.initialize().then(() => {
  return msalInstance.handleRedirectPromise();
});

// ==================== Context 型別 ====================
interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  loginWithMicrosoft: () => Promise<void>;
  loginWithGoogle: () => void;
  loginWithGitHub: () => void;
  loginWithDev: (email?: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  getMsalToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ==================== Provider ====================
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initDone = useRef(false);

  const saveSession = useCallback((t: string, u: User) => {
    localStorage.setItem('app_token', t);
    localStorage.setItem('app_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  // Exchange MSAL access token for app JWT via backend
  const exchangeMsalToken = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/callback/microsoft`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        }
      );
      const data = await response.json();
      if (data.token && data.user) {
        saveSession(data.token, data.user);
      }
    } catch (err) {
      console.error('Token exchange error:', err);
    }
  }, [saveSession]);

  // Initialize: restore session + handle MSAL redirect result
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      // 0. Handle OAuth callback from Google/GitHub redirect (token in URL fragment)
      if (window.location.pathname === '/auth/callback' && window.location.hash) {
        try {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const cbToken = params.get('token');
          const cbUser = params.get('user');
          if (cbToken && cbUser) {
            const parsedUser = JSON.parse(cbUser);
            saveSession(cbToken, parsedUser);
            // Clean up URL
            window.history.replaceState({}, '', '/');
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('OAuth callback parse error:', e);
        }
      }

      // 1. Restore saved session
      const savedToken = localStorage.getItem('app_token');
      const savedUser = localStorage.getItem('app_user');
      const hasSavedSession = savedToken && savedUser;

      if (hasSavedSession) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }

      // 2. Handle MSAL redirect result (login OR calendar consent)
      try {
        const result = await msalReady;
        if (result?.accessToken) {
          // Check if this was a calendar consent redirect
          const pendingCalendar = sessionStorage.getItem('pending_calendar_connect');
          if (pendingCalendar && hasSavedSession) {
            // Calendar consent redirect — save the calendar token to backend
            sessionStorage.removeItem('pending_calendar_connect');
            try {
              await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/calendar/microsoft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
                body: JSON.stringify({ accessToken: result.accessToken }),
              });
            } catch (e) {
              console.warn('Calendar token save failed:', e);
            }
          } else if (!hasSavedSession) {
            // Login redirect — exchange for app JWT
            await exchangeMsalToken(result.accessToken);
          }
        }
      } catch (err) {
        console.warn('MSAL redirect handling:', err);
        clearMsalState();
      }

      setIsLoading(false);
    };

    init();
  }, [exchangeMsalToken]);

  // OAuth callback (Google / GitHub / Apple redirect return)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth_callback') {
        saveSession(event.data.token, event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [saveSession]);

  // Microsoft login: always use redirect (most reliable across all browsers/devices)
  const loginWithMicrosoft = useCallback(async () => {
    const loginRequest = {
      scopes: ['openid', 'profile', 'User.Read'],
      prompt: 'select_account' as const,
    };

    try {
      // Ensure MSAL is fully initialized and redirect promise is resolved
      await msalReady;
      await msalInstance.loginRedirect(loginRequest);
    } catch (err: any) {
      if (err instanceof BrowserAuthError && err.errorCode === 'interaction_in_progress') {
        // Clear stuck state and retry automatically
        clearMsalState();
        try {
          await msalInstance.loginRedirect(loginRequest);
        } catch (retryErr) {
          console.error('Microsoft login retry failed:', retryErr);
        }
      } else if (err.errorCode === 'user_cancelled') {
        // User cancelled — do nothing
      } else {
        console.error('Microsoft login error:', err);
      }
    }
  }, []);

  const openOAuthPopup = useCallback((provider: string) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    // Use full page redirect for all devices (more reliable than popup)
    window.location.href = `${backendUrl}/api/auth/login/${provider}`;
  }, []);

  const loginWithGoogle = useCallback(() => openOAuthPopup('google'), [openOAuthPopup]);
  const loginWithGitHub = useCallback(() => openOAuthPopup('github'), [openOAuthPopup]);

  const loginWithDev = useCallback(async (email = 'dev@localhost', name = 'Dev User') => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backendUrl}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) throw new Error('Dev login failed');
      const data = await res.json();
      saveSession(data.token, data.user);
    } catch (err) {
      console.error('Dev login error:', err);
    }
  }, [saveSession]);

  const logout = useCallback(async () => {
    localStorage.removeItem('app_token');
    localStorage.removeItem('app_user');
    clearMsalState();
    setToken(null);
    setUser(null);
    if (user?.provider === 'microsoft') {
      try {
        await msalInstance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
      } catch { /* ignore */ }
    }
  }, [user]);

  const getToken = useCallback(async (): Promise<string | null> => {
    return token;
  }, [token]);

  const getMsalToken = useCallback(async (): Promise<string | null> => {
    if (user?.provider !== 'microsoft') return null;
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      try {
        const result = await msalInstance.acquireTokenSilent({
          scopes: ['openid', 'profile', 'User.Read', 'Calendars.Read'],
          account: accounts[0] as AccountInfo,
        });
        return result.accessToken;
      } catch { return null; }
    }
    return null;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user, token, isLoading,
        loginWithMicrosoft, loginWithGoogle, loginWithGitHub, loginWithDev,
        logout, getToken, getMsalToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ==================== Helper ====================
// Only clears MSAL interaction-in-progress / stuck states, NOT cached accounts.
// MSAL cached accounts live in localStorage (cacheLocation: 'localStorage')
// and must be preserved for silent SSO on next visit.
function clearMsalState() {
  const clearStuck = (store: Storage) => {
    Object.keys(store).forEach(key => {
      // Only clear interaction state flags, preserve cached accounts/tokens
      if (key.includes('interaction.status') || key.includes('request.state')) {
        store.removeItem(key);
      }
    });
  };
  clearStuck(sessionStorage);
  clearStuck(localStorage);
}
