"use client";

import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import type { Message } from "@agenthub/shared";

type StepStatus = "pending" | "running" | "done";
type TaskPhase = "received" | "planning" | "dispatching" | "executing" | "reviewing" | "completed" | "failed";
type PanelTab = "tasks" | "preview" | "code" | "deploy" | "context";

interface StepProgress {
  index: number;
  total: number;
  step: string;
  status: StepStatus;
  result?: string;
}

interface TaskItem {
  label: string;
  status: string;
}

interface CurrentTaskStatusBarProps {
  messages: Message[];
  steps: StepProgress[];
  isStreaming: boolean;
  taskSummary: string;
  onJumpToLatest: () => void;
}

const PHASES: Array<{ key: Exclude<TaskPhase, "failed">; label: string }> = [
  { key: "received", label: "接收" },
  { key: "planning", label: "规划" },
  { key: "dispatching", label: "分派" },
  { key: "executing", label: "执行" },
  { key: "completed", label: "交付" },
];

const AGENT_LABELS: Record<string, string> = {
  pmo: "PMO",
  planner: "PMO",
  codex: "Codex",
  coder: "Codex",
  researcher: "Researcher",
  worker: "Worker",
  refiner: "UX Reviewer",
  "ux-reviewer": "UX Reviewer",
  "open-code": "Open Code",
  "claude-code": "Claude Code",
  critic: "Critic",
  deploy: "Open Code",
};

function getPayload(message: Message | undefined): Record<string, unknown> {
  if (!message?.payload || typeof message.payload !== "object" || Array.isArray(message.payload)) return {};
  return message.payload;
}

function findLatestTaskMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const payload = getPayload(message);
    if (message.type === "task_card" || payload.kind === "task_status") return message;
  }
  return undefined;
}

function findLatestDeployMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].type === "deploy_card") return messages[index];
  }
  return undefined;
}

function isArtifactMessage(message: Message) {
  const payload = getPayload(message);
  if (["diff_card", "preview_card", "deploy_card"].includes(message.type)) return true;
  return typeof payload.artifactType === "string" || typeof payload.deployUrl === "string";
}

function normalizeItems(payload: Record<string, unknown>, steps: StepProgress[]): TaskItem[] {
  if (Array.isArray(payload.items)) {
    return payload.items
      .filter((item): item is { label?: unknown; status?: unknown } => Boolean(item) && typeof item === "object")
      .map((item) => ({
        label: typeof item.label === "string" ? item.label : "任务步骤",
        status: typeof item.status === "string" ? item.status : "pending",
      }));
  }

  return steps.map((step) => ({
    label: step.step,
    status: step.status,
  }));
}

function normalizePhase(payload: Record<string, unknown>, status: string, items: TaskItem[], isStreaming: boolean, hasSummary: boolean): TaskPhase {
  const raw = typeof payload.phase === "string" ? payload.phase : "";
  if (["received", "planning", "dispatching", "executing", "reviewing", "completed", "failed"].includes(raw)) {
    return raw as TaskPhase;
  }
  if (status === "failed") return "failed";
  if (status === "done" || hasSummary) return "completed";
  if (items.some((item) => item.status === "running")) return "executing";
  if (items.length > 0) return "planning";
  return isStreaming ? "executing" : "received";
}

function phaseIndex(phase: TaskPhase) {
  if (phase === "failed") return PHASES.findIndex((item) => item.key === "executing");
  if (phase === "reviewing") return PHASES.findIndex((item) => item.key === "completed");
  return Math.max(0, PHASES.findIndex((item) => item.key === phase));
}

function statusMeta(status: string, phase: TaskPhase, isStreaming: boolean) {
  if (phase === "failed" || status === "failed") return { label: "需要处理", color: "var(--danger)", bg: "var(--danger-subtle)" };
  if (phase === "completed" || status === "done") return { label: "已交付", color: "var(--success)", bg: "var(--success-subtle)" };
  if (isStreaming || status === "running") return { label: "进行中", color: "var(--accent)", bg: "var(--accent-subtle)" };
  return { label: "待继续", color: "var(--fg-tertiary)", bg: "var(--surface-low)" };
}

function formatUpdateTime(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function openPanel(tab: PanelTab) {
  window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
  }, 0);
}

function IconButton({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-colors hover:bg-[var(--surface-low)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: disabled ? "var(--fg-disabled)" : "var(--fg-secondary)", background: "transparent", border: "1px solid transparent" }}
    >
      {children}
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  );
}

export const CurrentTaskStatusBar = memo(function CurrentTaskStatusBar({
  messages,
  steps,
  isStreaming,
  taskSummary,
  onJumpToLatest,
}: CurrentTaskStatusBarProps) {
  const state = useMemo(() => {
    const taskMessage = findLatestTaskMessage(messages);
    const taskPayload = getPayload(taskMessage);
    const deployMessage = findLatestDeployMessage(messages);
    const deployPayload = getPayload(deployMessage);
    const items = normalizeItems(taskPayload, steps);
    const taskStatus = String(taskPayload.status || (taskSummary ? "done" : isStreaming ? "running" : ""));
    const phase = normalizePhase(taskPayload, taskStatus, items, isStreaming, Boolean(taskSummary));
    const currentIndex = phaseIndex(phase);
    const doneCount = items.filter((item) => item.status === "done").length;
    const activeAgentId = String(taskPayload.activeAgentId || taskPayload.agentId || "");
    const artifactCount = messages.filter(isArtifactMessage).length;
    const deployStatus = deployMessage ? String(deployPayload.status || "deploying") : "";
    const deployUrl = typeof deployPayload.url === "string" ? deployPayload.url : "";
    const title = String(taskPayload.title || (taskSummary ? "任务结果已整理" : isStreaming ? "Agent 正在处理" : ""));
    const meta = statusMeta(taskStatus, phase, isStreaming);

    return {
      hasTask: Boolean(taskMessage || steps.length > 0 || isStreaming || taskSummary || artifactCount > 0),
      title,
      meta,
      phase,
      currentIndex,
      items,
      doneCount,
      activeAgent: activeAgentId ? (AGENT_LABELS[activeAgentId] || activeAgentId) : "",
      artifactCount,
      deployStatus,
      deployUrl,
      updatedAt: formatUpdateTime(taskMessage?.timestamp || deployMessage?.timestamp || messages[messages.length - 1]?.timestamp),
    };
  }, [isStreaming, messages, steps, taskSummary]);

  if (!state.hasTask) return null;

  const totalSteps = state.items.length;
  const deployLabel = state.deployStatus === "done" || state.deployStatus === "success"
    ? "已部署"
    : state.deployStatus === "failed"
      ? "部署失败"
      : state.deployStatus
        ? "部署中"
        : "未部署";
  const progressPercent = Math.max(8, Math.min(100, ((state.currentIndex + (state.phase === "completed" ? 1 : 0)) / PHASES.length) * 100));
  const activePhase = PHASES[Math.max(0, Math.min(state.currentIndex, PHASES.length - 1))]?.label || "处理";
  const summaryParts = [
    totalSteps ? `步骤 ${state.doneCount}/${totalSteps}` : "",
    state.artifactCount ? `产物 ${state.artifactCount}` : "",
    deployLabel !== "未部署" ? deployLabel : "",
  ].filter(Boolean);

  return (
    <section className="shrink-0 px-4 py-1.5" style={{ background: "var(--surface-white)", borderTop: "1px solid var(--divider)", borderBottom: "1px solid var(--divider)" }}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: state.meta.color }} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>
              {state.title || "等待下一步"}
            </span>
            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: state.meta.color, background: state.meta.bg }}>
              {state.meta.label}
            </span>
            <span className="hidden shrink-0 text-[10px] md:inline" style={{ color: "var(--fg-tertiary)" }}>
              {activePhase}
              {state.activeAgent ? ` · ${state.activeAgent}` : ""}
              {summaryParts.length ? ` · ${summaryParts.join(" · ")}` : ""}
              {state.updatedAt ? ` · ${state.updatedAt}` : ""}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--surface-low)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPercent}%`, background: state.meta.color }} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="流程" title="查看任务流程" onClick={() => openPanel("tasks")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h6" />
              <path d="M14 6h6" />
              <path d="M4 18h6" />
              <path d="M14 18h6" />
              <path d="M10 6c2 0 2 12 4 12" />
            </svg>
          </IconButton>
          <IconButton label="产物" title="查看产物预览" onClick={() => openPanel(state.artifactCount ? "preview" : "code")} disabled={!state.artifactCount}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v14H4z" />
              <path d="M8 9h8" />
              <path d="M8 13h5" />
            </svg>
          </IconButton>
          <IconButton label="部署" title="打开部署面板" onClick={() => openPanel("deploy")} disabled={!state.artifactCount && !state.deployStatus}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </IconButton>
          <IconButton label="最新" title="回到最新消息" onClick={onJumpToLatest}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </IconButton>
        </div>
      </div>
    </section>
  );
});
