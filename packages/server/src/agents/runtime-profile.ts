import { userAgentConfigRepo } from "../db/repositories/user-agent-config";
import { normalizeAgentKey, isCoordinatorAgent } from "./conversation-routing";

export interface AgentRuntimeProfile {
  id: string;
  name: string;
  type: string;
  model?: string;
  systemPrompt?: string;
  tools: string[];
  configured: boolean;
}

interface RawAgentConfig {
  model?: unknown;
  systemPrompt?: unknown;
  tools?: unknown;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function profileFromFallback(agentName: string): AgentRuntimeProfile {
  return {
    id: agentName,
    name: agentName,
    type: isCoordinatorAgent(agentName) ? "planner" : "custom",
    tools: [],
    configured: false,
  };
}

function profileFromRecord(record: {
  id: string;
  name: string;
  type: string;
  config: string;
  permissions: string;
}): AgentRuntimeProfile {
  const config = parseJsonObject(record.config) as RawAgentConfig;
  const configTools = Array.isArray(config.tools) ? config.tools.filter((item): item is string => typeof item === "string") : [];
  const permissionTools = parseJsonArray(record.permissions);

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    model: typeof config.model === "string" ? config.model : undefined,
    systemPrompt: typeof config.systemPrompt === "string" ? config.systemPrompt.trim() : undefined,
    tools: [...new Set([...configTools, ...permissionTools])],
    configured: true,
  };
}

export async function resolveAgentRuntimeProfiles(userId: string, agentNames: string[]): Promise<AgentRuntimeProfile[]> {
  const records = userId ? await userAgentConfigRepo.listByUser(userId) : [];
  const byId = new Map(records.map((record) => [record.id, record]));
  const byName = new Map(records.map((record) => [normalizeAgentKey(record.name), record]));

  return agentNames.map((agentName) => {
    const record = byId.get(agentName) ?? byName.get(normalizeAgentKey(agentName));
    return record ? profileFromRecord(record) : profileFromFallback(agentName);
  });
}

export function chooseRuntimeModel(profiles: AgentRuntimeProfile[]) {
  return profiles.find((profile) => !isCoordinatorAgent(profile.name) && profile.model)?.model
    ?? profiles.find((profile) => profile.model)?.model;
}

export function buildAgentRuntimePrompt(profiles: AgentRuntimeProfile[]) {
  const configured = profiles.filter((profile) => profile.configured && profile.systemPrompt);
  if (configured.length === 0) return "";

  const sections = configured.map((profile) => {
    const tools = profile.tools.length > 0 ? profile.tools.join(", ") : "未声明工具";
    return [
      `### ${profile.name}`,
      `角色类型: ${profile.type}`,
      profile.model ? `模型偏好: ${profile.model}` : undefined,
      `允许工具/能力: ${tools}`,
      `系统提示词: ${profile.systemPrompt}`,
    ].filter(Boolean).join("\n");
  });

  return [
    "## 当前会话已选智能体配置",
    "执行任务时必须优先遵守下列已选智能体的职责、系统提示词和工具边界；不要冒充未加入当前会话的智能体。",
    ...sections,
  ].join("\n\n");
}
