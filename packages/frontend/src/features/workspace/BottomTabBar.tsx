"use client";

import { useT } from "@/hooks/useT";

export type WorkspaceTab = "task" | "files" | "diff" | "preview" | "deploy" | "members" | "file-manager" | "memory";

interface Props { activeTab: WorkspaceTab | null; onTabChange: (tab: WorkspaceTab) => void; onTabClose: () => void; taskCount?: number; fileCount?: number; }

export function BottomTabBar({ activeTab, onTabChange, onTabClose, taskCount }: Props) {
  const t = useT();
  const TABS: { key: WorkspaceTab; label: string; icon: string }[] = [
    { key: "task", label: t("tab.task"), icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
    { key: "files", label: t("tab.files"), icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" },
    { key: "diff", label: t("tab.diff"), icon: "M6 18L18 6M6 6l12 12" },
    { key: "preview", label: t("tab.preview"), icon: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" },
    { key: "deploy", label: t("tab.deploy"), icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
    { key: "members", label: "成员", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100 8 4 4 0 000-8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
    { key: "file-manager", label: "文件管理", icon: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" },
    { key: "memory", label: "记忆", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9h2m10 0h2M5 15h2m10 0h2m-8-4h4a2 2 0 012 2v2a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2a2 2 0 012-2z" },
  ];

  return (
    <div className="flex items-center shrink-0" style={{ height: 38, background: "var(--surface-white)", borderTop: "1px solid var(--border)" }}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button key={tab.key} onClick={() => isActive ? onTabClose() : onTabChange(tab.key)}
            className={`flex items-center gap-1.5 px-3.5 h-full relative transition-all ${isActive ? "text-[var(--fg-primary)] bg-[var(--bg-hover)]" : "text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)]"}`}
            style={{ fontSize: "var(--text-2xs)", fontWeight: isActive ? 550 : 400 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon} /></svg>
            <span>{tab.label}</span>
            {tab.key === "task" && (taskCount ?? 0) > 0 && <span className="rounded-full flex items-center justify-center font-semibold" style={{ fontSize: 9, background: "var(--accent-subtle)", color: "var(--accent)", minWidth: 16, height: 16 }}>{taskCount}</span>}
            {isActive && <div className="absolute top-0 left-4 right-4" style={{ height: 2, background: "var(--accent)", borderRadius: "0 0 2px 2px" }} />}
          </button>
        );
      })}
      <div className="flex-1" />
      <button className="flex items-center gap-1 px-3 h-full transition-all hover:text-[var(--fg-secondary)]" style={{ color: "var(--fg-tertiary)", fontSize: "var(--text-2xs)", fontWeight: 500 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        MCP
      </button>
    </div>
  );
}
