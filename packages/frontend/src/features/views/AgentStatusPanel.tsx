"use client";

import { useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { AGENT_COLORS } from "@agenthub/shared";
import { getAgentMeta, getConnectionStateMeta } from "@/features/chat/agent-directory";

const AGENT_ROLES: Record<string, string> = {
  planner: "项目管理", researcher: "调研分析", worker: "任务执行",
  frontend: "前端开发", backend: "后端开发", design: "UI/UX 设计",
  critic: "代码审查", refiner: "内容优化", coder: "代码开发",
};

export function AgentStatusPanel() {
  const { sessionAgentStatuses, conversations } = useChatStore();
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);

  const agents = useMemo(() => {
    if (sessionAgentStatuses.length > 0) {
      return sessionAgentStatuses.map((s) => {
        const meta = getAgentMeta(s.agentId || s.agentName || s.agentRole);
        const connectionMeta = getConnectionStateMeta(meta.connection.state);
        return {
          name: s.agentName || s.agentRole,
          role: AGENT_ROLES[s.agentRole] || s.agentRole,
          color: meta.color || AGENT_COLORS[s.agentRole] || "#6b7280",
          status: s.status === "running" ? "运行中" : s.status === "done" ? "已完成" : "空闲",
          statusDot: s.status === "running" ? "var(--success)" : "var(--fg-disabled)",
          progress: s.status === "running" ? 60 : s.status === "done" ? 100 : undefined,
          initial: meta.badge || (s.agentRole || s.agentName || "?")[0].toUpperCase(),
          connectionLabel: connectionMeta.shortLabel,
          connectionColor: connectionMeta.color,
          connectionBg: connectionMeta.bg,
        };
      });
    }

    const activeConvs = conversations.filter((c) => c.status === "active");
    const uniqueParticipants = new Set<string>();
    for (const conv of activeConvs) {
      for (const p of conv.participants || []) {
        uniqueParticipants.add(p);
      }
    }

    return Array.from(uniqueParticipants).slice(0, 5).map((p) => {
      const meta = getAgentMeta(p);
      const connectionMeta = getConnectionStateMeta(meta.connection.state);
      return {
        name: p,
        role: meta.role || AGENT_ROLES[p] || p,
        color: meta.color || AGENT_COLORS[p] || "#6b7280",
        status: "空闲",
        statusDot: "var(--fg-disabled)",
        progress: undefined,
        initial: meta.badge || p[0]?.toUpperCase() || "?",
        connectionLabel: connectionMeta.shortLabel,
        connectionColor: connectionMeta.color,
        connectionBg: connectionMeta.bg,
      };
    });
  }, [sessionAgentStatuses, conversations]);

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
        style={{ borderBottom: "1px solid var(--divider)" }}
      >
        <h3 className="text-[14px] font-bold" style={{ color: "var(--fg-primary)" }}>
          智能体状态
        </h3>
        <button type="button" onClick={() => setActiveNav("agents")} className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
          查看全部智能体 →
        </button>
      </div>

      <div>
        {agents.map((agent, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-3"
            style={{ borderBottom: i < agents.length - 1 ? "1px solid var(--divider)" : "none" }}
          >
            <div
              className="w-8 h-8 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ background: agent.color, borderRadius: "var(--radius-sm)" }}
            >
              {agent.initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                {agent.name}
              </p>
              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                {agent.role}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1.5 justify-end">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      agent.status === "运行中" ? "var(--success)" : "var(--fg-disabled)",
                  }}
                />
                <span className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>
                  {agent.status}
                </span>
              </div>
              <span className="mt-1 inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: agent.connectionColor, background: agent.connectionBg }}>
                {agent.connectionLabel}
              </span>
              {agent.progress !== undefined && (
                <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                  {agent.progress}%
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
