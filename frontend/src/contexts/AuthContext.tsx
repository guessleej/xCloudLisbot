import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { PublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { User } from '../types';

// ==================== MSAL 設定 ====================
export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
});

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

  // 初始化：從 sessionStorage 恢復登入狀態
  useEffect(() => {
    const savedToken = sessionStorage.getItem('app_token');
    const savedUser = sessionStorage.getItem('app_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  // 儲存登入狀態
  const saveSession = useCallback((t: string, u: User) => {
    sessionStorage.setItem('app_token', t);
    sessionStorage.setItem('app_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  // OAuth callback 處理（Google / GitHub / Apple 共用 popup 模式）
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

  // Microsoft 登入 (MSAL)
  const loginWithMicrosoft = useCallback(async () => {
    try {
      const result = await msalInstance.loginPopup({
        scopes: ['openid', 'profile', 'User.Read'],
      });
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/callback/microsoft`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: result.accessToken }),
        }
      );
      const data = await response.json();
      saveSession(data.token, data.user);
    } catch (err) {
      console.error('Microsoft login error:', err);
    }
  }, [saveSession]);

  // Google / GitHub / Apple：開啟 popup 視窗
  const openOAuthPopup = useCallback((provider: string) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const popup = window.open(
      `${backendUrl}/api/auth/login/${provider}`,
      `${provider}_oauth`,
      'width=500,height=600,scrollbars=yes'
    );
    if (!popup) alert('請允許彈出視窗以完成登入');
  }, []);

  const loginWithGoogle = useCallback(() => openOAuthPopup('google'), [openOAuthPopup]);
  const loginWithGitHub = useCallback(() => openOAuthPopup('github'), [openOAuthPopup]);
  const loginWithApple = useCallback(() => openOAuthPopup('apple'), [openOAuthPopup]);

  // Dev login (development only)
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

  // 登出
  const logout = useCallback(async () => {
    sessionStorage.removeItem('app_token');
    sessionStorage.removeItem('app_user');
    setToken(null);
    setUser(null);
    if (user?.provider === 'microsoft') {
      await msalInstance.logoutPopup();
    }
  }, [user]);

  // 取得 App JWT Token（所有 provider 統一回傳 app_token）
  const getToken = useCallback(async (): Promise<string | null> => {
    return token;
  }, [token]);

  // 取得 Microsoft Graph API token（僅用於行事曆等 Graph API 呼叫）
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
      } catch {
        return null;
      }
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

// ==================== Hook ====================
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
