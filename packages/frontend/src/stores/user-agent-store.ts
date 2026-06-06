"use client";

import { create } from "zustand";
import type { UserAgent } from "@agenthub/shared";
import { MAIN_AGENT, MAIN_AGENT_ID, AVATAR_COLORS } from "@agenthub/shared";
import { api } from "@/lib/api-client";
import { createId } from "@/lib/id";

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

type ServerAgentRecord = {
  id: string;
  name: string;
  type: string;
  config: string;
  permissions: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toServerPayload(agent: UserAgent) {
  return {
    name: agent.name,
    type: agent.role,
    config: {
      provider: agent.provider ?? "inherit",
      baseURL: agent.baseURL,
      cliPath: agent.cliPath,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      avatar: agent.avatar,
      avatarBg: agent.avatarBg,
      tools: agent.tools,
      ...(agent.apiKey?.trim() ? { apiKey: agent.apiKey.trim() } : {}),
    },
    permissions: agent.tools,
  };
}

// 将服务端 DB 记录映射为前端 UserAgent 格式
function mapServerAgent(raw: ServerAgentRecord): UserAgent {
  const config = parseJsonObject(raw.config) as {
    model?: string;
    provider?: string;
    baseURL?: string;
    baseUrl?: string;
    cliPath?: string;
    hasApiKey?: boolean;
    apiKeyHint?: string;
    systemPrompt?: string;
    avatar?: string;
    avatarBg?: string;
    tools?: string[];
  };
  const permissions = parseJsonArray(raw.permissions);

  const agentTypes = ["planner", "worker", "critic", "researcher", "refiner", "coder", "reviewer", "browser", "frontend", "backend", "design", "custom"];
  const role = agentTypes.includes(raw.type) ? raw.type as UserAgent["role"] : "custom" as UserAgent["role"];
  const tools = Array.isArray(config.tools) && config.tools.length > 0 ? config.tools : permissions;

  return {
    id: raw.id,
    name: raw.name,
    avatar: config.avatar || "",
    avatarBg: config.avatarBg || AVATAR_COLORS[raw.name.charCodeAt(0) % AVATAR_COLORS.length],
    role,
    model: (config.model || "gpt-4o-mini") as UserAgent["model"],
    provider: (config.provider || "inherit") as UserAgent["provider"],
    baseURL: config.baseURL || config.baseUrl || "",
    cliPath: config.cliPath || "",
    hasApiKey: Boolean(config.hasApiKey),
    apiKeyHint: config.apiKeyHint || "",
    systemPrompt: config.systemPrompt || `我是 ${raw.name}`,
    tools: tools as UserAgent["tools"],
    createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).getTime() : Date.now(),
  };
}

async function syncCreateAgent(agent: UserAgent, replaceAgent: (oldId: string, next: UserAgent) => void) {
  if (!getAuthToken()) return;
  try {
    const data = await api.post<{ agent: ServerAgentRecord }>("/api/user-agents", toServerPayload(agent));
    replaceAgent(agent.id, mapServerAgent(data.agent));
  } catch {
    // Keep local optimistic copy; hydrate will reconcile when the server is available.
  }
}

async function syncUpdateAgent(agent: UserAgent, replaceAgent: (oldId: string, next: UserAgent) => void) {
  if (!getAuthToken()) return;
  try {
    const data = await api.put<{ agent: ServerAgentRecord }>(`/api/user-agents/${agent.id}`, toServerPayload(agent));
    replaceAgent(agent.id, mapServerAgent(data.agent));
  } catch {
    await syncCreateAgent(agent, replaceAgent);
  }
}

async function syncDeleteAgent(agentId: string) {
  if (!getAuthToken()) return;
  try { await api.delete<{ ok: boolean }>(`/api/user-agents/${agentId}`); } catch {}
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
    const agent: UserAgent = { ...input, id: createId(), createdAt: now, updatedAt: now };
    set((s) => { const next = [...s.agents, agent]; saveToStorage(next); return { agents: next }; });
    void syncCreateAgent(agent, (oldId, synced) => {
      set((s) => {
        const next = s.agents.map((item) => item.id === oldId ? synced : item);
        saveToStorage(next);
        return { agents: next };
      });
    });
    return agent;
  },

  updateAgent: (id, updates) => {
    let updatedAgent: UserAgent | undefined;
    set((s) => {
      const next = s.agents.map((a) => a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a);
      updatedAgent = next.find((agent) => agent.id === id);
      saveToStorage(next);
      return { agents: next };
    });
    if (updatedAgent) {
      void syncUpdateAgent(updatedAgent, (oldId, synced) => {
        set((s) => {
          const next = s.agents.map((item) => item.id === oldId ? synced : item);
          saveToStorage(next);
          return { agents: next };
        });
      });
    }
  },

  removeAgent: (id) => {
    if (id === MAIN_AGENT_ID) return;
    set((s) => { const next = s.agents.filter((a) => a.id !== id); saveToStorage(next); return { agents: next }; });
    void syncDeleteAgent(id);
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

      const data = await api.get<{ agents: ServerAgentRecord[] }>("/api/user-agents");
      const serverAgents = (data.agents || []).map(mapServerAgent);

      set({ agents: serverAgents, hydrated: true, loading: false });
      saveToStorage(serverAgents);
    } catch {
      // 服务端不可用时使用本地缓存
      set({ hydrated: true, loading: false });
    }
  },
}));
