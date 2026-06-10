"use client";

import type { UserAgent } from "@agenthub/shared";
import { getConnectionStateMeta } from "@/features/chat/agent-directory";

const ROLE_LABELS: Record<string, string> = {
  planner: "规划",
  worker: "执行",
  critic: "审查",
  researcher: "研究",
  refiner: "润色",
  coder: "代码",
  reviewer: "评审",
  frontend: "前端",
  backend: "后端",
  design: "设计",
  custom: "自建",
};

const TOOL_LABELS: Record<string, string> = {
  code_execution: "代码执行",
  web_search: "网页搜索",
  file_read: "读文件",
  file_write: "写文件",
  shell: "Shell",
  diff_apply: "应用 Diff",
  browser: "浏览器",
};

const PROVIDER_LABELS: Record<string, string> = {
  inherit: "继承系统",
  openai: "OpenAI",
  "openai-compatible": "兼容 API",
  "volc-ark": "火山方舟",
  deepseek: "DeepSeek",
  custom: "私有 API",
};

interface AgentCardProps {
  agent: UserAgent;
  onEdit?: (agent: UserAgent) => void;
  onDelete?: (id: string) => void;
  onTest?: (agent: UserAgent) => void;
  testing?: boolean;
  connectionStatus?: { ok: boolean; text: string } | null;
}

function formatTime(ts: number) {
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function AgentCard({ agent, onEdit, onDelete, onTest, testing = false, connectionStatus }: AgentCardProps) {
  const connectionMeta = getConnectionStateMeta("local");

  return (
    <article className="rounded-lg p-4 transition-colors hover:bg-[var(--surface-low)]" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ background: agent.avatarBg }}>
          {agent.avatar || agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{agent.name}</h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>{ROLE_LABELS[agent.role] ?? agent.role} · {agent.model}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                自建
              </span>
              <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: connectionMeta.color, background: connectionMeta.bg, border: `1px solid ${connectionMeta.border}` }}>
                {connectionMeta.shortLabel}
              </span>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: agent.provider && agent.provider !== "inherit" ? "var(--accent)" : "var(--fg-tertiary)", background: agent.provider && agent.provider !== "inherit" ? "var(--accent-subtle)" : "var(--surface-low)" }}>
              {PROVIDER_LABELS[agent.provider ?? "inherit"] ?? agent.provider}
            </span>
            {agent.hasApiKey && (
              <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--success)", background: "var(--success-subtle)" }}>
                Key {agent.apiKeyHint || "已保存"}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>
            {agent.systemPrompt || "暂无系统提示词"}
          </p>
          {connectionStatus && (
            <div
              className="mt-2 rounded-md px-2 py-1 text-[10px]"
              style={{
                color: connectionStatus.ok ? "var(--success)" : "var(--danger)",
                background: connectionStatus.ok ? "var(--success-subtle)" : "var(--danger-subtle)",
              }}
            >
              {connectionStatus.text}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.tools.length === 0 ? (
          <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>无工具</span>
        ) : agent.tools.map((tool) => (
          <span key={tool} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
            {TOOL_LABELS[tool] ?? tool}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--divider)" }}>
        <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>更新于 {formatTime(agent.updatedAt)}</span>
        <div className="flex gap-2">
          {onTest && (
            <button
              type="button"
              onClick={() => onTest(agent)}
              disabled={testing}
              className="rounded-md px-2 py-1 text-xs font-semibold"
              style={{
                color: testing ? "var(--fg-disabled)" : "var(--accent)",
                background: testing ? "var(--surface-mid)" : "var(--accent-subtle)",
              }}
            >
              {testing ? "测试中" : "测试"}
            </button>
          )}
          <button type="button" onClick={() => onEdit?.(agent)} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
            编辑
          </button>
          <button type="button" onClick={() => onDelete?.(agent.id)} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--danger)", background: "var(--danger-subtle)" }}>
            删除
          </button>
        </div>
      </div>
    </article>
  );
}
