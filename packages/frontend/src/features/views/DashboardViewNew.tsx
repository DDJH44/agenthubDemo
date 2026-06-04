"use client";

import { useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";

type StatusKey = "running" | "active" | "waiting" | "done";

interface DashboardTask {
  id: string;
  name: string;
  desc: string;
  status: StatusKey;
  progress: number;
  agents: string[];
  updatedAt: string;
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

const STATUS_MAP: Record<StatusKey, { label: string; color: string; bg: string }> = {
  running: { label: "运行中", color: "#174ea6", bg: "rgba(23, 78, 166, 0.08)" },
  active: { label: "进行中", color: "#0f766e", bg: "rgba(15, 118, 110, 0.08)" },
  waiting: { label: "等待中", color: "#9a6700", bg: "rgba(154, 103, 0, 0.10)" },
  done: { label: "已完成", color: "#188038", bg: "rgba(24, 128, 56, 0.08)" },
};

const AGENT_COLORS = ["#174ea6", "#0f766e", "#9a6700", "#a50e0e", "#5f6368", "#7c3aed"];

const CONNECTED_AGENTS = [
  { name: "PMO 主 Agent", tag: "协调器", desc: "拆解、调度、降级、冲突处理" },
  { name: "Codex", tag: "代码", desc: "生成网页、代码和版本产物" },
  { name: "Claude Code", tag: "冲突", desc: "接管失败任务与 Diff 合并" },
  { name: "Open Code", tag: "部署", desc: "处理第三方平台部署状态" },
  { name: "UX Reviewer", tag: "自建", desc: "复核演示路径与体验问题" },
];

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
  const { conversations, sessionAgentStatuses, taskProgress, taskFlow } = useChatStore();

  const tasks = useMemo<DashboardTask[]>(() => {
    if (taskFlow.length === 0) return [];

    return taskFlow.map((task) => ({
      id: task.id,
      name: task.taskName,
      desc: task.taskDescription,
      status: task.status === "done" ? "done" : task.status === "running" ? "running" : "waiting",
      progress: task.progress,
      agents: [task.agentName],
      updatedAt: "刚刚",
    }));
  }, [taskFlow]);

  const activity = useMemo<ActivityItem[]>(() => {
    if (sessionAgentStatuses.length === 0) return [];

    return sessionAgentStatuses.map((agent) => {
      const status: StatusKey = agent.status === "done" ? "done" : agent.status === "running" ? "running" : "waiting";
      return {
        id: agent.agentId,
        name: agent.agentName,
        action: status === "running" ? "正在执行" : status === "done" ? "任务完成" : "等待调度",
        status,
        desc: `${agent.agentName} 当前状态：${STATUS_MAP[status].label}`,
        time: "刚刚",
        progress: agent.progress ?? (status === "done" ? 100 : 0),
      };
    });
  }, [sessionAgentStatuses]);

  const stats = useMemo(() => {
    const activeConversations = conversations.filter((conversation) => conversation.status === "active").length;
    const groupConversations = conversations.filter((conversation) => conversation.type !== "direct").length;
    const runningAgents = sessionAgentStatuses.filter((agent) => agent.status === "running").length;
    const completedTasks = taskProgress?.completed ?? taskFlow.filter((task) => task.status === "done").length;

    return [
      { label: "活跃会话", value: activeConversations },
      { label: "群聊任务", value: groupConversations },
      { label: "运行 Agent", value: runningAgents },
      { label: "完成步骤", value: completedTasks },
    ];
  }, [conversations, sessionAgentStatuses, taskProgress, taskFlow]);

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
                      <div className="flex gap-1">
                        {task.agents.slice(0, 3).map((agent, agentIndex) => (
                          <AgentAvatar key={agent} name={agent} index={taskIndex + agentIndex} />
                        ))}
                      </div>
                      <span className="text-xs" style={{ color: "var(--fg-disabled)" }}>{task.updatedAt}</span>
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
