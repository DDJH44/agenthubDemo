"use client";

import { useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { timeAgo } from "@/lib/utils";
import { AGENT_COLORS } from "@agenthub/shared";

const tagStyles: Record<string, { bg: string; color: string }> = {
  "项目": { bg: "var(--accent-subtle)", color: "var(--accent)" },
  "开发": { bg: "var(--success-subtle)", color: "var(--success)" },
  "设计": { bg: "var(--warning-subtle)", color: "var(--warning)" },
  "测试": { bg: "var(--danger-subtle)", color: "var(--danger)" },
};

const statusStyles: Record<string, { bg: string; color: string }> = {
  running: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  done: { bg: "var(--success-subtle)", color: "var(--success)" },
  pending: { bg: "var(--surface-low)", color: "var(--fg-disabled)" },
};

const progressColor: Record<string, string> = {
  running: "var(--accent)",
  done: "var(--success)",
  pending: "var(--fg-disabled)",
};

export function TaskTable() {
  const conversations = useChatStore((state) => state.conversations);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);
  const switchConversation = useWorkspaceStore((state) => state.switchConversation);

  const openConversation = useCallback((conversationId: string, panelTab?: "tasks") => {
    setActiveConversation(conversationId);
    switchConversation(conversationId);
    setActiveNav("chat");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId } }));
      window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key: "chat" } }));
      if (panelTab) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab: panelTab } }));
          window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab: panelTab } }));
        }, 0);
      }
    }
  }, [setActiveConversation, setActiveNav, switchConversation]);

  const tasks = useMemo(() => {
    return conversations.slice(0, 5).map((conv) => {
      const participants = conv.participants || [];
      const agents = participants.slice(0, 4).map((p) => ({
        name: p[0]?.toUpperCase() || "?",
        color: AGENT_COLORS[p] || "#6b7280",
      }));

      return {
        id: conv.id,
        name: conv.title,
        tag: "项目",
        status: conv.status === "active" ? "running" as const : "done" as const,
        statusLabel: conv.status === "active" ? "运行中" : "已完成",
        progress: conv.status === "active" ? 65 : 100,
        agents,
        time: conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : "—",
      };
    });
  }, [conversations]);

  return (
    <div
      className="card-breathe"
      style={{
        background: "var(--surface-white)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="text-[14px] font-bold" style={{ color: "var(--fg-primary)" }}>
          最近任务
        </h3>
        <button type="button" onClick={() => setActiveNav("tasks")} className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
          查看全部 →
        </button>
      </div>

      <div
        className="grid grid-cols-[2.5fr_0.8fr_1.5fr_1.2fr_0.8fr_0.3fr] gap-3 px-5 py-2"
        style={{ background: "var(--surface-low)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>任务名称</span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>状态</span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>进度</span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>负责智能体</span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>更新时间</span>
        <span></span>
      </div>

      {tasks.length === 0 ? (
        <div className="px-5 py-6 text-center" style={{ color: "var(--fg-tertiary)", fontSize: "var(--text-sm)" }}>
          暂无任务
        </div>
      ) : (
        tasks.map((task, i) => {
          const tag = tagStyles[task.tag] ?? { bg: "var(--surface-low)", color: "var(--fg-tertiary)" };
          const status = statusStyles[task.status];

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => openConversation(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openConversation(task.id);
                }
              }}
              className="grid grid-cols-[2.5fr_0.8fr_1.5fr_1.2fr_0.8fr_0.3fr] gap-3 px-5 py-3 items-center transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                borderBottom: i < tasks.length - 1 ? "1px solid var(--divider)" : "none",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: tag.color, flexShrink: 0 }}>
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M13 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg-primary)" }}>{task.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded shrink-0 font-medium" style={{ background: tag.bg, color: tag.color }}>{task.tag}</span>
              </div>

              <span className="text-[12px] px-2 py-1 rounded-full font-medium" style={{ background: status.bg, color: status.color }}>{task.statusLabel}</span>

              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: "var(--fg-secondary)", width: 36 }}>{task.progress}%</span>
                <div className="flex-1 h-[6px] rounded-full" style={{ background: "var(--surface-low)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${task.progress}%`, background: progressColor[task.status] }} />
                </div>
              </div>

              <div className="flex items-center">
                <div className="flex -space-x-1.5">
                  {task.agents.map((agent, j) => (
                    <div key={j} className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ background: agent.color, border: "2px solid var(--surface-white)", zIndex: task.agents.length - j }}>
                      {agent.name}
                    </div>
                  ))}
                </div>
              </div>

              <span className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{task.time}</span>

              <button type="button" className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--bg-active)]"
                onClick={(event) => {
                  event.stopPropagation();
                  openConversation(task.id, "tasks");
                }}
                style={{ color: "var(--fg-disabled)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
