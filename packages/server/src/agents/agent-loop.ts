import type { IAdapter } from "@agenthub/adapter";
import { logger } from "../utils/logger";

interface ToolRegistryLike {
  execute(name: string, ctx: { input: unknown; memory?: Record<string, unknown> }): Promise<{ success: boolean; data: unknown; error?: string }>;
  describe(): string;
  list(): string[];
}

export interface AgentLoopStep {
  iteration: number;
  thought: string;
  action?: { tool: string; input: string };
  observation?: string;
  isFinal: boolean;
}

export interface AgentLoopResult {
  steps: AgentLoopStep[];
  finalAnswer: string;
  iterations: number;
  toolCalls: number;
}

const SYSTEM_PROMPT = `你是一个能自主使用工具的 AI Agent。遵循以下思考-行动-观察循环：

## 工作流程
1. **思考 (Thought)**: 分析当前状态，决定下一步做什么
2. **行动 (Action)**: 如果需要使用工具，选择工具并提供参数
3. **观察 (Observation)**: 查看工具返回结果
4. **重复**: 如果任务没完成，回到步骤 1
5. **回答**: 任务完成时，给出最终答案

## 输出格式
严格按以下格式输出每一轮：

【思考】
<你的推理过程>
【行动】
<工具名>: <参数>
-- 或者 --
【完成】
<最终答案>

## 重要规则
- 每次只调用一个工具
- 行动后必须等待观察结果才能继续
- 如果连续 2 次工具调用失败，应该调整策略或直接给出最佳答案
- 读文件前先用 glob 找到文件路径
- 改代码前先 read_file 读取当前内容
- 不确定时先探索再行动
- 用中文思考和回答`;

function buildContext(task: string, tools: ToolRegistryLike, history: AgentLoopStep[]): string {
  const toolsSection = tools.describe();

  let prompt = SYSTEM_PROMPT;

  prompt += `\n\n## 当前任务\n${task}`;

  prompt += `\n\n## 可用工具\n${toolsSection}`;

  if (history.length > 0) {
    prompt += `\n\n## 历史步骤\n`;
    for (const step of history) {
      prompt += `\n### 第 ${step.iteration} 轮\n`;
      prompt += `思考: ${step.thought}\n`;
      if (step.action) {
        prompt += `行动: ${step.action.tool}(${step.action.input})\n`;
        prompt += `观察: ${step.observation ?? "无"}\n`;
      }
    }
  }

  prompt += `\n\n请开始新一轮思考。先说你的【思考】，然后给出【行动】或【完成】。`;
  return prompt;
}

function parseResponse(text: string): { thought: string; action?: { tool: string; input: string }; isFinal: boolean; finalAnswer?: string } {
  const thoughtMatch = text.match(/【思考】\s*([\s\S]*?)(?=【行动】|【完成】|$)/);
  const actionMatch = text.match(/【行动】\s*([\s\S]*?)(?=【思考】|【完成】|【观察】|$)/);
  const doneMatch = text.match(/【完成】\s*([\s\S]*)/);

  const thought = thoughtMatch ? thoughtMatch[1].trim() : text.slice(0, 200).trim();

  if (doneMatch && !actionMatch) {
    return { thought, isFinal: true, finalAnswer: doneMatch[1].trim() };
  }

  if (actionMatch) {
    const actionText = actionMatch[1].trim();
    const colonIdx = actionText.indexOf(":");
    const parenIdx = actionText.indexOf("(");
    const separatorIdx = colonIdx !== -1 ? colonIdx : parenIdx;

    if (separatorIdx !== -1) {
      let tool = actionText.slice(0, separatorIdx).trim();
      let input = colonIdx !== -1
        ? actionText.slice(separatorIdx + 1).trim()
        : parenIdx !== -1
          ? actionText.slice(parenIdx + 1, -1).trim()
          : "";

      // Clean tool name (handle "glob:**/*.ts" format)
      if (tool.includes(":") && !tool.includes(" ")) {
        const parts = tool.split(":");
        tool = parts[0];
        input = parts.slice(1).join(":") + (input ? ": " + input : "");
      }

      return { thought, action: { tool, input }, isFinal: false };
    }

    return { thought, action: { tool: "unknown", input: actionText }, isFinal: false };
  }

  return { thought, isFinal: true, finalAnswer: thought };
}

export async function runAgentLoop(
  adapter: IAdapter,
  task: string,
  tools: ToolRegistryLike,
  onStep?: (step: AgentLoopStep) => void,
  onStreamChunk?: (chunk: string) => void,
  maxIterations = 8,
  signal?: AbortSignal
): Promise<AgentLoopResult> {
  const steps: AgentLoopStep[] = [];
  let toolCalls = 0;
  let consecutiveFailures = 0;

  logger.info(`Agent Loop 开始: "${task.slice(0, 100)}"`, "AgentLoop");

  for (let i = 0; i < maxIterations; i++) {
    const prompt = buildContext(task, tools, steps);

    // 流式输出每个 token 到前端，同时收集完整文本用于解析
    let raw = "";
    for await (const chunk of adapter.streamResponse(prompt, { temperature: 0.2, maxTokens: 16000, signal })) {
      raw += chunk;
      onStreamChunk?.(chunk);
    }

    const parsed = parseResponse(raw);

    const step: AgentLoopStep = {
      iteration: i + 1,
      thought: parsed.thought,
      isFinal: parsed.isFinal,
    };

    if (parsed.isFinal) {
      step.isFinal = true;
      steps.push(step);
      onStep?.(step);

      logger.info(`Agent Loop 完成: ${i + 1} 轮, ${toolCalls} 次工具调用`, "AgentLoop");
      return { steps, finalAnswer: parsed.finalAnswer || parsed.thought, iterations: i + 1, toolCalls };
    }

    if (parsed.action) {
      const { tool, input } = parsed.action;
      step.action = { tool, input };

      let toolName = tool.toLowerCase().replace(/\s+/g, "_");

      // Map common LLM tool names to actual tool names
      const nameMap: Record<string, string> = {
        "read": "read_file", "readfile": "read_file", "read_file": "read_file",
        "write": "write_file", "writefile": "write_file", "write_file": "write_file",
        "edit": "edit_file", "editfile": "edit_file", "edit_file": "edit_file",
        "shell": "bash", "bash": "bash", "exec": "bash", "run": "bash",
        "glob": "glob", "find": "glob", "ls": "glob",
        "grep": "grep", "searchcontent": "grep", "search_content": "grep",
        "search": "search", "web_search": "search",
        "code": "code", "sandbox": "code",
        "webfetch": "web-fetch", "web_fetch": "web-fetch", "web-fetch": "web-fetch",
        "fetch": "web-fetch", "urlfetch": "web-fetch",
        "deploy": "deploy",
      };

      toolName = nameMap[toolName] || toolName;

      if (!tools.list().includes(toolName)) {
        step.observation = `未知工具: ${tool}。可用工具: ${tools.list().join(", ")}`;
        consecutiveFailures++;
        steps.push(step);
        onStep?.(step);
        if (consecutiveFailures >= 3) {
          logger.warn(`Agent Loop: 连续 ${consecutiveFailures} 次工具调用失败，提前结束`, "AgentLoop");
          const finalAnswer = `工具调用连续失败 ${consecutiveFailures} 次，任务中止。已完成的步骤: ${steps.filter(s => s.observation && !s.observation.includes("错误") && !s.observation.includes("未知")).map(s => s.thought).join("; ") || "无"}`;
          return { steps, finalAnswer, iterations: i + 1, toolCalls };
        }
        continue;
      }

      try {
        const result = await tools.execute(toolName, { input });
        toolCalls++;
        if (result.success) {
          consecutiveFailures = 0;
          step.observation = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2).slice(0, 4000);
        } else {
          consecutiveFailures++;
          step.observation = `错误: ${result.error}`;
        }
      } catch (err) {
        consecutiveFailures++;
        step.observation = `工具执行异常: ${err instanceof Error ? err.message : "未知错误"}`;
      }

      if (consecutiveFailures >= 3) {
        steps.push(step);
        onStep?.(step);
        logger.warn(`Agent Loop: 连续 ${consecutiveFailures} 次工具调用失败，提前结束`, "AgentLoop");
        const finalAnswer = `工具调用连续失败 ${consecutiveFailures} 次，任务中止。已完成的步骤: ${steps.filter(s => s.observation && !s.observation.includes("错误") && !s.observation.includes("未知")).map(s => s.thought).join("; ") || "无"}`;
        return { steps, finalAnswer, iterations: i + 1, toolCalls };
      }
    } else {
      step.observation = "未能解析出有效的行动，请尝试其他方法";
    }

    steps.push(step);
    onStep?.(step);
  }

  logger.warn(`Agent Loop 达到最大迭代次数 ${maxIterations}`, "AgentLoop");
  const finalAnswer = `已执行 ${maxIterations} 轮，未能完全完成任务。最后一步: ${steps[steps.length - 1]?.thought || "无"}`;
  return { steps, finalAnswer, iterations: maxIterations, toolCalls };
}
