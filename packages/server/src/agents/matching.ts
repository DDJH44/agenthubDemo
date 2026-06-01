import type { IAdapter } from "@agenthub/adapter";
import { logger } from "../utils/logger";

/**
 * Agent capability tags — each agent declares what it can do.
 * The matching engine uses these to find the best agent for a task.
 */
export interface AgentCapability {
  agentId: string;
  label: string;
  capabilities: string[];       // e.g. ["plan", "decompose", "architecture"]
  recommendedModel: string;
  priority: number;             // lower = more specialized, preferred for matching
}

const CAPABILITY_REGISTRY: AgentCapability[] = [
  {
    agentId: "planner", label: "规划者",
    capabilities: ["plan", "decompose", "architecture", "design", "breakdown", "orchestrate"],
    recommendedModel: "gpt-4o-mini", priority: 1,
  },
  {
    agentId: "worker", label: "执行者",
    capabilities: ["code", "generate", "implement", "build", "develop", "execute", "script", "function"],
    recommendedModel: "gpt-4o-mini", priority: 2,
  },
  {
    agentId: "critic", label: "审查者",
    capabilities: ["review", "audit", "check", "validate", "test", "quality", "inspect"],
    recommendedModel: "gpt-4o-mini", priority: 3,
  },
  {
    agentId: "researcher", label: "研究员",
    capabilities: ["search", "research", "analyze", "investigate", "find", "lookup", "gather", "collect", "trend"],
    recommendedModel: "gpt-4o-mini", priority: 2,
  },
  {
    agentId: "refiner", label: "润色师",
    capabilities: ["polish", "refine", "improve", "rewrite", "format", "style", "summarize", "conclude"],
    recommendedModel: "gpt-4o-mini", priority: 4,
  },
];

/**
 * Quick keyword-based matching (no LLM call).
 * Returns agents whose capabilities overlap with the task description.
 */
export function matchByKeywords(task: string): AgentCapability[] {
  const taskLower = task.toLowerCase();
  const scored = CAPABILITY_REGISTRY.map((agent) => {
    const hits = agent.capabilities.filter((cap) => new RegExp(`(?:^|[\\s._-])${cap}(?:$|[\\s._-])`, "i").test(taskLower));
    return { agent, score: hits.length };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.agent.priority - b.agent.priority)
    .map((s) => s.agent);
}

/**
 * LLM-based matching for complex tasks.
 * Asks the LLM to pick the best agent combination.
 */
export async function matchByLLM(task: string, adapter: IAdapter): Promise<AgentCapability[]> {
  const registryDesc = CAPABILITY_REGISTRY
    .map((a) => `- ${a.agentId} (${a.label}): ${a.capabilities.join(", ")}`)
    .join("\n");

  const prompt = `你是一个任务路由系统。根据任务描述选择最合适的 Agent 组合。

可用 Agent:
${registryDesc}

任务: ${task}

请返回 JSON: { "agents": ["agentId1", "agentId2", ...] }
选择规则:
- "规划者" 用于需要拆解、设计的任务
- "执行者" 用于需要编码、实现的任务
- "审查者" 用于需要检查、验证的任务
- "研究员" 用于需要搜索、分析的任务
- "润色师" 用于需要优化、总结的任务
- 按执行顺序排列，最多选 4 个`;

  try {
    const raw = await adapter.sendMessage(prompt, { temperature: 0.1, maxTokens: 200 });
    const parsed = JSON.parse(raw);
    const agentIds: string[] = parsed.agents ?? [];
    return agentIds
      .map((id) => CAPABILITY_REGISTRY.find((a) => a.agentId === id))
      .filter(Boolean) as AgentCapability[];
  } catch (err) {
    logger.warn(`LLM matching failed, falling back to default: ${err}`, 'AgentMatching');
    return CAPABILITY_REGISTRY.filter(a => a.agentId === "planner" || a.agentId === "worker");
  }
}

/**
 * Selects the best matching strategy:
 * 1. If the task has obvious keywords, use keyword matching
 * 2. Otherwise, use LLM-based matching
 */
export async function autoMatch(task: string, adapter?: IAdapter): Promise<AgentCapability[]> {
  const keywordMatch = matchByKeywords(task);
  if (keywordMatch.length >= 2) return keywordMatch;

  if (adapter) {
    try {
      return await matchByLLM(task, adapter);
    } catch (err) {
      logger.warn(`Auto match failed: ${err}`, 'AgentMatching');
      return keywordMatch.length > 0 ? keywordMatch : CAPABILITY_REGISTRY;
    }
  }

  return keywordMatch.length > 0 ? keywordMatch : CAPABILITY_REGISTRY;
}

/**
 * Returns all registered capabilities for display/debugging.
 */
export function listCapabilities(): AgentCapability[] {
  return CAPABILITY_REGISTRY;
}
