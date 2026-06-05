import { userAgentConfigRepo } from "../db/repositories/user-agent-config";
import { normalizeAgentKey, isCoordinatorAgent } from "./conversation-routing";
import type { AdapterConfig } from "@agenthub/adapter";
import { decryptSecret } from "../deploy/credentials";

export interface AgentRuntimeProfile {
  id: string;
  name: string;
  type: string;
  provider?: string;
  baseURL?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  tools: string[];
  configured: boolean;
}

interface RuntimeModelOptions {
  fallbackModel?: string;
}

interface RawAgentConfig {
  provider?: unknown;
  baseURL?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  apiKeyEncrypted?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  tools?: unknown;
}

const PLACEHOLDER_MODELS = new Set(["gpt-4o-mini"]);

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

function readApiKey(config: RawAgentConfig) {
  if (typeof config.apiKey === "string" && config.apiKey.trim()) return config.apiKey.trim();
  if (typeof config.apiKeyEncrypted === "string" && config.apiKeyEncrypted.trim()) {
    try {
      return decryptSecret(config.apiKeyEncrypted);
    } catch {
      return undefined;
    }
  }
  return undefined;
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
    provider: typeof config.provider === "string" ? config.provider : undefined,
    baseURL: typeof config.baseURL === "string"
      ? config.baseURL.trim()
      : typeof config.baseUrl === "string"
      ? config.baseUrl.trim()
      : undefined,
    apiKey: readApiKey(config),
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

function isUsableRuntimeModel(model: string | undefined, options: RuntimeModelOptions) {
  const normalized = model?.trim();
  if (!normalized) return false;

  const fallbackModel = options.fallbackModel ?? process.env.LLM_MODEL;
  if (fallbackModel && fallbackModel !== normalized && PLACEHOLDER_MODELS.has(normalized)) {
    return false;
  }

  return true;
}

export function chooseRuntimeModel(profiles: AgentRuntimeProfile[], options: RuntimeModelOptions = {}) {
  return profiles.find((profile) => !isCoordinatorAgent(profile.name) && isUsableRuntimeModel(profile.model, options))?.model
    ?? profiles.find((profile) => isUsableRuntimeModel(profile.model, options))?.model;
}

export function isInheritedProvider(provider: string | undefined) {
  return !provider || provider === "inherit";
}

function adapterTypeFromProvider(provider: string | undefined): AdapterConfig["type"] | undefined {
  if (isInheritedProvider(provider)) return undefined;
  if (provider === "openai") return "openai";
  return "generic-openai";
}

function providerRequiresBaseURL(provider: string | undefined) {
  return !isInheritedProvider(provider) && provider !== "openai";
}

export function getPrivateLLMConfigIssue(profile: AgentRuntimeProfile): string | undefined {
  if (isInheritedProvider(profile.provider)) return undefined;
  if (!profile.apiKey) return "API Key missing";
  if (providerRequiresBaseURL(profile.provider) && !profile.baseURL) return "Base URL missing";
  if (!profile.model?.trim()) return "Model missing";
  return undefined;
}

function hasReadyPrivateLLMConfig(profile: AgentRuntimeProfile) {
  return !isInheritedProvider(profile.provider) && !getPrivateLLMConfigIssue(profile);
}

export function chooseRuntimeAdapterOverrides(profiles: AgentRuntimeProfile[]): Partial<AdapterConfig> | undefined {
  const preferred = profiles.find((profile) => !isCoordinatorAgent(profile.name) && hasReadyPrivateLLMConfig(profile))
    ?? profiles.find(hasReadyPrivateLLMConfig);

  if (preferred) {
    const override: Partial<AdapterConfig> = {};
    const type = adapterTypeFromProvider(preferred.provider);
    if (type) override.type = type;
    if (preferred.apiKey) override.apiKey = preferred.apiKey;
    if (preferred.baseURL) override.baseURL = preferred.baseURL;
    if (preferred.model?.trim()) override.model = preferred.model.trim();
    return override;
  }

  const runtimeModel = chooseRuntimeModel(profiles.filter((profile) => isInheritedProvider(profile.provider)));
  return runtimeModel ? { model: runtimeModel } : undefined;
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
