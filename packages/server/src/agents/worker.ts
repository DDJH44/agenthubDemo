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
          onAgentStep?.(step);
          const payload = JSON.stringify({
            iteration: step.iteration,
            thought: step.thought,
            action: step.action,
            observation: step.observation,
            isFinal: step.isFinal,
          });
          onStream?.(`[AGENT_STEP]${payload}`);
        },
        (chunk) => { onStream?.(chunk); },
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
