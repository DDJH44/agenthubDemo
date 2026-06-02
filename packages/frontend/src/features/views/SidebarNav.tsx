"use client";

import Image from "next/image";
import { useT } from "@/hooks/useT";
import { useNavigationStore, type NavKey } from "@/stores/navigation-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAuthStore } from "@/stores/auth-store";

const NAV_ITEMS: { key: NavKey; icon: string; section: string }[] = [
  { key: "dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", section: "main" },
  { key: "ai-assistant", icon: "M12 2a4 4 0 014 4v1h2a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z M9 12h6 M9 16h6", section: "main" },
  { key: "chat", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", section: "main" },
  { key: "tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", section: "workspace" },
  { key: "projects", icon: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z", section: "workspace" },
  { key: "knowledge", icon: "M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z", section: "workspace" },
  { key: "files", icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7", section: "workspace" },
  { key: "contacts", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75", section: "workspace" },
  { key: "agent-market", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75 M9 12a4 4 0 100-8 4 4 0 000 8z", section: "agent" },
  { key: "my-agents", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z", section: "agent" },
  { key: "workflows", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15", section: "agent" },
  { key: "mcp", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", section: "agent" },
  { key: "settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z", section: "system" },
  { key: "help", icon: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0", section: "system" },
];

const SECTIONS = [
  { key: "main", label: "主屏" },
  { key: "workspace", label: "工作空间" },
  { key: "agent", label: "智能体" },
  { key: "system", label: "系统" },
];

function NavIcon({ path, active }: { path: string; active: boolean }) {
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors"
      style={{
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-tertiary)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  );
}

function NavItemButton({ item, activeNav, setActiveNav, t }: {
  item: { key: NavKey; icon: string };
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  t: (key: string) => string;
}) {
  const isActive = activeNav === item.key;

  return (
    <button
      key={item.key}
      data-nav-key={item.key}
      onClick={() => setActiveNav(item.key)}
      className="group relative flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors"
      style={{
        background: isActive ? "var(--surface-white)" : "transparent",
        border: `1px solid ${isActive ? "var(--accent-border)" : "transparent"}`,
        boxShadow: isActive ? "0 5px 14px rgba(42, 53, 91, 0.06)" : "none",
        color: isActive ? "var(--fg-primary)" : "var(--fg-secondary)",
        fontSize: "var(--text-sm)",
        fontWeight: isActive ? 650 : 500,
      }}
    >
      {isActive && <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r-full" style={{ background: "var(--accent)" }} />}
      <NavIcon path={item.icon} active={isActive} />
      <span className="min-w-0 flex-1 truncate">{t(`nav.${item.key}`)}</span>
    </button>
  );
}

function CollapsedIconItem({ item, activeNav, setActiveNav, t }: {
  item: { key: NavKey; icon: string };
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  t: (key: string) => string;
}) {
  const isActive = activeNav === item.key;

  return (
    <button
      key={item.key}
      data-nav-key={item.key}
      onClick={() => setActiveNav(item.key)}
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors"
      style={{
        background: isActive ? "var(--surface-white)" : "transparent",
        color: isActive ? "var(--accent)" : "var(--fg-tertiary)",
        border: `1px solid ${isActive ? "var(--accent-border)" : "transparent"}`,
        boxShadow: isActive ? "var(--shadow-xs)" : "none",
      }}
      title={t(`nav.${item.key}`)}
    >
      {isActive && <span className="absolute -left-1 h-4 w-0.5 rounded-r-full" style={{ background: "var(--accent)" }} />}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={item.icon} />
      </svg>
    </button>
  );
}

function CollapsedNav() {
  const { activeNav, setActiveNav, toggleSidebar } = useNavigationStore();
  const user = useAuthStore((state) => state.user);
  const t = useT();
  const openCommandPalette = () => window.dispatchEvent(new CustomEvent("command-palette:open"));
  const initial = (user?.name ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-12 flex-col items-center gap-1 py-3">
      <button
        onClick={toggleSidebar}
        className="mb-2 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg"
        style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
        title="展开导航"
      >
        <Image src="/brand/logo-mark.png" alt="AgentHub" width={26} height={26} style={{ width: 26, height: 26, objectFit: "contain" }} />
      </button>
      <button
        type="button"
        onClick={openCommandPalette}
        className="mb-2 grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-white)]"
        style={{ color: "var(--fg-tertiary)", border: "1px solid var(--border)" }}
        title="快速跳转"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </button>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => (
          <CollapsedIconItem key={item.key} item={item} activeNav={activeNav} setActiveNav={setActiveNav} t={t} />
        ))}
      </div>
      <div
        className="mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
        style={{ background: "var(--accent-gradient)", boxShadow: "0 6px 14px rgba(68,86,223,0.18)" }}
        title={user?.name ?? "用户"}
      >
        {initial}
      </div>
    </div>
  );
}

type SidebarVariant = "dashboard" | "chat" | "default";

interface ExpandedNavProps {
  variant: SidebarVariant;
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  onCreateConversation: () => void;
}

function ExpandedNav({
  variant, activeNav, setActiveNav, onCreateConversation,
}: ExpandedNavProps) {
  const t = useT();
  const { toggleSidebar } = useNavigationStore();
  const { locale, toggleLocale } = useSettingsStore();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const openCommandPalette = () => window.dispatchEvent(new CustomEvent("command-palette:open"));
  const initial = (user?.name ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col" style={{ width: "100%" }}>
      <div className="px-3 pb-3 pt-3" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid var(--border)" }}>
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
            <Image src="/brand/logo-mark.png" alt="AgentHub" width={30} height={30} style={{ width: 30, height: 30, objectFit: "contain" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold leading-tight" style={{ fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
              AgentHub
            </h1>
            <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
              AI Agents · Together
            </p>
          </div>
          <button
            onClick={toggleSidebar}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
            style={{ color: "var(--fg-tertiary)" }}
            title="收起导航"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M11 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={openCommandPalette}
          className="mt-3 flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold transition-colors hover:bg-[var(--surface-white)]"
          style={{ color: "var(--fg-secondary)", background: "rgba(255,255,255,0.5)", border: "1px solid var(--border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <span className="min-w-0 flex-1 truncate">快速跳转</span>
        </button>

        {variant === "chat" && (
          <button
            onClick={onCreateConversation}
            className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "var(--accent)", boxShadow: "0 8px 18px rgba(68,86,223,0.18)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14 M5 12h14" />
            </svg>
            新建会话
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 custom-scrollbar">
        {SECTIONS.map((section) => {
          const sectionItems = NAV_ITEMS.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key} className="mb-2">
              <p className="px-2 pb-1.5 pt-2 text-[10px] font-bold" style={{ color: "var(--fg-tertiary)" }}>
                {section.label}
              </p>
              <div className="space-y-1">
                {sectionItems.map((item) => (
                  <NavItemButton key={item.key} item={item} activeNav={activeNav} setActiveNav={setActiveNav} t={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
        <div className="rounded-xl p-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "var(--accent-gradient)" }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{user?.name ?? "用户"}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
                <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>在线</span>
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={toggleLocale}
              className="h-7 rounded-lg text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]"
              style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            <button
              onClick={logout}
              className="h-7 rounded-lg text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]"
              style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SidebarNavProps {
  variant: "dashboard" | "chat" | "default";
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  onCreateConversation: () => void;
}

export function SidebarNav({
  variant, activeNav, setActiveNav, onCreateConversation,
}: SidebarNavProps) {
  const { sidebarCollapsed } = useNavigationStore();

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #fbfcff 0%, #f5f8fd 100%)",
        borderRight: "1px solid var(--divider)",
        width: "100%",
        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {sidebarCollapsed ? (
        <CollapsedNav />
      ) : (
        <ExpandedNav
          variant={variant}
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          onCreateConversation={onCreateConversation}
        />
      )}
    </aside>
  );
}
