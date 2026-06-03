import { BaseAgent } from "./base";
import type { IAdapter } from "@agenthub/adapter";
import { runAgentLoop } from "./agent-loop";
import type { AgentLoopStep } from "./agent-loop";

interface MemoryStoreLike { getAll(): Record<string, unknown>; set(key: string, value: unknown, ttlMs?: number): void; summarize(): string; }

interface ToolRegistryLike {
  execute(name: string, ctx: { input: unknown; memory?: Record<string, unknown> }): Promise<{ success: boolean; data: unknown; error?: string }>;
  describe(): string;
  list(): string[];
}

const TOOL_LABELS: Record<string, string> = {
  glob: "检索相关文件",
  grep: "检索文本内容",
  read_file: "读取资料",
  write_file: "生成文件",
  edit_file: "更新文件",
  bash: "执行本地检查",
  code: "处理代码",
  search: "查找外部资料",
  "web-fetch": "读取网页资料",
  deploy: "准备部署",
};

function getToolLabel(tool?: string) {
  if (!tool) return "分析任务";
  return TOOL_LABELS[tool] ?? TOOL_LABELS[tool.toLowerCase()] ?? "处理任务";
}

function summarizeObservation(observation?: string) {
  if (!observation) return undefined;
  if (/未知工具|工具执行异常|错误|缺少/.test(observation)) {
    return "当前步骤未拿到有效结果，已自动切换处理策略。";
  }
  try {
    const parsed = JSON.parse(observation) as Record<string, unknown>;
    if (typeof parsed.count === "number") return `已获得 ${parsed.count} 条相关信息。`;
    if (Array.isArray(parsed.files)) return `已定位 ${parsed.files.length} 个候选文件。`;
    if (typeof parsed.path === "string") return `已处理 ${parsed.path}。`;
  } catch {
    // Keep a concise natural-language observation below.
  }
  return observation.length > 120 ? `${observation.slice(0, 120)}...` : observation;
}

function toPublicAgentStep(step: AgentLoopStep): AgentLoopStep {
  const actionLabel = getToolLabel(step.action?.tool);
  return {
    ...step,
    thought: step.isFinal ? "已整理最终结果。" : `正在${actionLabel}。`,
    action: step.action ? { tool: step.action.tool, input: "" } : undefined,
    observation: summarizeObservation(step.observation),
  };
}

function formatProgress(step: AgentLoopStep) {
  if (step.isFinal) return "";
  const actionLabel = getToolLabel(step.action?.tool);
  const observation = summarizeObservation(step.observation);
  return `\n[执行进度] 第 ${step.iteration} 步：${actionLabel}${observation ? `，${observation}` : "。"}`;
}

export class WorkerAgent extends BaseAgent {
  memory: MemoryStoreLike;
  private tools?: ToolRegistryLike;

  constructor(memory?: MemoryStoreLike, adapter?: IAdapter) {
    super("worker", adapter);
    this.memory = memory ?? { getAll: () => ({}), set: () => {}, summarize: () => "" };
  }

  setTools(tools: ToolRegistryLike): void { this.tools = tools; }

  async run(
    input: { task: string; contextPrompt?: string; agentRole?: string; signal?: AbortSignal },
    onStream?: (msg: string) => void,
    onAgentStep?: (step: AgentLoopStep) => void
  ) {
    const { task, contextPrompt, agentRole: _agentRole, signal } = input;

    if (this.adapter && this.tools) {
      const result = await runAgentLoop(
        this.adapter,
        task,
        this.tools,
        (step) => {
          const publicStep = toPublicAgentStep(step);
          onAgentStep?.(publicStep);
          const payload = JSON.stringify({
            iteration: publicStep.iteration,
            thought: publicStep.thought,
            action: publicStep.action,
            observation: publicStep.observation,
            isFinal: publicStep.isFinal,
          });
          onStream?.(`[AGENT_STEP]${payload}`);
          const progress = formatProgress(publicStep);
          if (progress) onStream?.(progress);
        },
        undefined,
        8,
        signal
      );

      onStream?.(result.finalAnswer);
      this.memory.set(`result:${task.slice(0, 50)}`, result.finalAnswer);
      return {
        task,
        result: result.finalAnswer,
        toolUsed: "agent-loop",
        toolResult: { iterations: result.iterations, toolCalls: result.toolCalls },
      };
    }

    if (this.adapter) {
      const enrichedTask = contextPrompt
        ? `## 会话上下文\n${contextPrompt}\n\n## 任务\n${task}`
        : task;
      let result = "";
      if (onStream) {
        for await (const chunk of this.adapter.streamResponse(enrichedTask, { temperature: 0.4, signal })) {
          result += chunk;
          onStream(chunk);
        }
      } else {
        result = await this.adapter.sendMessage(enrichedTask, { temperature: 0.4, signal });
      }
      this.memory.set(`result:${task.slice(0, 50)}`, result);
      return { task, result: result.trim(), toolUsed: "llm-only", toolResult: null };
    }

    const mockResult = `[mock] 执行完成: ${task}`;
    this.memory.set(`result:${task.slice(0, 50)}`, mockResult);
    return { task, result: mockResult, toolUsed: null, toolResult: null };
  }
}
