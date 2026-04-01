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
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: true },
});

// Detect mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

// ==================== Context 型別 ====================
interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  loginWithMicrosoft: () => Promise<void>;
  loginWithGoogle: () => void;
  loginWithGitHub: () => void;
  loginWithApple: () => void;
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
    sessionStorage.setItem('app_token', t);
    sessionStorage.setItem('app_user', JSON.stringify(u));
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

  // Initialize: restore session + handle MSAL redirect
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      // 1. Restore saved session
      const savedToken = sessionStorage.getItem('app_token');
      const savedUser = sessionStorage.getItem('app_user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setIsLoading(false);
        return;
      }

      // 2. Handle MSAL redirect result (mobile flow returns here after Microsoft login)
      try {
        await msalInstance.initialize();
        const result = await msalInstance.handleRedirectPromise();
        if (result?.accessToken) {
          await exchangeMsalToken(result.accessToken);
        }
      } catch (err) {
        console.warn('MSAL redirect handling:', err);
      }

      setIsLoading(false);
    };

    init();
  }, [exchangeMsalToken]);

  // OAuth callback (Google / GitHub / Apple popup)
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

  // Microsoft login: redirect on mobile, popup on desktop
  const loginWithMicrosoft = useCallback(async () => {
    const loginRequest = {
      scopes: ['openid', 'profile', 'User.Read'],
      prompt: 'select_account' as const,
    };

    try {
      if (isMobile) {
        // Mobile: use redirect (popups are blocked on mobile browsers)
        await msalInstance.loginRedirect(loginRequest);
        // Page will redirect to Microsoft login, then come back
        // handleRedirectPromise() in useEffect will pick up the token
      } else {
        // Desktop: use popup
        const result = await msalInstance.loginPopup(loginRequest);
        if (result?.accessToken) {
          await exchangeMsalToken(result.accessToken);
        }
      }
    } catch (err: any) {
      if (err instanceof BrowserAuthError && err.errorCode === 'interaction_in_progress') {
        // Clear stuck state
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.startsWith('msal.') || key.includes('interaction')) {
            sessionStorage.removeItem(key);
          }
        });
        alert('登入流程被中斷，請再試一次。');
      } else if (err.errorCode === 'user_cancelled') {
        // User cancelled
      } else {
        console.error('Microsoft login error:', err);
      }
    }
  }, [exchangeMsalToken]);

  const openOAuthPopup = useCallback((provider: string) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    if (isMobile) {
      // Mobile: use full page redirect instead of popup
      window.location.href = `${backendUrl}/api/auth/login/${provider}`;
    } else {
      const popup = window.open(
        `${backendUrl}/api/auth/login/${provider}`,
        `${provider}_oauth`,
        'width=500,height=600,scrollbars=yes'
      );
      if (!popup) alert('請允許彈出視窗以完成登入');
    }
  }, []);

  const loginWithGoogle = useCallback(() => openOAuthPopup('google'), [openOAuthPopup]);
  const loginWithGitHub = useCallback(() => openOAuthPopup('github'), [openOAuthPopup]);
  const loginWithApple = useCallback(() => openOAuthPopup('apple'), [openOAuthPopup]);

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
    sessionStorage.removeItem('app_token');
    sessionStorage.removeItem('app_user');
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('msal.') || key.includes('login') || key.includes('interaction')) {
        sessionStorage.removeItem(key);
      }
    });
    setToken(null);
    setUser(null);
    if (user?.provider === 'microsoft') {
      try {
        if (isMobile) {
          await msalInstance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
        } else {
          await msalInstance.logoutPopup({ mainWindowRedirectUri: window.location.origin });
        }
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
        loginWithMicrosoft, loginWithGoogle, loginWithGitHub, loginWithApple, loginWithDev,
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
