import { create } from "zustand";

export type NavKey = "dashboard" | "ai-assistant" | "chat" | "agents" | "tasks" | "projects" | "knowledge" | "files" | "contacts" | "agent-market" | "my-agents" | "mcp" | "workflows" | "settings" | "help";

interface NavigationStore {
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  hydrate: () => void;
}

const SIDEBAR_KEY = "agenthub-sidebar-collapsed";
const NAV_KEY = "agenthub-active-nav";
const VALID_NAV_KEYS: NavKey[] = ["dashboard", "ai-assistant", "chat", "agents", "tasks", "projects", "knowledge", "files", "contacts", "agent-market", "my-agents", "mcp", "workflows", "settings", "help"];

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeNav: "dashboard",
  setActiveNav: (key) => {
    set({ activeNav: key });
    if (typeof window !== "undefined") {
      localStorage.setItem(NAV_KEY, key);
    }
  },
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      }
      return { sidebarCollapsed: next };
    }),
  hydrate: () => {
    if (typeof window === "undefined") return;
    const savedCollapsed = localStorage.getItem(SIDEBAR_KEY);
    if (savedCollapsed === "true") {
      set({ sidebarCollapsed: true });
    }
    const savedNav = localStorage.getItem(NAV_KEY);
    if (savedNav === "acceptance") {
      localStorage.setItem(NAV_KEY, "dashboard");
      set({ activeNav: "dashboard" });
      return;
    }
    if (savedNav && VALID_NAV_KEYS.includes(savedNav as NavKey)) {
      set({ activeNav: savedNav as NavKey });
    }
  },
}));
