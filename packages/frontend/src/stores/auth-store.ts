import { create } from "zustand";
import type { AuthUser } from "@agenthub/shared";
import { useChatStore } from "./chat-store";
import { useWorkspaceStore } from "./workspace-store";

const API_URL = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3002`
  : "http://localhost:3002";

const TOKEN_KEY = "agenthub-auth-token";

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  hydrate() {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // 有 token 直接假定已登录，避免卡在加载中。后台异步验证。
      set({ token, isAuthenticated: true, isLoading: false });
      get().checkAuth().catch(() => {});
    } else {
      set({ isLoading: false });
    }
  },

  async checkAuth() {
    const { token } = get();
    if (!token) {
      set({ isAuthenticated: false, isLoading: false, user: null });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, isAuthenticated: true, isLoading: false, error: null });
      } else {
        // Token 失效但不立即登出——让用户有机会重新登录
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      clearTimeout(timeoutId);
      // 网络错误时保持已登录状态（离线容忍）
      set({ isLoading: false });
    }
  },

  async login(email: string, password: string) {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ isLoading: false, error: data.error || "Login failed" });
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : "Network error" });
    }
  },

  async register(name: string, email: string, password: string) {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ isLoading: false, error: data.error || "Registration failed" });
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : "Network error" });
    }
  },

  logout() {
    const { token } = get();
    if (token) {
      fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null, isAuthenticated: false, error: null });
    // Clear other stores on logout
    useChatStore.getState().clearSession();
    useWorkspaceStore.getState().clearWorkspace();
  },
}));
