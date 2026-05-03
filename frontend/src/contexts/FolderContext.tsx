import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const BUILTIN: readonly string[] = ['計劃會議', '客戶會議', '銷售討論'];
const LS_KEY = 'xmeet_custom_folders';

interface FolderContextValue {
  folders: string[];
  isBuiltin: (name: string) => boolean;
  addFolder: (name: string) => boolean;
  renameFolder: (old: string, next: string) => boolean;
  removeFolder: (name: string) => void;
}

const FolderContext = createContext<FolderContextValue | null>(null);

export const FolderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, getToken } = useAuth();
  const [custom, setCustom] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  });

  // Skip first sync to avoid PUT on initial load from API
  const syncedFromApi = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On login: fetch custom folders from backend
  useEffect(() => {
    if (!user) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    getToken().then(token => {
      if (!token) return;
      fetch(`${backendUrl}/api/users/me/folders`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(body => {
          if (body?.data && Array.isArray(body.data)) {
            syncedFromApi.current = true;
            setCustom(body.data);
          }
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sync to localStorage on every change
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(custom));
  }, [custom]);

  // Debounced PUT to backend (skip first set from API response)
  useEffect(() => {
    if (!user) return;
    if (syncedFromApi.current) {
      // this change came from the API fetch itself — skip PUT
      syncedFromApi.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      const token = await getToken();
      if (!token) return;
      fetch(`${backendUrl}/api/users/me/folders`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders: custom }),
      }).catch(() => {});
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom]);

  const folders = React.useMemo(() => [...BUILTIN, ...custom], [custom]);

  const isBuiltin = useCallback((name: string) => BUILTIN.includes(name), []);

  const addFolder = useCallback((name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setCustom(c => {
      if ([...BUILTIN, ...c].includes(trimmed)) return c;
      return [...c, trimmed];
    });
    return true;
  }, []);

  const renameFolder = useCallback((old: string, next: string): boolean => {
    const trimmed = next.trim();
    if (!trimmed) return false;
    setCustom(c => {
      if ([...BUILTIN, ...c].includes(trimmed)) return c;
      return c.map(f => f === old ? trimmed : f);
    });
    return true;
  }, []);

  const removeFolder = useCallback((name: string) => {
    setCustom(c => c.filter(f => f !== name));
  }, []);

  return (
    <FolderContext.Provider value={{ folders, isBuiltin, addFolder, renameFolder, removeFolder }}>
      {children}
    </FolderContext.Provider>
  );
};

export const useFolders = () => {
  const ctx = useContext(FolderContext);
  if (!ctx) throw new Error('useFolders must be used within FolderProvider');
  return ctx;
};
