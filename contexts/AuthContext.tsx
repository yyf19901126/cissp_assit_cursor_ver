'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ═══════════════════ 类型 ═══════════════════

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AISettings {
  api_key: string;
  base_url: string;
  model: string;
  verified: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  aiSettings: AISettings;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  register: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateAISettings: (settings: Partial<AISettings>) => Promise<{ error?: string }>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
}

// ═══════════════════ 默认值 ═══════════════════

export const DEFAULT_AI_SETTINGS: AISettings = {
  api_key: '',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  verified: false,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  aiSettings: DEFAULT_AI_SETTINGS,
  loading: true,
  login: async () => ({}),
  register: async () => ({}),
  logout: async () => {},
  updateAISettings: async () => ({}),
  refreshUser: async () => {},
  isAdmin: false,
});

// ═══════════════════ Provider ═══════════════════

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [aiSettings, setAISettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // 检查认证状态
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        if (data.ai_settings) {
          setAISettings(data.ai_settings);
        }
      } else {
        setUser(null);
        setAISettings(DEFAULT_AI_SETTINGS);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setUser(data.user);
        if (data.ai_settings) {
          setAISettings(data.ai_settings);
        }
        router.push('/dashboard');
        return {};
      }

      return { error: data.error || '登录失败' };
    } catch (err: any) {
      return { error: err.message || '网络错误' };
    }
  }, [router]);

  // 注册
  const register = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setUser(data.user);
        router.push('/dashboard');
        return {};
      }

      return { error: data.error || '注册失败' };
    } catch (err: any) {
      return { error: err.message || '网络错误' };
    }
  }, [router]);

  // 退出登录
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {} finally {
      setUser(null);
      setAISettings(DEFAULT_AI_SETTINGS);
      router.push('/login');
    }
  }, [router]);

  // 更新 AI 设置
  const updateAISettings = useCallback(async (settings: Partial<AISettings>) => {
    try {
      const res = await fetch('/api/auth/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        const data = await res.json();
        setAISettings(data.ai_settings);
        return {};
      }

      const data = await res.json();
      return { error: data.error || '保存失败' };
    } catch (err: any) {
      return { error: err.message || '网络错误' };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        aiSettings,
        loading,
        login,
        register,
        logout,
        updateAISettings,
        refreshUser,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════ Hook ═══════════════════

export function useAuth() {
  return useContext(AuthContext);
}
