"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENT_DIRECTORY, getAgentConnection, getConnectionStateMeta, type AgentConnectionState } from "@/features/chat/agent-directory";
import { api } from "@/lib/api-client";
import { useNavigationStore } from "@/stores/navigation-store";
import { useUserAgentStore } from "@/stores/user-agent-store";

type AgentStatus = "online" | "running" | "idle";

interface PlatformAgent {
  id: string;
  name: string;
  provider: string;
  role: string;
  status: AgentStatus;
  color: string;
  desc: string;
  capabilities: string[];
  adapter: string;
  fallback: string;
  tools: string[];
}

interface PlatformHealthItem {
  id: string;
  name: string;
  provider: string;
  adapterType: "codex" | "claude-code";
  adapter: string;
  command: string;
  configured: boolean;
  state: AgentConnectionState;
  version?: string;
  message: string;
  capabilities: string[];
  checkedAt: string;
}

interface PlatformHealthResponse {
  minimumRequired: number;
  configuredCount: number;
  supportedCount: number;
  minimumSatisfied: boolean;
  platforms: PlatformHealthItem[];
}

function normalizePlatformHealth(data: Partial<PlatformHealthResponse> | null | undefined): PlatformHealthResponse {
  const platforms = Array.isArray(data?.platforms) ? data.platforms : [];
  const minimumRequired = typeof data?.minimumRequired === "number" ? data.minimumRequired : 2;
  const configuredCount = typeof data?.configuredCount === "number"
    ? data.configuredCount
    : platforms.filter((platform) => platform.configured).length;
  const supportedCount = typeof data?.supportedCount === "number"
    ? data.supportedCount
    : Math.max(platforms.length, minimumRequired);

  return {
    minimumRequired,
    configuredCount,
    supportedCount,
    minimumSatisfied: typeof data?.minimumSatisfied === "boolean" ? data.minimumSatisfied : configuredCount >= minimumRequired,
    platforms,
  };
}

const PLATFORM_AGENTS: PlatformAgent[] = [
  {
    id: "pmo",
    name: "PMO 主 Agent",
    provider: "AgentHub",
    role: "协调器",
    status: "running",
    color: "#174ea6",
    desc: "理解用户目标，拆解复杂任务，调度子 Agent，并负责失败降级和冲突合并策略。",
    capabilities: ["任务拆解", "并行调度", "上下文管理", "失败降级"],
    adapter: "orchestrator",
    fallback: "子任务失败时重新分配给 Claude Code 或 Codex，并保留冲突 Diff。",
    tools: ["plan", "assign", "memory", "diff"],
  },
  {
    id: "codex",
    name: "Codex",
    provider: "OpenAI",
    role: "代码实现",
    status: "online",
    color: "#0f766e",
    desc: "负责代码生成、产物编辑、测试修复和版本化输出。",
    capabilities: ["代码生成", "代码编辑", "测试修复", "版本输出"],
    adapter: "packages/adapter/src/codex",
    fallback: "遇到同文件冲突时交给 Claude Code 合并。",
    tools: ["code", "file_write", "diff_apply"],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    provider: "Anthropic",
    role: "冲突处理",
    status: "online",
    color: "#9a6700",
    desc: "负责代码审查、冲突合并、失败任务接管和可读 Diff 输出。",
    capabilities: ["代码审查", "冲突合并", "失败接管", "Diff 说明"],
    adapter: "packages/adapter/src/claude-code",
    fallback: "无法合并时回退 PMO 重新拆分任务。",
    tools: ["review", "merge", "diff"],
  },
  {
    id: "researcher",
    name: "Researcher",
    provider: "AgentHub",
    role: "上下文整理",
    status: "idle",
    color: "#0e7490",
    desc: "负责引用文档段落、整理上下文和把材料交给其他 Agent 继续处理。",
    capabilities: ["文档引用", "上下文摘要", "资料整理"],
    adapter: "openai-compatible",
    fallback: "文档不可读时回退为用户手动粘贴段落。",
    tools: ["file_read", "web_search", "summary"],
  },
];

const STATUS_META: Record<AgentStatus, { label: string; color: string; bg: string }> = {
  online: { label: "在线", color: "var(--success)", bg: "var(--success-subtle)" },
  running: { label: "运行中", color: "var(--accent)", bg: "var(--accent-subtle)" },
  idle: { label: "待命", color: "var(--fg-tertiary)", bg: "var(--surface-low)" },
};

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function AgentAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ background: color }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: meta.color, background: meta.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function getPlatformConnection(agentId: string) {
  const entry = AGENT_DIRECTORY.find((agent) => agent.id === agentId);
  return entry ? getAgentConnection(entry) : null;
}

function connectionFromHealth(agentId: string, health?: PlatformHealthItem | null) {
  if (!health) return getPlatformConnection(agentId);
  return {
    state: health.configured ? "live" as const : "unconfigured" as const,
    label: health.configured ? "CLI 可用" : "待配置",
    adapter: health.adapter,
    boundary: health.message,
    lastChecked: health.version ? health.version : "刚刚检测",
  };
}

function ConnectionBadge({ agentId, health }: { agentId: string; health?: PlatformHealthItem }) {
  const connection = connectionFromHealth(agentId, health);
  if (!connection) return null;
  const meta = getConnectionStateMeta(connection.state);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
      title={connection.boundary}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {health ? (health.configured ? "可用" : "待配") : meta.shortLabel}
    </span>
  );
}

function PlatformAgentCard({
  agent,
  health,
  selected,
  onClick,
}: {
  agent: PlatformAgent;
  health?: PlatformHealthItem;
  selected: boolean;
  onClick: () => void;
}) {
  const effectiveStatus: AgentStatus = health ? (health.configured ? "online" : "idle") : agent.status;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg p-4 text-left transition-colors hover:bg-[var(--surface-low)]"
      style={{
        background: selected ? "var(--accent-subtle)" : "var(--surface-white)",
        border: `1px solid ${selected ? "var(--accent-border)" : "var(--border)"}`,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.name} color={agent.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{agent.name}</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>{agent.provider} · {agent.role}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <ConnectionBadge agentId={agent.id} health={health} />
              <StatusBadge status={effectiveStatus} />
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{agent.desc}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.capabilities.slice(0, 4).map((capability) => (
          <span key={capability} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
            {capability}
          </span>
        ))}
      </div>
    </button>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <div className="mt-1 text-sm" style={{ color: "var(--fg-primary)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function AgentsView() {
  const { setActiveNav } = useNavigationStore();
  const userAgents = useUserAgentStore((state) => state.agents);
  const [selectedId, setSelectedId] = useState("pmo");
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthResponse | null>(null);
  const [platformHealthError, setPlatformHealthError] = useState("");

  useEffect(() => {
    let mounted = true;
    api.get<PlatformHealthResponse>("/api/agent-platforms/status")
      .then((data) => {
        if (!mounted) return;
        setPlatformHealth(normalizePlatformHealth(data));
        setPlatformHealthError("");
      })
      .catch((error) => {
        if (!mounted) return;
        setPlatformHealthError(error instanceof Error ? error.message : "平台检测失败");
      });
    return () => { mounted = false; };
  }, []);

  const selected = PLATFORM_AGENTS.find((agent) => agent.id === selectedId) ?? PLATFORM_AGENTS[0];
  const platformItems = useMemo(() => platformHealth?.platforms ?? [], [platformHealth?.platforms]);
  const healthById = useMemo(() => new Map(platformItems.map((item) => [item.id, item])), [platformItems]);
  const selectedHealth = healthById.get(selected.id);
  const selectedEffectiveStatus: AgentStatus = selectedHealth ? (selectedHealth.configured ? "online" : "idle") : selected.status;
  const selectedConnection = connectionFromHealth(selected.id, selectedHealth);
  const selectedConnectionMeta = selectedConnection ? getConnectionStateMeta(selectedConnection.state) : null;
  const stats = useMemo(() => {
    const supportedMainstream = platformHealth?.supportedCount ?? 2;
    const availableMainstream = platformHealth?.configuredCount ?? 0;
    return [
      { label: "平台 Agent", value: PLATFORM_AGENTS.length },
      { label: "主流平台接口", value: supportedMainstream },
      { label: "自建 Agent", value: userAgents.length },
      { label: "当前可用", value: `${availableMainstream}/${supportedMainstream}` },
    ];
  }, [platformHealth?.configuredCount, platformHealth?.supportedCount, userAgents.length]);
  const connectionHealth = useMemo(() => {
    const counts = PLATFORM_AGENTS.reduce<Record<AgentConnectionState, number>>((acc, agent) => {
      const health = healthById.get(agent.id);
      const state = health ? connectionFromHealth(agent.id, health)?.state ?? "unconfigured" : getPlatformConnection(agent.id)?.state ?? "unconfigured";
      acc[state] += 1;
      return acc;
    }, { local: 0, live: 0, managed: 0, fallback: 0, unconfigured: 0 });
    const ready = counts.local + counts.live;
    const total = PLATFORM_AGENTS.length;
    return {
      ready,
      total,
      readiness: Math.round((ready / total) * 100),
      items: [
        { state: "live" as const, label: "真实适配器", value: counts.live, desc: "已具备真实平台入口，运行时按环境配置校验。" },
        { state: "local" as const, label: "内置能力", value: counts.local, desc: "由 AgentHub 本地流程直接支撑，无需外部密钥。" },
        { state: "managed" as const, label: "系统托管", value: counts.managed, desc: "由 AgentHub 服务端托管的能力，运行边界会在状态中明确展示。" },
        { state: "fallback" as const, label: "降级通道", value: counts.fallback, desc: "外部执行失败时保留接管、冲突和回滚证据。" },
      ],
    };
  }, [healthById]);

  return (
    <div className="flex h-full min-h-0" style={{ background: "var(--page-bg)" }}>
      <div className="min-w-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>多 Agent 接入</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--fg-primary)" }}>Agent 平台与能力</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--fg-tertiary)", lineHeight: 1.7 }}>
              展示主 Agent、Codex、Claude Code 和自建 Agent 的联系人式信息，包含头像、名称、能力标签和降级策略。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveNav("my-agents")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold"
              style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}
            >
              <Icon path="M12 5v14M5 12h14" size={13} />
              创建自建 Agent
            </button>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>{stat.label}</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: "var(--fg-primary)" }}>{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>连接健康检查</h2>
              <p className="mt-1 max-w-2xl text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
                明确区分真实 CLI 平台、内置能力和降级通道；Codex / Claude Code 会由后端检测当前服务器是否可执行。
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              {platformHealth
                ? `${platformHealth.configuredCount}/${platformHealth.minimumRequired} 主流平台可用`
                : platformHealthError
                ? "检测失败"
                : "检测中"}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {connectionHealth.items.map((item) => {
              const meta = getConnectionStateMeta(item.state);
              return (
                <div key={item.label} className="rounded-lg p-3" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold" style={{ color: meta.color }}>{item.label}</p>
                    <span className="text-sm font-bold" style={{ color: meta.color }}>{item.value}</span>
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{item.desc}</p>
                </div>
              );
            })}
          </div>
          {platformHealthError && (
            <p className="mt-3 rounded-md px-3 py-2 text-xs" style={{ color: "var(--danger)", background: "var(--danger-subtle)", border: "1px solid var(--danger-border)" }}>
              {platformHealthError}
            </p>
          )}
          {platformItems.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {platformItems.map((platform) => {
                const meta = getConnectionStateMeta(platform.configured ? "live" : "unconfigured");
                return (
                  <div key={platform.id} className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>{platform.name}</p>
                      <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
                        {platform.configured ? "CLI 可用" : "待配置"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{platform.message}</p>
                    <p className="mt-1 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>命令：{platform.command}{platform.version ? ` · ${platform.version}` : ""}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-3 xl:grid-cols-2">
          {PLATFORM_AGENTS.map((agent) => (
            <PlatformAgentCard key={agent.id} agent={agent} health={healthById.get(agent.id)} selected={selected.id === agent.id} onClick={() => setSelectedId(agent.id)} />
          ))}
        </section>

        <section className="mt-6 rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>自建 Agent</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>用户创建的 Agent 会和平台 Agent 一起进入会话联系人列表。</p>
            </div>
            <button type="button" onClick={() => setActiveNav("my-agents")} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
              管理
            </button>
          </div>
          {userAgents.length === 0 ? (
            <p className="rounded-md px-3 py-3 text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
              暂无自建 Agent。点击“创建自建 Agent”可以添加 UX Reviewer、测试工程师或业务专家。
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {userAgents.slice(0, 4).map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 rounded-md p-3" style={{ background: "var(--surface-low)" }}>
                  <div className="grid h-9 w-9 place-items-center rounded-md text-xs font-bold text-white" style={{ background: agent.avatarBg }}>
                    {agent.avatar || agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{agent.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{agent.tools.length} 个工具 · {agent.model}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="hidden w-[380px] shrink-0 overflow-y-auto p-5 xl:block custom-scrollbar" style={{ background: "var(--surface-white)", borderLeft: "1px solid var(--border)" }}>
        <div className="mb-5 flex items-center gap-3">
          <AgentAvatar name={selected.name} color={selected.color} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold" style={{ color: "var(--fg-primary)" }}>{selected.name}</h2>
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{selected.provider} · {selected.role}</p>
          </div>
          <div className="ml-auto flex gap-1"><ConnectionBadge agentId={selected.id} health={selectedHealth} /><StatusBadge status={selectedEffectiveStatus} /></div>
        </div>

        <div className="space-y-5">
          <DetailField label="职责">{selected.desc}</DetailField>
          {selectedConnection && selectedConnectionMeta && (
            <DetailField label="连接状态">
              <div className="rounded-md p-3" style={{ color: selectedConnectionMeta.color, background: selectedConnectionMeta.bg, border: `1px solid ${selectedConnectionMeta.border}` }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{selectedConnectionMeta.label}</span>
                  <span className="text-[10px]">{selectedConnection.lastChecked}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.6 }}>{selectedConnection.boundary}</p>
              </div>
            </DetailField>
          )}
          <DetailField label="适配器">
            <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-low)", color: "var(--accent)" }}>{selectedConnection?.adapter ?? selected.adapter}</code>
          </DetailField>
          <DetailField label="能力标签">
            <div className="flex flex-wrap gap-1.5">
              {selected.capabilities.map((capability) => (
                <span key={capability} className="rounded-sm px-2 py-1 text-xs" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>{capability}</span>
              ))}
            </div>
          </DetailField>
          <DetailField label="工具权限">
            <div className="flex flex-wrap gap-1.5">
              {selected.tools.map((tool) => (
                <span key={tool} className="rounded-sm px-2 py-1 text-xs" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>{tool}</span>
              ))}
            </div>
          </DetailField>
          <DetailField label="失败降级">{selected.fallback}</DetailField>
        </div>

      </aside>
    </div>
  );
}
