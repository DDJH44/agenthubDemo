"use client";

import { useT } from "@/hooks/useT";
import { useNavigationStore, type NavKey } from "@/stores/navigation-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAuthStore } from "@/stores/auth-store";
import Image from "next/image";

const NAV_ITEMS: { key: NavKey; icon: string; section: string }[] = [
  { key: "dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", section: "main" },
  { key: "acceptance", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11", section: "main" },
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
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all ${isActive ? "bg-[var(--accent-subtle)]" : "bg-transparent hover:bg-[var(--surface-low)]"}`}
      style={{
        color: isActive ? "var(--accent)" : "var(--fg-secondary)",
        fontSize: "var(--text-sm)", fontWeight: isActive ? 600 : 400,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }}>
        <path d={item.icon} />
      </svg>
      <span className="flex-1 text-left truncate">{t(`nav.${item.key}`)}</span>
    </button>
  );
}

function CollapsedIconItem({ item, activeNav, setActiveNav, t }: {
  item: { key: NavKey; icon: string };
  activeNav: NavKey;
  setActiveNav: (key: NavKey) => void;
  t: (key: string) => string;
}) {
  return (
    <button
      key={item.key}
      data-nav-key={item.key}
      onClick={() => setActiveNav(item.key)}
      className={`w-8 h-8 rounded-lg flex items-center justify-center relative shrink-0 transition-all ${activeNav === item.key ? "bg-[var(--accent-subtle)]" : "bg-transparent hover:bg-[var(--surface-low)]"}`}
      style={{
        color: activeNav === item.key ? "var(--accent)" : "var(--fg-tertiary)",
      }}
      title={t(`nav.${item.key}`)}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={item.icon} />
      </svg>
    </button>
  );
}

function CollapsedNav() {
  const { activeNav, setActiveNav, toggleSidebar } = useNavigationStore();
  const t = useT();
  const openCommandPalette = () => window.dispatchEvent(new CustomEvent("command-palette:open"));
  return (
    <div className="flex flex-col items-center py-3 gap-0.5" style={{ width: 48 }}>
      <button
        onClick={toggleSidebar}
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 font-bold text-white shrink-0 overflow-hidden"
        style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
        title="展开导航"
      >
        <Image src="/brand/logo-mark.png" alt="AgentHub" width={28} height={28} style={{ width: 28, height: 28, objectFit: "contain" }} />
      </button>
      <button
        type="button"
        onClick={openCommandPalette}
        className="mb-2 grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
        style={{ color: "var(--fg-tertiary)" }}
        title="快速跳转"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </button>
      {NAV_ITEMS.map((item) => (
        <CollapsedIconItem key={item.key} item={item} activeNav={activeNav} setActiveNav={setActiveNav} t={t} />
      ))}
      <div className="mt-auto w-7 h-7 rounded-full flex items-center justify-center font-semibold text-white shrink-0"
        style={{ background: "var(--accent-gradient)", fontSize: 9 }}>N</div>
    </div>
  );
}

/* ───────────────────────── 展开模式 ───────────────────────── */
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
  const openCommandPalette = () => window.dispatchEvent(new CustomEvent("command-palette:open"));

  return (
    <div className="flex flex-col h-full" style={{ width: "100%" }}>
      {/* Logo */}
      <div className="px-4 pt-4 pb-1" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <Image src="/brand/logo-mark.png" alt="AgentHub" width={28} height={28} style={{ width: 28, height: 28, objectFit: "contain" }} />
          </div>
          <h1 className="flex-1" style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--fg-primary)" }}>
            AgentHub
          </h1>
          <button
            onClick={toggleSidebar}
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--surface-low)]"
            style={{ color: "var(--fg-tertiary)" }}
            title="收起导航"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M11 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-semibold transition-colors hover:bg-[var(--surface-low)]"
          style={{ color: "var(--fg-secondary)", background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <span className="min-w-0 flex-1 truncate">快速跳转</span>
        </button>
      </div>

      {/* 新建会话 — 仅 chat 模式显示 */}
      {variant === "chat" && (
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onCreateConversation}
          className="w-full rounded-lg font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:opacity-90"
          style={{ background: "var(--accent-gradient)", color: "#fff", height: 38, fontSize: "var(--text-sm)", boxShadow: "var(--shadow-sm)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14 M5 12h14" />
          </svg>
          新建会话
        </button>
      </div>
      )}

      {/* 导航分组 */}
      <div className="flex-1 overflow-y-auto px-2 custom-scrollbar">
        {SECTIONS.map((section) => {
          const sectionItems = NAV_ITEMS.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.key} style={{ marginBottom: 2 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-tertiary)", padding: "8px 10px 4px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {section.label}
              </p>
              {sectionItems.map((item) => (
                <NavItemButton key={item.key} item={item} activeNav={activeNav} setActiveNav={setActiveNav} t={t} />
              ))}
            </div>
          );
        })}

      </div>

      {/* 用户区域 */}
      <div className="px-3 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-white shrink-0"
            style={{ background: "var(--accent-gradient)", fontSize: 9 }}>
            {(useAuthStore.getState().user?.name ?? "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-primary)" }}>{useAuthStore.getState().user?.name ?? "用户"}</p>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
              <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>在线</span>
            </div>
          </div>
          <button onClick={toggleLocale} className="rounded-md px-1.5 py-0.5 font-medium transition-all shrink-0"
            style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)", fontSize: 9 }}>
            {locale === "zh" ? "EN" : "中"}
          </button>
          <button onClick={() => useAuthStore.getState().logout()} className="rounded-md px-1.5 py-0.5 font-medium transition-all shrink-0"
            style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)", fontSize: 9 }}>
            退出
          </button>
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
      className="flex flex-col h-full shrink-0 overflow-hidden"
      style={{
        background: "var(--surface-white)",
        borderRight: "1px solid var(--border)",
        width: sidebarCollapsed ? 48 : 240,
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
