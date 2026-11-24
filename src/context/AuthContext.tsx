import React, { createContext, useCallback, useContext, useState } from 'react';
import type { UserDTO } from '../types';
import { useTheme } from './ThemeContext';

interface AuthContextValue {
  user: UserDTO | null;
  token: string | null;
  setSession: (token: string, user: UserDTO) => void;
  updateUserState: (user: UserDTO) => void;
  logout: () => Promise<void>;
  refreshMe: () => Promise<UserDTO | null>;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Hold Bearer token strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserDTO | null>(null);
  const { setTheme } = useTheme();

  const setSession = useCallback(
    (nextToken: string, nextUser: UserDTO) => {
      setToken(nextToken);
      setUser(nextUser);
      if (nextUser.themePreference) {
        setTheme(nextUser.themePreference);
      }
    },
    [setTheme]
  );

  const updateUserState = useCallback((nextUser: UserDTO) => {
    setUser(nextUser);
  }, []);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
      }
      const res = await fetch(url, { ...init, headers });
      if (res.status === 401 && token) {
        setToken(null);
        setUser(null);
      }
      return res;
    },
    [token]
  );

  const refreshMe = useCallback(async (): Promise<UserDTO | null> => {
    if (!token) return null;
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setToken(null);
      setUser(null);
      return null;
    }
    const data = (await res.json()) as { user: UserDTO };
    setUser(data.user);
    return data.user;
  }, [token]);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore network errors during logout
      }
    }
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ user, token, setSession, updateUserState, logout, refreshMe, apiFetch }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
