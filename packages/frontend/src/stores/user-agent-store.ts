"use client";

import { create } from "zustand";
import type { UserAgent } from "@agenthub/shared";
import { MAIN_AGENT, MAIN_AGENT_ID, AVATAR_COLORS } from "@agenthub/shared";

const STORAGE_KEY = "agenthub-user-agents";

function loadFromStorage(): UserAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(agents: UserAgent[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(agents)); } catch {}
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agenthub-auth-token");
}

// 将服务端 DB 记录映射为前端 UserAgent 格式
function mapServerAgent(raw: {
  id: string; name: string; type: string; config: string; permissions: string;
  status?: string; createdAt?: string | Date; updatedAt?: string | Date;
}): UserAgent {
  let config: { model?: string; systemPrompt?: string; apiKeyRef?: string; baseURL?: string } = {};
  try { config = JSON.parse(raw.config); } catch {}

  const agentTypes = ["planner", "worker", "critic", "researcher", "refiner", "coder", "reviewer", "browser"];
  const role = agentTypes.includes(raw.type) ? raw.type as UserAgent["role"] : "custom" as UserAgent["role"];

  return {
    id: raw.id,
    name: raw.name,
    avatar: "",
    avatarBg: AVATAR_COLORS[raw.name.charCodeAt(0) % AVATAR_COLORS.length],
    role,
    model: (config.model || "gpt-4o-mini") as UserAgent["model"],
    systemPrompt: config.systemPrompt || `我是 ${raw.name}`,
    tools: [],
    createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).getTime() : Date.now(),
  };
}

interface UserAgentStore {
  agents: UserAgent[];
  hydrated: boolean;
  loading: boolean;
  addAgent: (agent: Omit<UserAgent, "id" | "createdAt" | "updatedAt">) => UserAgent;
  updateAgent: (id: string, updates: Partial<UserAgent>) => void;
  removeAgent: (id: string) => void;
  getAgent: (id: string) => UserAgent | undefined;
  getAllAgents: () => UserAgent[];
  hydrate: () => Promise<void>;
}

export const useUserAgentStore = create<UserAgentStore>((set, get) => ({
  agents: [],
  hydrated: false,
  loading: false,

  addAgent: (input) => {
    const now = Date.now();
    const agent: UserAgent = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    set((s) => { const next = [...s.agents, agent]; saveToStorage(next); return { agents: next }; });
    return agent;
  },

  updateAgent: (id, updates) => {
    set((s) => {
      const next = s.agents.map((a) => a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a);
      saveToStorage(next);
      return { agents: next };
    });
  },

  removeAgent: (id) => {
    if (id === MAIN_AGENT_ID) return;
    set((s) => { const next = s.agents.filter((a) => a.id !== id); saveToStorage(next); return { agents: next }; });
  },

  getAgent: (id) => {
    if (id === MAIN_AGENT_ID) return MAIN_AGENT;
    return get().agents.find((a) => a.id === id);
  },

  getAllAgents: () => [MAIN_AGENT, ...get().agents],

  hydrate: async () => {
    if (get().hydrated) return;
    set({ loading: true });

    // 先从 localStorage 快速加载
    const local = loadFromStorage();
    if (local.length > 0) set({ agents: local });

    // 再从服务端同步（服务端为权威数据源）
    try {
      const token = getAuthToken();
      if (!token) { set({ hydrated: true, loading: false }); return; }

      const baseUrl = `${window.location.protocol}//${window.location.hostname}:3002`;
      const res = await fetch(`${baseUrl}/api/user-agents`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json() as { agents: Array<{ id: string; name: string; type: string; config: string; permissions: string; status?: string; createdAt?: string; updatedAt?: string }> };
      const serverAgents = (data.agents || []).map(mapServerAgent);

      set({ agents: serverAgents, hydrated: true, loading: false });
      saveToStorage(serverAgents);
    } catch {
      // 服务端不可用时使用本地缓存
      set({ hydrated: true, loading: false });
    }
  },
}));
