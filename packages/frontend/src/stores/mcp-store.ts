import { create } from "zustand";
import type { McpServerInfo } from "@agenthub/shared";

type ServerStatus = "connected" | "disconnected" | "error";

interface McpStore {
  servers: McpServerInfo[];

  setServers: (servers: McpServerInfo[]) => void;
  addServer: (server: McpServerInfo) => void;
  removeServer: (serverId: string) => void;
  updateServerStatus: (serverId: string, status: ServerStatus, tools?: string[]) => void;
}

export const useMcpStore = create<McpStore>((set) => ({
  servers: [],

  setServers(servers) { set({ servers: servers as McpServerInfo[] }); },
  addServer(server) { set((state) => ({ servers: [...state.servers, server] })); },
  removeServer(serverId) { set((state) => ({ servers: state.servers.filter((s) => s.id !== serverId) })); },
  updateServerStatus(serverId, status, tools) {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === serverId ? { ...s, status, ...(tools !== undefined ? { tools } : {}) } : s
      ),
    }));
  },
}));
