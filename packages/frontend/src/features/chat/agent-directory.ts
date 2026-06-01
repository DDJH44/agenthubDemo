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
}

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
  };
}

function findUserAgent(nameOrId: string, userAgents: UserAgent[]): AgentDirectoryEntry | null {
  const key = normalize(nameOrId);
  const found = userAgents.find((agent) => normalize(agent.id) === key || normalize(agent.name) === key);
  return found ? userAgentToDirectoryEntry(found) : null;
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

export function getConversationAgents(conversation: Conversation, userAgents: UserAgent[] = []): AgentDirectoryEntry[] {
  const names = conversation.participants.length > 0 ? conversation.participants : [conversation.title];
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

export function getConversationCapabilityTags(conversation: Conversation, max = 4, userAgents: UserAgent[] = []): string[] {
  const tags: string[] = [];
  for (const agent of getConversationAgents(conversation, userAgents)) {
    if (agent.id === "pmo") tags.push("主 Agent");
    if (agent.isCustom) tags.push("自建 Agent");
    tags.push(...agent.capabilities);
  }

  if (conversation.type === "group") tags.unshift("群聊协作");
  if (conversation.type === "direct") tags.unshift("单聊");

  return Array.from(new Set(tags)).slice(0, max);
}
