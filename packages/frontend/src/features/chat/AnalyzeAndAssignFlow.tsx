"use client";

import { useChatStore } from "@/stores/chat-store";

const AGENT_META: Record<string, { role: string; color: string }> = {
  pmo: { role: "协调器", color: "var(--accent)" },
  pm: { role: "协调器", color: "var(--accent)" },
  codex: { role: "代码生成", color: "#0f766e" },
  "claude-code": { role: "冲突处理", color: "#9a6700" },
  deploy: { role: "部署", color: "#7c3aed" },
  "ux-reviewer": { role: "自建 Agent", color: "#a50e0e" },
};

const STATUS_META = {
  done: {
    label: "完成",
    dot: "var(--success)",
    fg: "var(--success)",
    bg: "var(--success-subtle)",
    border: "rgba(0, 108, 73, 0.18)",
  },
  running: {
    label: "执行中",
    dot: "var(--accent)",
    fg: "var(--accent)",
    bg: "var(--accent-subtle)",
    border: "var(--accent-border)",
  },
  pending: {
    label: "待接单",
    dot: "var(--fg-tertiary)",
    fg: "var(--fg-secondary)",
    bg: "var(--surface-low)",
    border: "var(--border)",
  },
} as const;

function getAgentInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "AG";

  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export function AnalyzeAndAssignFlow() {
  const analysisResults = useChatStore((state) => state.analysisResults);
  const taskAssignments = useChatStore((state) => state.taskAssignments);
  const isAnalyzing = useChatStore((state) => state.isAnalyzing);

  if (analysisResults.length === 0 && taskAssignments.length === 0 && !isAnalyzing) return null;

  return (
    <section
      className="mx-4 my-3 rounded-xl px-3 py-3"
      style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
    >
      {(analysisResults.length > 0 || isAnalyzing) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
              style={{ background: "var(--surface-white)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h7" />
                <path d="M4 12h12" />
                <path d="M4 19h16" />
                <path d="m16 5 2 2 3-4" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                协作分析
              </div>
              <div className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                PMO 正在归纳上下文并同步派单
              </div>
            </div>
          </div>

          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold"
            style={{ background: isAnalyzing ? "var(--accent-subtle)" : "var(--surface-white)", color: isAnalyzing ? "var(--accent)" : "var(--fg-tertiary)", border: "1px solid var(--border)" }}
          >
            {isAnalyzing && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />}
            {isAnalyzing ? "分析中" : `${analysisResults.length} 条判断`}
          </span>
        </div>
      )}

      {analysisResults.length > 0 && (
        <div className="relative mb-3 space-y-2">
          <span className="absolute left-3 top-5 bottom-5 w-px" style={{ background: "var(--divider)" }} />
          {analysisResults.map((result, index) => {
            const meta = AGENT_META[result.agentId] ?? { role: "Agent", color: "var(--fg-tertiary)" };

            return (
              <article
                key={`${result.agentId}-${index}`}
                className="relative flex gap-2.5 rounded-lg px-2 py-2"
                style={{ background: "var(--surface-glass)", border: "1px solid var(--border)" }}
              >
                <span
                  className="relative z-10 mt-2 h-2.5 w-2.5 shrink-0 rounded-full ring-4"
                  style={{ background: meta.color, ["--tw-ring-color" as string]: "var(--surface-tinted)" }}
                />
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white"
                  style={{ background: meta.color }}
                >
                  {getAgentInitials(result.agentName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                      {result.agentName}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}
                    >
                      {meta.role}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.65 }}>
                    {result.content}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {taskAssignments.length > 0 && (
        <div className="rounded-lg px-2.5 py-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
              <span className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                任务分配
              </span>
            </div>
            <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
              {taskAssignments.length} 个 Agent
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {taskAssignments.map((assignment, index) => {
              const meta = STATUS_META[assignment.status];

              return (
                <div
                  key={`${assignment.targetAgent}-${index}`}
                  className="min-w-0 rounded-lg px-2.5 py-2"
                  style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-bold" style={{ color: "var(--fg-primary)" }}>
                      @{assignment.targetAgent}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold" style={{ color: meta.fg }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[11px]" style={{ color: "var(--fg-secondary)", lineHeight: 1.45 }}>
                    {assignment.task}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
