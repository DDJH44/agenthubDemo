"use client";

import { useChatStore } from "@/stores/chat-store";

const AGENT_META: Record<string, { role: string; color: string }> = {
  pmo: { role: "协调器", color: "#174ea6" },
  pm: { role: "协调器", color: "#174ea6" },
  codex: { role: "代码生成", color: "#0f766e" },
  "claude-code": { role: "冲突处理", color: "#9a6700" },
  "open-code": { role: "部署", color: "#7c3aed" },
  "ux-reviewer": { role: "自建 Agent", color: "#a50e0e" },
};

export function AnalyzeAndAssignFlow() {
  const analysisResults = useChatStore((state) => state.analysisResults);
  const taskAssignments = useChatStore((state) => state.taskAssignments);
  const isAnalyzing = useChatStore((state) => state.isAnalyzing);

  if (analysisResults.length === 0 && taskAssignments.length === 0 && !isAnalyzing) return null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {(analysisResults.length > 0 || isAnalyzing) && (
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full" style={{ background: "#174ea6" }} />
          <span className="text-xs font-bold" style={{ color: "var(--fg-secondary)" }}>协作分析</span>
          {isAnalyzing && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "#174ea6" }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#174ea6" }} />
              分析中
            </span>
          )}
        </div>
      )}

      {analysisResults.map((result, index) => {
        const meta = AGENT_META[result.agentId] ?? { role: "Agent", color: "#5f6368" };
        return (
          <div key={`${result.agentId}-${index}`} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: meta.color }}>
                {result.agentName.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>{result.agentName}</span>
              <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                {meta.role}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.6 }}>{result.content}</p>
          </div>
        );
      })}

      {taskAssignments.length > 0 && (
        <div className="mt-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-4 w-1 rounded-full" style={{ background: "var(--success)" }} />
            <span className="text-xs font-bold" style={{ color: "var(--fg-secondary)" }}>任务分配</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {taskAssignments.map((assignment, index) => (
              <span
                key={`${assignment.targetAgent}-${index}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold"
                style={{ color: assignment.status === "done" ? "var(--success)" : "#174ea6", background: assignment.status === "done" ? "var(--success-subtle)" : "rgba(23, 78, 166, 0.07)" }}
              >
                @{assignment.targetAgent}
                {assignment.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#174ea6" }} />}
                {assignment.status === "done" && "完成"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
