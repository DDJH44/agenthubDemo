"use client";

import type { UserAgent } from "@agenthub/shared";
import { MAIN_AGENT_ID } from "@agenthub/shared";

interface AgentBadgeProps {
  agent: UserAgent;
  size?: number;
  showLabel?: boolean;
  compact?: boolean;
}

export function AgentBadge({ agent, size = 28, showLabel = true, compact = false }: AgentBadgeProps) {
  const isMain = agent.id === MAIN_AGENT_ID;

  const avatarContent = agent.avatar ? (
    <span style={{ fontSize: size * 0.45 }}>{agent.avatar}</span>
  ) : (
    <span style={{ fontSize: size * 0.4, fontWeight: 700 }}>{agent.name[0].toUpperCase()}</span>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className="rounded-md flex items-center justify-center text-white shrink-0"
          style={{ width: size, height: size, background: agent.avatarBg, fontSize: size * 0.4 }}
        >
          {avatarContent}
        </div>
        {showLabel && (
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-primary)" }}>
            {agent.name}
          </span>
        )}
        {isMain && (
          <span
            className="rounded px-1.5 py-px"
            style={{ fontSize: 9, fontWeight: 600, background: "var(--accent-subtle)", color: "var(--accent)" }}
          >
            主
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-lg flex items-center justify-center text-white shrink-0"
        style={{ width: size, height: size, background: agent.avatarBg }}
      >
        {avatarContent}
      </div>
      {showLabel && (
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-primary)" }}>
            {agent.name}
          </span>
          {isMain ? (
            <span
              className="rounded-full px-2 py-0.5"
              style={{ fontSize: 10, fontWeight: 600, background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
            >
              主智能体
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5"
              style={{ fontSize: 10, fontWeight: 500, background: "var(--surface-low)", color: "var(--fg-tertiary)" }}
            >
              自定义
            </span>
          )}
        </div>
      )}
    </div>
  );
}
