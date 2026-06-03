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
<工具名>: {"参数名":"参数值"}
-- 或者 --
【完成】
<最终答案>

## 重要规则
- 每次只调用一个工具
- 行动后必须等待观察结果才能继续
- 如果连续 2 次工具调用失败，应该调整策略或直接给出最佳答案
- 工具参数必须尽量使用 JSON 对象，例如 glob: {"pattern":"**/*.md","workdir":"."}
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

    const whitespaceMatch = actionText.match(/^([a-zA-Z_][\w-]*)\s+([\s\S]+)$/);
    if (whitespaceMatch) {
      return { thought, action: { tool: whitespaceMatch[1].trim(), input: whitespaceMatch[2].trim() }, isFinal: false };
    }

    return { thought, action: { tool: "unknown", input: actionText }, isFinal: false };
  }

  return { thought, isFinal: true, finalAnswer: thought };
}

function normalizeToolName(tool: string): string {
  let toolName = tool.toLowerCase().replace(/\s+/g, "_");

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
  return toolName;
}

function stripFences(input: string): string {
  const trimmed = input.trim();
  const fence = trimmed.match(/^```(?:json|ts|js|txt)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function tryParseObject(input: string): Record<string, unknown> | undefined {
  const cleaned = stripFences(input);
  const candidates = [cleaned];
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Continue with looser formats below.
    }
  }

  return undefined;
}

function stripValue(value: string): string {
  return value
    .trim()
    .replace(/^[,，\s]+|[,，\s]+$/g, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

function parseLooseKeyValues(input: string): Record<string, string> {
  const cleaned = stripFences(input).replace(/\r/g, "").trim();
  const result: Record<string, string> = {};
  const matches = [...cleaned.matchAll(/([a-zA-Z_][\w-]*)\s*[:=]/g)];

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? cleaned.length : cleaned.length;
    const value = stripValue(cleaned.slice(start, end));
    if (value) result[key] = value;
  }

  return result;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeToolInput(toolName: string, input: string): unknown {
  const parsed = tryParseObject(input);
  const kv = parsed ?? parseLooseKeyValues(input);
  const raw = stripFences(input);

  switch (toolName) {
    case "glob":
      return {
        pattern: asString(kv.pattern ?? kv.input ?? kv.path, raw || "**/*"),
        workdir: asString(kv.workdir ?? kv.cwd, "."),
      };
    case "grep":
      return {
        pattern: asString(kv.pattern ?? kv.input ?? kv.query, raw),
        path: asString(kv.path ?? kv.dir, "."),
        include: asString(kv.include ?? kv.glob, ""),
        workdir: asString(kv.workdir ?? kv.cwd, "."),
      };
    case "bash":
      return {
        command: asString(kv.command ?? kv.cmd ?? kv.input, raw),
        workdir: asString(kv.workdir ?? kv.cwd, "."),
        timeout: asNumber(kv.timeout),
      };
    case "read_file":
      return {
        path: asString(kv.path ?? kv.file ?? kv.input, raw),
        offset: asNumber(kv.offset),
        limit: asNumber(kv.limit),
      };
    case "write_file":
      return {
        path: asString(kv.path ?? kv.file, ""),
        content: asString(kv.content ?? kv.text, ""),
      };
    case "edit_file":
      return {
        path: asString(kv.path ?? kv.file, ""),
        old_str: asString(kv.old_str ?? kv.old ?? kv.from, ""),
        new_str: asString(kv.new_str ?? kv.new ?? kv.to, ""),
      };
    case "code":
      return {
        input: asString(kv.input ?? kv.code, raw),
        language: asString(kv.language ?? kv.lang, "javascript"),
      };
    case "deploy":
      return {
        input: asString(kv.input ?? kv.path ?? kv.project, raw),
        target: asString(kv.target ?? kv.provider, "vercel"),
      };
    case "search":
      return asString(kv.input ?? kv.query ?? kv.keyword, raw);
    case "web-fetch":
      return asString(kv.input ?? kv.url, raw);
    default:
      return parsed ?? raw;
  }
}

function stringifyToolInput(input: unknown): string {
  if (typeof input === "string") return input;
  try { return JSON.stringify(input); } catch { return String(input); }
}

async function buildFallbackAnswer(
  adapter: IAdapter,
  task: string,
  steps: AgentLoopStep[],
  signal?: AbortSignal
): Promise<string> {
  const recent = steps
    .slice(-4)
    .map((step) => {
      const action = step.action ? `${step.action.tool}` : "分析";
      const observation = step.observation ? step.observation.slice(0, 500) : "无结果";
      return `第${step.iteration}轮：${action} -> ${observation}`;
    })
    .join("\n");

  try {
    const answer = await adapter.sendMessage(
      `当前任务的工具流程未能稳定完成，请直接基于已有上下文给出可交付结果。\n\n任务：${task}\n\n已有执行线索：\n${recent}\n\n要求：不要提及内部工具失败，不要输出“思考/行动/观察”标签，直接给用户一个结构化、可继续使用的结果。`,
      { temperature: 0.35, maxTokens: 4000, signal }
    );
    return answer.trim() || "已根据当前上下文整理完成，但没有生成更多可展示内容。";
  } catch {
    return "已根据当前上下文完成处理，但部分内部步骤未能继续推进。你可以继续补充要求，我会从当前结果接着完善。";
  }
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

      const toolName = normalizeToolName(tool);
      const toolInput = normalizeToolInput(toolName, input);
      step.action = { tool: toolName, input: stringifyToolInput(toolInput).slice(0, 1000) };

      if (!tools.list().includes(toolName)) {
        step.observation = `未知工具: ${tool}。可用工具: ${tools.list().join(", ")}`;
        consecutiveFailures++;
        steps.push(step);
        onStep?.(step);
        if (consecutiveFailures >= 3) {
          logger.warn(`Agent Loop: 连续 ${consecutiveFailures} 次工具调用失败，提前结束`, "AgentLoop");
          const finalAnswer = await buildFallbackAnswer(adapter, task, steps, signal);
          return { steps, finalAnswer, iterations: i + 1, toolCalls };
        }
        continue;
      }

      try {
        const result = await tools.execute(toolName, { input: toolInput });
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
        const finalAnswer = await buildFallbackAnswer(adapter, task, steps, signal);
        return { steps, finalAnswer, iterations: i + 1, toolCalls };
      }
    } else {
      step.observation = "未能解析出有效的行动，请尝试其他方法";
    }

    steps.push(step);
    onStep?.(step);
  }

  logger.warn(`Agent Loop 达到最大迭代次数 ${maxIterations}`, "AgentLoop");
  const finalAnswer = await buildFallbackAnswer(adapter, task, steps, signal);
  return { steps, finalAnswer, iterations: maxIterations, toolCalls };
}
