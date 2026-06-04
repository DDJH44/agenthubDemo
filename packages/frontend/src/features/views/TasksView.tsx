"use client";

import { useMemo, useState } from "react";
import type { Conversation, Message } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type TaskStatus = "running" | "failed" | "done" | "waiting";
type TaskFilter = "all" | TaskStatus;

interface StepSnapshot {
  id?: string;
  step?: string;
  label?: string;
  status?: string;
  result?: string;
}

interface ConversationTaskSnapshot {
  steps?: StepSnapshot[];
  planSteps?: string[];
  isStreaming?: boolean;
  taskSummary?: string;
}

interface TaskStep {
  label: string;
  status: TaskStatus | "pending";
}

interface GlobalTaskItem {
  id: string;
  conversationId: string;
  conversationTitle: string;
  title: string;
  body: string;
  status: TaskStatus;
  progress: number;
  agentLabel: string;
  updatedAt: number;
  stepCount: number;
  doneStepCount: number;
  artifactCount: number;
  deployLabel: string;
  deployUrl: string;
  steps: TaskStep[];
}

const FILTERS: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "failed", label: "待处理" },
  { key: "running", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "waiting", label: "待继续" },
];

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string; border: string }> = {
  running: {
    label: "进行中",
    color: "var(--accent)",
    bg: "var(--accent-subtle)",
    border: "var(--accent-border)",
  },
  failed: {
    label: "待处理",
    color: "var(--danger)",
    bg: "var(--danger-subtle)",
    border: "rgba(239, 68, 68, 0.22)",
  },
  done: {
    label: "已完成",
    color: "var(--success)",
    bg: "var(--success-subtle)",
    border: "rgba(34, 197, 94, 0.2)",
  },
  waiting: {
    label: "待继续",
    color: "var(--fg-tertiary)",
    bg: "var(--surface-low)",
    border: "var(--border)",
  },
};

const AGENT_LABELS: Record<string, string> = {
  pmo: "PMO",
  planner: "PMO",
  codex: "Codex",
  coder: "Codex",
  researcher: "Researcher",
  worker: "Worker",
  refiner: "UX Reviewer",
  critic: "Critic",
  deploy: "Open Code",
  "open-code": "Open Code",
  "claude-code": "Claude Code",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function payloadOf(message?: Message): Record<string, unknown> {
  return isRecord(message?.payload) ? message.payload : {};
}

function textValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findLatest(messages: Message[], predicate: (message: Message) => boolean) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) return messages[index];
  }
  return undefined;
}

function isTaskMessage(message: Message) {
  const payload = payloadOf(message);
  return message.type === "task_card" || payload.kind === "task_status";
}

function isArtifactMessage(message: Message) {
  const payload = payloadOf(message);
  return (
    message.type === "diff_card" ||
    message.type === "preview_card" ||
    message.type === "deploy_card" ||
    typeof payload.artifactType === "string" ||
    typeof payload.deployUrl === "string"
  );
}

function normalizeStepStatus(status: string | undefined): TaskStep["status"] {
  const value = (status || "").toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("失败")) return "failed";
  if (value.includes("done") || value.includes("complete") || value.includes("success") || value.includes("完成")) return "done";
  if (value.includes("run") || value.includes("progress") || value.includes("执行") || value.includes("处理中")) return "running";
  return "pending";
}

function normalizeSteps(payload: Record<string, unknown>, taskState?: ConversationTaskSnapshot): TaskStep[] {
  if (Array.isArray(payload.items)) {
    return payload.items
      .filter(isRecord)
      .map((item) => ({
        label: textValue(item, "label") || textValue(item, "step") || "任务步骤",
        status: normalizeStepStatus(textValue(item, "status")),
      }));
  }

  const runtimeSteps = taskState?.steps ?? [];
  if (runtimeSteps.length > 0) {
    return runtimeSteps.map((step) => ({
      label: step.step || step.label || "任务步骤",
      status: normalizeStepStatus(step.status),
    }));
  }

  return (taskState?.planSteps ?? []).map((step) => ({
    label: step,
    status: "pending",
  }));
}

function normalizeStatus({
  payload,
  deployPayload,
  steps,
  isStreaming,
  hasSummary,
  hasTaskMessage,
}: {
  payload: Record<string, unknown>;
  deployPayload: Record<string, unknown>;
  steps: TaskStep[];
  isStreaming: boolean;
  hasSummary: boolean;
  hasTaskMessage: boolean;
}): TaskStatus {
  const raw = `${textValue(payload, "status")} ${textValue(payload, "phase")}`.toLowerCase();
  const deployStatus = textValue(deployPayload, "status").toLowerCase();

  if (raw.includes("fail") || raw.includes("error") || raw.includes("失败") || deployStatus.includes("fail")) {
    return "failed";
  }
  if (["deploying", "building", "running", "pending", "preparing", "queued"].some((item) => deployStatus.includes(item))) {
    return "running";
  }
  if (
    raw.includes("done") ||
    raw.includes("complete") ||
    raw.includes("success") ||
    raw.includes("完成") ||
    hasSummary ||
    deployStatus.includes("done") ||
    deployStatus.includes("success") ||
    deployStatus.includes("complete") ||
    deployStatus.includes("deployed")
  ) {
    return "done";
  }
  if (isStreaming || steps.some((step) => step.status === "running") || hasTaskMessage) return "running";
  if (steps.length > 0) return "waiting";
  return "waiting";
}

function progressFor(status: TaskStatus, payload: Record<string, unknown>, steps: TaskStep[]) {
  if (status === "done") return 100;
  const payloadProgress = numericValue(payload, "progress");
  if (payloadProgress !== null) return Math.max(6, Math.min(100, Math.round(payloadProgress)));
  if (steps.length > 0) {
    const doneCount = steps.filter((step) => step.status === "done").length;
    const base = Math.round((doneCount / steps.length) * 100);
    if (status === "running") return Math.max(18, Math.min(92, base || 24));
    if (status === "failed") return Math.max(12, Math.min(96, base || 40));
    return Math.max(8, base);
  }
  if (status === "running") return 46;
  if (status === "failed") return 58;
  return 8;
}

function deployLabel(deployPayload: Record<string, unknown>) {
  const status = textValue(deployPayload, "status").toLowerCase();
  if (!status) return "未部署";
  if (status.includes("fail")) return "部署失败";
  if (status.includes("done") || status.includes("success") || status.includes("complete") || status.includes("deployed")) return "部署完成";
  return "部署中";
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function buildTaskItem(
  conversation: Conversation,
  messages: Message[],
  taskState?: ConversationTaskSnapshot
): GlobalTaskItem | null {
  const taskMessage = findLatest(messages, isTaskMessage);
  const deployMessage = findLatest(messages, (message) => message.type === "deploy_card");
  const taskPayload = payloadOf(taskMessage);
  const deployPayload = payloadOf(deployMessage);
  const steps = normalizeSteps(taskPayload, taskState);
  const artifactCount = messages.filter(isArtifactMessage).length;
  const hasSummary = Boolean(taskState?.taskSummary);
  const hasTaskSignal = Boolean(taskMessage || deployMessage || steps.length > 0 || taskState?.isStreaming || taskState?.taskSummary || artifactCount > 0);

  if (!hasTaskSignal) return null;

  const status = normalizeStatus({
    payload: taskPayload,
    deployPayload,
    steps,
    isStreaming: Boolean(taskState?.isStreaming),
    hasSummary,
    hasTaskMessage: Boolean(taskMessage),
  });
  const doneStepCount = steps.filter((step) => step.status === "done").length;
  const agentId = textValue(taskPayload, "activeAgentId") || textValue(taskPayload, "agentId") || textValue(taskPayload, "ownerAgentId");
  const updatedAt = numericValue(taskPayload, "updatedAt") || taskMessage?.timestamp || deployMessage?.timestamp || conversation.updatedAt || conversation.lastMessageAt || conversation.createdAt;
  const body = textValue(taskPayload, "body") || taskState?.taskSummary || conversation.lastMessage || "打开会话查看完整上下文与最新产物。";

  return {
    id: `${conversation.id}-${taskMessage?.id || deployMessage?.id || "runtime"}`,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    title: textValue(taskPayload, "title") || conversation.title || "未命名任务",
    body,
    status,
    progress: progressFor(status, taskPayload, steps),
    agentLabel: agentId ? (AGENT_LABELS[agentId] || agentId) : "AgentHub",
    updatedAt,
    stepCount: steps.length,
    doneStepCount,
    artifactCount,
    deployLabel: deployLabel(deployPayload),
    deployUrl: textValue(deployPayload, "url"),
    steps,
  };
}

function StatPill({ label, value, active }: { label: string; value: number; active?: boolean }) {
  return (
    <span
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
      style={{
        color: active ? "var(--accent)" : "var(--fg-secondary)",
        background: active ? "var(--accent-subtle)" : "var(--surface-low)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      {label}
      <b style={{ color: active ? "var(--accent)" : "var(--fg-primary)" }}>{value}</b>
    </span>
  );
}

export function TasksView() {
  const conversations = useChatStore((state) => state.conversations);
  const messages = useChatStore((state) => state.messages);
  const conversationTasks = useChatStore((state) => state.conversationTasks);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);
  const switchConversation = useWorkspaceStore((state) => state.switchConversation);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");

  const taskItems = useMemo(() => {
    const items = conversations
      .filter((conversation) => conversation.status !== "archived")
      .map((conversation) =>
        buildTaskItem(
          conversation,
          messages[conversation.id] ?? [],
          conversationTasks[conversation.id] as ConversationTaskSnapshot | undefined
        )
      )
      .filter((item): item is GlobalTaskItem => Boolean(item));

    const priority: Record<TaskStatus, number> = { failed: 0, running: 1, waiting: 2, done: 3 };
    return items.sort((a, b) => priority[a.status] - priority[b.status] || b.updatedAt - a.updatedAt);
  }, [conversationTasks, conversations, messages]);

  const counts = useMemo(() => {
    const base: Record<TaskFilter, number> = { all: taskItems.length, failed: 0, running: 0, done: 0, waiting: 0 };
    for (const item of taskItems) base[item.status] += 1;
    return base;
  }, [taskItems]);

  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return taskItems.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch = !keyword || `${item.title} ${item.conversationTitle} ${item.body} ${item.agentLabel}`.toLowerCase().includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, taskItems]);

  const openConversation = (conversationId: string, panelTab?: "tasks" | "preview" | "deploy") => {
    setActiveConversation(conversationId);
    switchConversation(conversationId);
    setActiveNav("chat");
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId } }));
    window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key: "chat" } }));
    if (panelTab) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab: panelTab } }));
        window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab: panelTab } }));
      }, 0);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--surface-white)" }}>
      <header className="shrink-0 px-6 py-5" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>AgentHub Task Center</p>
            <h2 className="mt-1 text-[22px] font-[760]" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>
              任务中心
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--fg-tertiary)" }}>
              汇总所有会话中的任务状态、产物和部署结果，异常任务可以直接跳回会话处理。
            </p>
          </div>

          <div className="flex min-w-[260px] flex-1 justify-end">
            <label
              className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-xl px-3"
              style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索任务、会话或 Agent"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--fg-primary)" }}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className="h-8 rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-[var(--surface-low)]"
              style={{
                color: filter === item.key ? "var(--accent)" : "var(--fg-secondary)",
                background: filter === item.key ? "var(--accent-subtle)" : "transparent",
                border: `1px solid ${filter === item.key ? "var(--accent-border)" : "var(--border)"}`,
              }}
            >
              {item.label} ({counts[item.key]})
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <StatPill label="进行中" value={counts.running} active={counts.running > 0} />
            <StatPill label="待处理" value={counts.failed} active={counts.failed > 0} />
            <StatPill label="已完成" value={counts.done} />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        {filteredTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div
              className="mb-3 grid h-12 w-12 place-items-center rounded-xl"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>暂无匹配任务</p>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
              创建会话并让 Agent 执行任务后，这里会自动汇总进度。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const meta = STATUS_META[task.status];
              const recentSteps = task.steps.slice(0, 3);
              return (
                <article
                  key={task.id}
                  className="rounded-2xl px-4 py-3.5 transition-colors hover:bg-[var(--surface-tinted)]"
                  style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold"
                          style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="truncate text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                          {task.conversationTitle}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--fg-disabled)" }}>{formatTime(task.updatedAt)}</span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>
                        {task.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: "var(--fg-secondary)" }}>
                        {task.body}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {task.artifactCount > 0 && (
                        <button
                          type="button"
                          onClick={() => openConversation(task.conversationId, "preview")}
                          className="h-8 rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-[var(--surface-low)]"
                          style={{ color: "var(--fg-secondary)", border: "1px solid var(--border)" }}
                        >
                          查看产物
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openConversation(task.conversationId, "tasks")}
                        className="h-8 rounded-lg px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: "var(--accent)", boxShadow: "0 8px 18px rgba(68, 86, 223, 0.16)" }}
                      >
                        打开会话
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-low)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${task.progress}%`, background: task.status === "failed" ? "var(--danger)" : task.status === "done" ? "var(--success)" : "var(--accent)" }}
                      />
                    </div>
                    <span className="w-10 text-right text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                      {task.progress}%
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-md px-2 py-1" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                      {task.agentLabel}
                    </span>
                    <span className="rounded-md px-2 py-1" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                      步骤 {task.doneStepCount}/{task.stepCount || 0}
                    </span>
                    <span className="rounded-md px-2 py-1" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                      产物 {task.artifactCount}
                    </span>
                    <span className="rounded-md px-2 py-1" style={{ color: task.deployLabel === "部署失败" ? "var(--danger)" : "var(--fg-secondary)", background: "var(--surface-low)" }}>
                      {task.deployLabel}
                    </span>
                    {task.deployUrl && (
                      <button
                        type="button"
                        onClick={() => openConversation(task.conversationId, "deploy")}
                        className="rounded-md px-2 py-1 font-semibold"
                        style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}
                      >
                        查看部署
                      </button>
                    )}
                  </div>

                  {recentSteps.length > 0 && (
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      {recentSteps.map((step, index) => {
                        const stepMeta = step.status === "failed" ? STATUS_META.failed : step.status === "done" ? STATUS_META.done : step.status === "running" ? STATUS_META.running : STATUS_META.waiting;
                        return (
                          <div
                            key={`${task.id}-${index}`}
                            className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2"
                            style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stepMeta.color }} />
                            <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
