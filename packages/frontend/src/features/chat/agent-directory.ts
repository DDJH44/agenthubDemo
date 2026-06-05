import type { Conversation, UserAgent } from "@agenthub/shared";
import { AGENT_ROLE_LABELS, MAIN_AGENT_ID, TOOL_OPTIONS } from "@agenthub/shared";

export interface AgentDirectoryEntry {
  id: string;
  aliases: string[];
  name: string;
  provider: string;
  role: string;
  badge: string;
  color: string;
  capabilities: string[];
  isCustom?: boolean;
  connection: AgentConnection;
}

export type AgentConnectionState = "local" | "live" | "demo" | "fallback" | "unconfigured";

export interface AgentConnection {
  state: AgentConnectionState;
  label: string;
  adapter: string;
  boundary: string;
  lastChecked: string;
}

interface ConversationAgentOptions {
  excludeParticipantIds?: string[];
}

export const CONNECTION_STATE_META: Record<AgentConnectionState, { label: string; shortLabel: string; color: string; bg: string; border: string }> = {
  local: { label: "内置可用", shortLabel: "内置", color: "#174ea6", bg: "rgba(23, 78, 166, 0.07)", border: "rgba(23, 78, 166, 0.16)" },
  live: { label: "真实适配器", shortLabel: "真实", color: "var(--success)", bg: "var(--success-subtle)", border: "var(--success-border)" },
  demo: { label: "内置适配器", shortLabel: "内置", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)", border: "rgba(124, 58, 237, 0.18)" },
  fallback: { label: "降级接管", shortLabel: "降级", color: "#9a6700", bg: "rgba(154, 103, 0, 0.10)", border: "rgba(154, 103, 0, 0.18)" },
  unconfigured: { label: "待配置", shortLabel: "待配", color: "var(--fg-tertiary)", bg: "var(--surface-low)", border: "var(--border)" },
};

const CUSTOM_CONNECTION: AgentConnection = {
  state: "local",
  label: "用户自建",
  adapter: "user-agent-store",
  boundary: "本地保存用户配置，进入会话后按同一 Agent 联系人模型展示。",
  lastChecked: "随用户配置更新",
};

export const AGENT_DIRECTORY: AgentDirectoryEntry[] = [
  {
    id: "pmo",
    aliases: [MAIN_AGENT_ID, "AgentHub 助手", "pmo", "pm", "pmo 主 agent", "pm agent", "主 agent", "pmo 主 Agent"],
    name: "PMO 主 Agent",
    provider: "AgentHub",
    role: "协调器",
    badge: "PMO",
    color: "#174ea6",
    capabilities: ["任务拆解", "并行调度", "失败降级"],
    connection: {
      state: "local",
      label: "内置编排器",
      adapter: "orchestrator",
      boundary: "PMO 调度逻辑由 AgentHub 内置流程和会话事件驱动，不依赖外部模型即可完成拆解、派发和降级编排。",
      lastChecked: "随应用启动",
    },
  },
  {
    id: "codex",
    aliases: ["codex", "openai codex"],
    name: "Codex",
    provider: "OpenAI",
    role: "代码 Agent",
    badge: "CX",
    color: "#0f766e",
    capabilities: ["代码生成", "代码编辑", "Diff"],
    connection: {
      state: "live",
      label: "Codex 适配器",
      adapter: "packages/adapter/src/codex",
      boundary: "具备真实适配器入口；实际可用性取决于本地环境变量和模型服务配置。",
      lastChecked: "运行时校验",
    },
  },
  {
    id: "claude-code",
    aliases: ["claude", "claude code", "cloud code", "claude-code"],
    name: "Claude Code",
    provider: "Anthropic",
    role: "冲突处理",
    badge: "CL",
    color: "#9a6700",
    capabilities: ["冲突合并", "降级接管", "代码审查"],
    connection: {
      state: "fallback",
      label: "降级通道",
      adapter: "packages/adapter/src/claude-code",
      boundary: "用于失败降级、冲突复核和接管策略；外部接口不可用时进入降级队列并保留冲突事件。",
      lastChecked: "任务派发时",
    },
  },
  {
    id: "open-code",
    aliases: ["open code", "opencode", "open-code"],
    name: "Open Code",
    provider: "Open Code",
    role: "部署 Agent",
    badge: "OC",
    color: "#7c3aed",
    capabilities: ["构建部署", "发布回调", "日志诊断"],
    connection: {
      state: "demo",
      label: "内置部署通道",
      adapter: "deploy sandbox adapter",
      boundary: "当前通过内置部署通道完成状态卡片、日志回写和预览链接；真实 Open Code 执行器按同一 adapter 接口接入。",
      lastChecked: "部署面板执行时",
    },
  },
  {
    id: "ux-reviewer",
    aliases: ["ux reviewer", "自建 ux reviewer", "ux-reviewer"],
    name: "自建 UX Reviewer",
    provider: "Custom",
    role: "自建 Agent",
    badge: "UX",
    color: "#a50e0e",
    capabilities: ["体验审查", "验收路径", "文案建议"],
    isCustom: true,
    connection: {
      state: "demo",
      label: "自建样例",
      adapter: "user-agent-store",
      boundary: "作为用户自建 Agent 样例参与群聊，证明头像、名称、能力标签和上下文派发能力。",
      lastChecked: "随会话更新",
    },
  },
  {
    id: "researcher",
    aliases: ["researcher", "research"],
    name: "Researcher",
    provider: "AgentHub",
    role: "资料 Agent",
    badge: "R",
    color: "#0e7490",
    capabilities: ["需求摘录", "文档引用", "上下文整理"],
    connection: {
      state: "local",
      label: "上下文工具",
      adapter: "context panel",
      boundary: "主要使用本地文档段落、消息引用和产物元数据整理上下文。",
      lastChecked: "随会话更新",
    },
  },
];

const FALLBACK_COLORS = ["#174ea6", "#0f766e", "#9a6700", "#a50e0e", "#5f6368", "#7c3aed", "#0e7490"];
const TOOL_LABELS = new Map(TOOL_OPTIONS.map((tool) => [tool.value, tool.label]));

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function fallbackAgent(name: string): AgentDirectoryEntry {
  const first = name.trim().charAt(0) || "A";
  return {
    id: normalize(name) || "agent",
    aliases: [name],
    name,
    provider: "Custom",
    role: "Agent",
    badge: first.toUpperCase(),
    color: FALLBACK_COLORS[Math.abs(name.charCodeAt(0) || 0) % FALLBACK_COLORS.length],
    capabilities: ["自定义能力"],
    isCustom: true,
    connection: CUSTOM_CONNECTION,
  };
}

function userAgentToDirectoryEntry(agent: UserAgent): AgentDirectoryEntry {
  const roleLabel = AGENT_ROLE_LABELS[agent.role] ?? "自建 Agent";
  const toolCapabilities = agent.tools.map((tool) => TOOL_LABELS.get(tool) ?? tool);
  const capabilities = toolCapabilities.length > 0 ? toolCapabilities.slice(0, 3) : [roleLabel];
  const badgeSource = agent.avatar || agent.name.slice(0, 2) || "AI";

  return {
    id: agent.id,
    aliases: [agent.id, agent.name],
    name: agent.name,
    provider: "Custom",
    role: roleLabel,
    badge: badgeSource.toUpperCase(),
    color: agent.avatarBg,
    capabilities,
    isCustom: true,
    connection: {
      ...CUSTOM_CONNECTION,
      adapter: agent.model,
      boundary: `用户自建 Agent，模型配置为 ${agent.model}，工具权限由创建表单控制。`,
      lastChecked: "用户配置",
    },
  };
}

export function getAgentConnection(agent: AgentDirectoryEntry): AgentConnection {
  return agent.connection ?? CUSTOM_CONNECTION;
}

export function getConnectionStateMeta(state: AgentConnectionState) {
  return CONNECTION_STATE_META[state];
}

export function summarizeAgentConnections(agents: AgentDirectoryEntry[]) {
  const counts = agents.reduce<Record<AgentConnectionState, number>>((acc, agent) => {
    const state = getAgentConnection(agent).state;
    acc[state] += 1;
    return acc;
  }, { local: 0, live: 0, demo: 0, fallback: 0, unconfigured: 0 });

  const state: AgentConnectionState =
    counts.fallback > 0 ? "fallback" :
    counts.demo > 0 ? "demo" :
    counts.unconfigured > 0 ? "unconfigured" :
    counts.live > 0 ? "live" :
    "local";

  return {
    state,
    counts,
    meta: getConnectionStateMeta(state),
  };
}

function findUserAgent(nameOrId: string, userAgents: UserAgent[]): AgentDirectoryEntry | null {
  const key = normalize(nameOrId);
  const found = userAgents.find((agent) => normalize(agent.id) === key || normalize(agent.name) === key);
  return found ? userAgentToDirectoryEntry(found) : null;
}

function isKnownDirectoryAgent(nameOrId: string) {
  const key = normalize(nameOrId);
  return AGENT_DIRECTORY.some((agent) => agent.id === key || agent.aliases.some((alias) => normalize(alias) === key));
}

function shouldHideParticipant(nameOrId: string, userAgents: UserAgent[], options: ConversationAgentOptions) {
  const key = normalize(nameOrId);
  if (!key) return true;

  const excludedIds = new Set((options.excludeParticipantIds ?? []).map(normalize));
  if (excludedIds.has(key)) return true;
  if (isKnownDirectoryAgent(nameOrId)) return false;
  if (findUserAgent(nameOrId, userAgents)) return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId.trim());
}

function isLikelyRealUserParticipant(nameOrId: string, userAgents: UserAgent[]) {
  const key = normalize(nameOrId);
  if (!key) return false;
  if (isKnownDirectoryAgent(nameOrId)) return false;
  if (findUserAgent(nameOrId, userAgents)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId.trim());
}

export function getRealParticipantIds(conversation: Conversation | null | undefined, userAgents: UserAgent[] = []): string[] {
  if (!conversation) return [];
  return conversation.participants.filter((participant) => isLikelyRealUserParticipant(participant, userAgents));
}

export function isMultiUserConversation(conversation: Conversation | null | undefined, userAgents: UserAgent[] = []) {
  return conversation?.type === "group" && getRealParticipantIds(conversation, userAgents).length >= 2;
}

export function getAgentMeta(nameOrId: string, userAgents: UserAgent[] = []): AgentDirectoryEntry {
  const key = normalize(nameOrId);
  const userAgentById = userAgents.find((agent) => normalize(agent.id) === key);
  if (userAgentById) return userAgentToDirectoryEntry(userAgentById);

  const found = AGENT_DIRECTORY.find((agent) => agent.id === key || agent.aliases.some((alias) => normalize(alias) === key));
  if (found) return found;

  const userAgent = findUserAgent(nameOrId, userAgents);
  if (userAgent) return userAgent;

  return fallbackAgent(nameOrId);
}

export function getConversationAgents(conversation: Conversation, userAgents: UserAgent[] = [], options: ConversationAgentOptions = {}): AgentDirectoryEntry[] {
  const names = conversation.participants.length > 0
    ? conversation.participants.filter((name) => !shouldHideParticipant(name, userAgents, options))
    : [conversation.title];
  const inferred = [...names];
  const title = conversation.title.toLowerCase();
  for (const agent of AGENT_DIRECTORY) {
    if (agent.aliases.some((alias) => title.includes(alias.toLowerCase()))) {
      inferred.push(agent.name);
    }
  }

  const seen = new Set<string>();
  return inferred
    .map((name) => getAgentMeta(name, userAgents))
    .filter((agent) => {
      if (seen.has(agent.id)) return false;
      seen.add(agent.id);
      return true;
    });
}

export function getConversationCapabilityTags(conversation: Conversation, max = 4, userAgents: UserAgent[] = [], options: ConversationAgentOptions = {}): string[] {
  const tags: string[] = [];
  for (const agent of getConversationAgents(conversation, userAgents, options)) {
    if (agent.id === "pmo") tags.push("主 Agent");
    if (agent.isCustom) tags.push("自建 Agent");
    tags.push(...agent.capabilities);
  }

  if (conversation.type === "group") tags.unshift("群聊协作");
  if (conversation.type === "direct") tags.unshift("单聊");

  return Array.from(new Set(tags)).slice(0, max);
}
