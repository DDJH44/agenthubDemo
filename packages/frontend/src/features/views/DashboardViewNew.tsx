"use client";

import { useMemo } from "react";
import type { Conversation, Message } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type StatusKey = "running" | "active" | "waiting" | "done" | "failed";

interface DashboardTask {
  id: string;
  conversationId: string;
  name: string;
  desc: string;
  status: StatusKey;
  progress: number;
  agents: string[];
  updatedAt: string;
  artifactCount: number;
  deployLabel: string;
}

interface ActivityItem {
  id: string;
  name: string;
  action: string;
  status: StatusKey;
  desc: string;
  time: string;
  progress: number;
}

interface StepSnapshot {
  step?: string;
  label?: string;
  status?: string;
}

interface ConversationTaskSnapshot {
  steps?: StepSnapshot[];
  planSteps?: string[];
  isStreaming?: boolean;
  taskSummary?: string;
}

interface DashboardStep {
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

const STATUS_MAP: Record<StatusKey, { label: string; color: string; bg: string }> = {
  running: { label: "运行中", color: "#174ea6", bg: "rgba(23, 78, 166, 0.08)" },
  active: { label: "进行中", color: "#0f766e", bg: "rgba(15, 118, 110, 0.08)" },
  waiting: { label: "等待中", color: "#9a6700", bg: "rgba(154, 103, 0, 0.10)" },
  done: { label: "已完成", color: "#188038", bg: "rgba(24, 128, 56, 0.08)" },
  failed: { label: "待处理", color: "#a50e0e", bg: "rgba(165, 14, 14, 0.08)" },
};

const AGENT_COLORS = ["#174ea6", "#0f766e", "#9a6700", "#a50e0e", "#5f6368", "#7c3aed"];

const CONNECTED_AGENTS = [
  { name: "PMO 主 Agent", tag: "协调器", desc: "拆解、调度、降级、冲突处理" },
  { name: "Codex", tag: "代码", desc: "生成网页、代码和版本产物" },
  { name: "Claude Code", tag: "冲突", desc: "接管失败任务与 Diff 合并" },
  { name: "部署服务", tag: "部署", desc: "处理默认服务器和第三方平台部署状态" },
  { name: "UX Reviewer", tag: "自建", desc: "复核体验路径与交互问题" },
];

const AGENT_LABELS: Record<string, string> = {
  pmo: "PMO",
  planner: "PMO",
  codex: "Codex",
  coder: "Codex",
  researcher: "Researcher",
  worker: "Worker",
  refiner: "UX Reviewer",
  critic: "Critic",
  deploy: "部署服务",
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

function normalizeStepStatus(status: string | undefined): DashboardStep["status"] {
  const value = (status || "").toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("失败")) return "failed";
  if (value.includes("done") || value.includes("complete") || value.includes("success") || value.includes("完成")) return "done";
  if (value.includes("run") || value.includes("progress") || value.includes("执行") || value.includes("处理中")) return "running";
  return "pending";
}

function normalizeSteps(payload: Record<string, unknown>, taskState?: ConversationTaskSnapshot): DashboardStep[] {
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

function normalizeTaskStatus({
  payload,
  deployPayload,
  steps,
  isStreaming,
  hasSummary,
  hasTaskMessage,
}: {
  payload: Record<string, unknown>;
  deployPayload: Record<string, unknown>;
  steps: DashboardStep[];
  isStreaming: boolean;
  hasSummary: boolean;
  hasTaskMessage: boolean;
}): StatusKey {
  const raw = `${textValue(payload, "status")} ${textValue(payload, "phase")}`.toLowerCase();
  const deployStatus = textValue(deployPayload, "status").toLowerCase();

  if (raw.includes("fail") || raw.includes("error") || raw.includes("失败") || deployStatus.includes("fail")) return "failed";
  if (["deploying", "building", "running", "pending", "preparing", "queued"].some((item) => deployStatus.includes(item))) return "running";
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
  return "waiting";
}

function progressFor(status: StatusKey, payload: Record<string, unknown>, steps: DashboardStep[]) {
  if (status === "done") return 100;
  const payloadProgress = numericValue(payload, "progress");
  if (payloadProgress !== null) return Math.max(6, Math.min(100, Math.round(payloadProgress)));
  if (steps.length > 0) {
    const doneCount = steps.filter((step) => step.status === "done").length;
    const base = Math.round((doneCount / steps.length) * 100);
    if (status === "running" || status === "active") return Math.max(18, Math.min(92, base || 24));
    if (status === "failed") return Math.max(12, Math.min(96, base || 40));
    return Math.max(8, base);
  }
  if (status === "running" || status === "active") return 46;
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
  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < 60_000) return "刚刚";
  if (diff >= 0 && diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function buildDashboardTask(
  conversation: Conversation,
  messages: Message[],
  taskState?: ConversationTaskSnapshot
): DashboardTask | null {
  const taskMessage = findLatest(messages, isTaskMessage);
  const deployMessage = findLatest(messages, (message) => message.type === "deploy_card");
  const taskPayload = payloadOf(taskMessage);
  const deployPayload = payloadOf(deployMessage);
  const steps = normalizeSteps(taskPayload, taskState);
  const artifactCount = messages.filter(isArtifactMessage).length;
  const hasSummary = Boolean(taskState?.taskSummary);
  const hasTaskSignal = Boolean(taskMessage || deployMessage || steps.length > 0 || taskState?.isStreaming || taskState?.taskSummary || artifactCount > 0);

  if (!hasTaskSignal) return null;

  const status = normalizeTaskStatus({
    payload: taskPayload,
    deployPayload,
    steps,
    isStreaming: Boolean(taskState?.isStreaming),
    hasSummary,
    hasTaskMessage: Boolean(taskMessage),
  });
  const agentId = textValue(taskPayload, "activeAgentId") || textValue(taskPayload, "agentId") || textValue(taskPayload, "ownerAgentId");
  const agentLabel = agentId ? (AGENT_LABELS[agentId] || agentId) : "AgentHub";
  const updatedAt = numericValue(taskPayload, "updatedAt") || taskMessage?.timestamp || deployMessage?.timestamp || conversation.updatedAt || conversation.lastMessageAt || conversation.createdAt;
  const body = textValue(taskPayload, "body") || taskState?.taskSummary || conversation.lastMessage || "打开会话查看完整上下文与最新产物。";

  return {
    id: `${conversation.id}-${taskMessage?.id || deployMessage?.id || "runtime"}`,
    conversationId: conversation.id,
    name: textValue(taskPayload, "title") || conversation.title || "未命名任务",
    desc: body,
    status,
    progress: progressFor(status, taskPayload, steps),
    agents: [agentLabel],
    updatedAt: formatTime(updatedAt),
    artifactCount,
    deployLabel: deployLabel(deployPayload),
  };
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function AgentAvatar({ name, index, size = 28 }: { name: string; index: number; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md text-white"
      style={{
        width: size,
        height: size,
        background: AGENT_COLORS[index % AGENT_COLORS.length],
        fontSize: size * 0.36,
        fontWeight: 750,
      }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatusBadge({ status }: { status: StatusKey }) {
  const meta = STATUS_MAP[status];
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-semibold"
      style={{ color: meta.color, background: meta.bg }}
    >
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />}
      {meta.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
      <div
        className="h-full transition-all"
        style={{
          width: `${safeValue}%`,
          background: safeValue >= 100 ? "var(--success)" : "#174ea6",
        }}
      />
    </div>
  );
}

function EmptyPanel({
  title,
  desc,
  action,
  onAction,
}: {
  title: string;
  desc: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg px-6 py-8 text-center" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
      <p className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</p>
      <p className="mt-2 max-w-sm text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.7 }}>{desc}</p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold"
          style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.16)" }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function DashboardViewNew() {
  const { setActiveNav } = useNavigationStore();
  const { conversations, messages, conversationTasks, sessionAgentStatuses, taskProgress, taskFlow, setActiveConversation } = useChatStore();
  const switchConversation = useWorkspaceStore((state) => state.switchConversation);

  const tasks = useMemo<DashboardTask[]>(() => {
    const derivedTasks = conversations
      .filter((conversation) => conversation.status !== "archived")
      .map((conversation) =>
        buildDashboardTask(
          conversation,
          messages[conversation.id] ?? [],
          conversationTasks[conversation.id] as ConversationTaskSnapshot | undefined
        )
      )
      .filter((task): task is DashboardTask => Boolean(task));

    if (derivedTasks.length > 0) {
      const priority: Record<StatusKey, number> = { failed: 0, running: 1, active: 1, waiting: 2, done: 3 };
      return derivedTasks
        .sort((a, b) => priority[a.status] - priority[b.status])
        .slice(0, 6);
    }

    return taskFlow.slice(0, 6).map((task) => ({
      id: task.id,
      conversationId: "",
      name: task.taskName,
      desc: task.taskDescription,
      status: task.status === "done" ? "done" : task.status === "running" ? "running" : "waiting",
      progress: task.progress,
      agents: [task.agentName],
      updatedAt: "刚刚",
      artifactCount: 0,
      deployLabel: "未部署",
    }));
  }, [conversationTasks, conversations, messages, taskFlow]);

  const activity = useMemo<ActivityItem[]>(() => {
    const derivedActivity = tasks
      .filter((task) => task.status !== "waiting")
      .map((task) => ({
        id: `${task.id}-agent`,
        name: task.agents[0] || "AgentHub",
        action: task.status === "running" || task.status === "active" ? "正在执行" : task.status === "done" ? "任务完成" : "需要处理",
        status: task.status,
        desc: `${task.name} · ${task.deployLabel}${task.artifactCount ? ` · 产物 ${task.artifactCount}` : ""}`,
        time: task.updatedAt,
        progress: task.progress,
      }));

    if (derivedActivity.length > 0) return derivedActivity.slice(0, 6);

    return sessionAgentStatuses.map((agent) => {
      const agentStatus = String(agent.status);
      const status: StatusKey = agentStatus === "done" ? "done" : agentStatus === "running" ? "running" : agentStatus === "failed" ? "failed" : "waiting";
      return {
        id: agent.agentId,
        name: agent.agentName,
        action: status === "running" ? "正在执行" : status === "done" ? "任务完成" : status === "failed" ? "需要处理" : "等待调度",
        status,
        desc: `${agent.agentName} 当前状态：${STATUS_MAP[status].label}`,
        time: "刚刚",
        progress: agent.progress ?? (status === "done" ? 100 : 0),
      };
    });
  }, [sessionAgentStatuses, tasks]);

  const stats = useMemo(() => {
    const activeConversations = conversations.filter((conversation) => conversation.status === "active").length;
    const groupConversations = conversations.filter((conversation) => conversation.type !== "direct").length;
    const runningAgents = activity.filter((item) => item.status === "running" || item.status === "active").length;
    const completedTasks = Math.max(taskProgress?.completed ?? 0, tasks.filter((task) => task.status === "done").length, taskFlow.filter((task) => task.status === "done").length);

    return [
      { label: "活跃会话", value: activeConversations },
      { label: "群聊任务", value: groupConversations },
      { label: "运行 Agent", value: runningAgents },
      { label: "完成步骤", value: completedTasks },
    ];
  }, [activity, conversations, taskFlow, taskProgress, tasks]);

  const openConversation = (conversationId: string) => {
    if (!conversationId) {
      setActiveNav("tasks");
      return;
    }
    setActiveConversation(conversationId);
    switchConversation(conversationId);
    setActiveNav("chat");
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId } }));
    window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key: "chat" } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab: "tasks" } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab: "tasks" } }));
    }, 0);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>AgentHub 工作台</p>
            <h1 className="mt-1" style={{ color: "var(--fg-primary)", fontSize: 24, fontWeight: 760, lineHeight: 1.25 }}>
              多 Agent 协作项目控制台
            </h1>
            <p className="mt-2" style={{ color: "var(--fg-tertiary)", fontSize: 13, lineHeight: 1.65 }}>
              聚焦任务拆解、Agent 调度、产物流转和部署状态，让复杂协作保持在一个清晰工作台里。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveNav("chat")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold"
              style={{ color: "var(--fg-primary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            >
              <PlusIcon />
              新建任务
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="统计">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>{stat.label}</p>
              <p className="mt-2" style={{ color: "var(--fg-primary)", fontSize: 26, lineHeight: 1, fontWeight: 780 }}>{stat.value}</p>
            </div>
          ))}
        </section>

        <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 style={{ color: "var(--fg-primary)", fontSize: 16, fontWeight: 740 }}>任务队列</h2>
              <button type="button" onClick={() => setActiveNav("tasks")} className="text-xs font-semibold" style={{ color: "#174ea6" }}>
                查看全部
              </button>
            </div>

            {tasks.length === 0 ? (
              <EmptyPanel
                title="还没有执行中的任务"
                desc="从会话发起一个需求后，任务拆解、Agent 分配和执行进度会自动同步到这里。"
                action="去会话创建任务"
                onAction={() => setActiveNav("chat")}
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {tasks.map((task, taskIndex) => (
                  <article key={task.id} className="rounded-lg p-4 transition hover:-translate-y-0.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate" style={{ color: "var(--fg-primary)", fontSize: 14, fontWeight: 720 }}>{task.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{task.desc}</p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>

                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span style={{ color: "var(--fg-tertiary)" }}>进度</span>
                        <span style={{ color: "var(--fg-secondary)", fontWeight: 650 }}>{task.progress}%</span>
                      </div>
                      <ProgressBar value={task.progress} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex gap-1">
                          {task.agents.slice(0, 3).map((agent, agentIndex) => (
                            <AgentAvatar key={agent} name={agent} index={taskIndex + agentIndex} />
                          ))}
                        </div>
                        <div className="min-w-0 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                          <span>{task.artifactCount ? `产物 ${task.artifactCount}` : "暂无产物"}</span>
                          <span className="mx-1">·</span>
                          <span>{task.deployLabel}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs" style={{ color: "var(--fg-disabled)" }}>{task.updatedAt}</span>
                        <button
                          type="button"
                          onClick={() => openConversation(task.conversationId)}
                          className="h-7 rounded-md px-2.5 text-xs font-semibold"
                          style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.16)" }}
                        >
                          打开
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 style={{ color: "var(--fg-primary)", fontSize: 16, fontWeight: 740 }}>Agent 状态</h2>
              <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{activity.length} 条</span>
            </div>

            {activity.length === 0 ? (
              <EmptyPanel
                title="暂无 Agent 执行状态"
                desc="当 PMO 开始拆解并调度子 Agent 后，这里会展示实时状态、进度和最近动作。"
              />
            ) : (
              <div className="rounded-lg" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
                {activity.map((item, index) => (
                  <div key={item.id} className="flex gap-3 p-4" style={{ borderBottom: index === activity.length - 1 ? "none" : "1px solid var(--divider)" }}>
                    <AgentAvatar name={item.name} index={index} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{item.name}</span>
                        <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{item.action}</span>
                      </div>
                      <p className="line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{item.desc}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <ProgressBar value={item.progress} />
                        </div>
                        <span className="shrink-0 text-xs" style={{ color: "var(--fg-disabled)" }}>{item.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 style={{ color: "var(--fg-primary)", fontSize: 16, fontWeight: 740 }}>接入 Agent</h2>
                <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{CONNECTED_AGENTS.length} 个</span>
              </div>
              <div className="rounded-lg" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
                {CONNECTED_AGENTS.map((agent, index) => (
                  <div key={agent.name} className="flex items-center gap-3 p-3" style={{ borderBottom: index === CONNECTED_AGENTS.length - 1 ? "none" : "1px solid var(--divider)" }}>
                    <AgentAvatar name={agent.name} index={index} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{agent.name}</span>
                        <span className="rounded-sm px-1.5 py-0.5 text-xs" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>{agent.tag}</span>
                      </div>
                      <p className="truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{agent.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
