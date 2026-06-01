import type { IAdapter } from "@agenthub/adapter";
import type { PlanNode } from "@agenthub/shared";
import { PlannerAgent } from "../agents/planner";
import { WorkerAgent } from "../agents/worker";
import { CriticAgent } from "../agents/critic";
import { ResearcherAgent } from "../agents/researcher";
import { RefinerAgent } from "../agents/refiner";
import { MemoryManager } from "../memory/manager";
import { registerAllTools, toolRegistry } from "../tools";
import { messageRepo } from "../db/repositories/message";
import { logger } from "../utils/logger";
import {
  formatTaskConfirmation,
  formatTaskDecomposition,
  formatTaskAssignment,
  formatWorkerReceipt,
  formatWorkerReport,
  formatCriticReview,
  formatFinalSummary,
  extractOutputInfo,
} from "../utils/format-helpers";

export type StreamEventType = "system" | "plan" | "stream" | "critic" | "research" | "refine" | "retry" | "final" | "variable";
export type StreamEvent = { type: StreamEventType; msg: unknown };

export interface OrchestratorConfig {
  maxRetries: number; criticThreshold: number; enableResearcher: boolean; enableRefiner: boolean; concurrency: number;
}

export class Orchestrator {
  private adapter?: IAdapter;
  private config: OrchestratorConfig;
  private memory: MemoryManager;
  private contextStore: Record<string, unknown> = {};
  private memoryPrompt = "";

  constructor(config?: Partial<OrchestratorConfig>, adapter?: IAdapter) {
    this.adapter = adapter;
    this.config = { maxRetries: 1, criticThreshold: 6, enableResearcher: true, enableRefiner: true, concurrency: 5, ...config };
    this.memory = new MemoryManager(adapter);
    registerAllTools();
  }

  private async isSimpleConversation(task: string): Promise<boolean> {
    const trimmed = task.trim();
    if (trimmed.length > 80) return false;
    const simplePatterns = /^(你好|hi|hello|hey|嗨|哈喽|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|感谢|ok|好的|嗯|是|否|对|不|再见|拜拜|what|how are you|who are you|你是谁|你叫什么|介绍|介绍一下你自己)\s*[!！?？。.~～]*$/i;
    if (simplePatterns.test(trimmed)) return true;
    const wordCount = trimmed.split(/\s+/).length;
    const charCount = trimmed.length;
    if (charCount <= 15 && wordCount <= 5 && !/[，。；：！？、]/.test(trimmed)) return true;
    return false;
  }

  private isCodeGenerationTask(task: string): boolean {
    const lower = task.toLowerCase();
    const codeKeywords = [
      "写", "实现", "生成", "创建", "开发", "编写", "制作", "做一个", "帮我做", "帮我写",
      "代码", "函数", "组件", "页面", "界面", "应用", "app", "网站", "demo", "项目",
      "react", "vue", "html", "css", "javascript", "typescript", "python", "node",
      "todo", "login", "counter", "calculator", "form", "dashboard", "chat",
      "登录", "注册", "表单", "列表", "导航", "布局",
      "简单", "simple", "basic", "small", "一个",
    ];
    const hits = codeKeywords.filter((kw) => lower.includes(kw)).length;
    const complexIndicators = [
      "架构设计", "系统设计", "微服务", "分布式", "多模块", "完整项目",
      "详细方案", "调研", "分析", "对比", "评估", "多步骤",
    ];
    const hasComplex = complexIndicators.some((kw) => lower.includes(kw));
    return hits >= 2 && !hasComplex;
  }

  private async handleSimpleConversation(
    task: string,
    onStream: (e: StreamEvent) => void,
    signal?: AbortSignal
  ) {
    const systemPrompt = `你是 AgentHub 的智能助手。请简洁友好地回复用户。如果用户只是打招呼，简短回应即可。如果用户问了简单问题，直接回答。不要重复用户的话，不要列出智能体团队信息。`;
    const enrichedTask = this.memoryPrompt
      ? `## 会话上下文\n${this.memoryPrompt}\n\n用户: ${task}`
      : task;
    const reply = await this.adapter!.sendMessage(enrichedTask, { systemPrompt, temperature: 0.7, signal });
    const planSteps: PlanNode[] = [{ id: "1", task, dependsOn: [], agentRole: "worker" }];
    const stepResults = [{ id: "1", task, result: reply }];
    onStream({ type: "plan", msg: { steps: planSteps } });
    onStream({ type: "stream", msg: reply });
    onStream({ type: "final", msg: { task, plan: planSteps.map(s => ({ id: s.id, task: s.task })), stepResults, summary: reply } });
    return { task, plan: planSteps.map(s => ({ id: s.id, task: s.task })), stepResults, summary: reply };
  }

  setAdapter(adapter: IAdapter): void { this.adapter = adapter; }

  private async handleCodeGeneration(
    task: string,
    onStream: (e: StreamEvent) => void,
    signal?: AbortSignal
  ) {
    const confirmation = formatTaskConfirmation(task);
    onStream({ type: "system", msg: confirmation });

    const systemPrompt = `你是一个高级前端工程师。根据用户需求直接输出完整可运行的代码。
规则：
1. 直接输出代码，用 \`\`\`语言 标记代码块
2. 优先输出单个完整文件（HTML 内联 CSS/JS，或单个 React 组件）
3. 代码必须可直接运行，不要省略任何部分
4. 不要输出多余解释，代码就是答案
5. 如果用户指定了框架（如 React），使用该框架的写法`;

    const enrichedTask = this.memoryPrompt
      ? `## 会话上下文\n${this.memoryPrompt}\n\n用户需求: ${task}`
      : task;

    const planSteps: PlanNode[] = [{ id: "1", task, dependsOn: [], agentRole: "worker" }];
    onStream({ type: "plan", msg: { steps: planSteps } });

    onStream({ type: "stream", msg: formatWorkerReceipt(task, "worker") });

    const reply = await this.adapter!.sendMessage(enrichedTask, { systemPrompt, temperature: 0.3, maxTokens: 8192, signal });

    const outputs = extractOutputInfo(reply);
    const report = formatWorkerReport(task, "worker", "直接生成完整可运行代码", outputs);
    onStream({ type: "stream", msg: `\n\n${reply}` });

    const stepResults = [{ id: "1", task, result: reply, toolUsed: "code" as const }];
    const summary = `${report}\n\n${formatFinalSummary(task, stepResults, outputs)}`;
    const final = { task, plan: planSteps.map(s => ({ id: s.id, task: s.task })), stepResults, summary };
    onStream({ type: "final", msg: final });
    return final;
  }

  async run(
    task: string,
    onStream: (e: StreamEvent) => void,
    predefinedPlan?: PlanNode[],
    edges?: Array<{ source: string; target: string; label?: string }>,
    conversationId?: string,
    signal?: AbortSignal
  ) {
    if (signal?.aborted) return { task, plan: [], stepResults: [], summary: "" };
    if (conversationId) {
      this.memory.setConversation(conversationId);
    } else {
      this.memory.clear();
    }
    this.contextStore = {};
    this.memory.set("task", task);

    this.memoryPrompt = "";
    if (conversationId) {
      this.memoryPrompt = await this.memory.buildContextPrompt(task);
      try {
        const recentMsgs = await messageRepo.listByConversation(conversationId, { take: 30 });
        const conversationHistory = recentMsgs
          .filter(m => m.content !== "[AGENT_START]" && m.content !== "[AGENT_END]")
          .map(m => `[${m.sender}]: ${m.content.slice(0, 200)}`)
          .join("\n");
        if (conversationHistory) {
          this.memoryPrompt = `## 近期对话记录\n${conversationHistory}\n\n${this.memoryPrompt}`;
        }
      } catch (err) {
        logger.warn(`Failed to load conversation messages: ${err}`, 'Orchestrator');
      }
    }

    onStream({ type: "system", msg: formatTaskConfirmation(task) });

    if (this.adapter && !predefinedPlan) {
      const isSimple = await this.isSimpleConversation(task);
      if (isSimple) {
        return await this.handleSimpleConversation(task, onStream, signal);
      }
      const isCodeGen = this.isCodeGenerationTask(task);
      if (isCodeGen) {
        return await this.handleCodeGeneration(task, onStream, signal);
      }
    }

    const errors: string[] = [];

    if (!predefinedPlan && this.config.enableResearcher) {
      try {
        onStream({ type: "stream", msg: formatWorkerReceipt("需求调研与信息收集", "researcher") });
        const r = new ResearcherAgent(this.adapter);
        const researchResult = await r.run(
          { topic: task, contextPrompt: this.memoryPrompt },
          (chunk) => onStream({ type: "research", msg: chunk })
        );
        this.memory.set("research", researchResult);
      } catch (err) { errors.push(`调研失败: ${err}`); }
    }

    let planSteps: PlanNode[];
    if (predefinedPlan) {
      planSteps = predefinedPlan;
      onStream({ type: "plan", msg: { steps: planSteps } });
      this.memory.set("plan", { steps: planSteps });
    } else {
      try {
        const planner = new PlannerAgent(this.adapter);
        const plan = (await planner.run(
          { task, contextPrompt: this.memoryPrompt },
          (chunk) => onStream({ type: "stream", msg: chunk })
        )) as { steps: PlanNode[] };
        planSteps = plan.steps;
        onStream({ type: "plan", msg: { steps: planSteps } });
        this.memory.set("plan", { steps: planSteps });
      } catch (err) {
        errors.push(`规划失败: ${err}`);
        planSteps = [{ id: "1", task, dependsOn: [], agentRole: "worker" }];
        onStream({ type: "plan", msg: { steps: planSteps } });
      }
    }

    onStream({ type: "stream", msg: `\n${formatTaskDecomposition(planSteps)}\n\n${formatTaskAssignment(planSteps)}` });

    let stepResults: Array<{ id: string; task: string; result: string; toolUsed?: string | null }> = [];
    try {
      stepResults = await this.executeDAGWithCritic(planSteps, task, edges || [], onStream, signal);
    } catch (err) {
      errors.push(`执行异常: ${err}`);
      stepResults = planSteps.map((s) => ({ id: s.id, task: s.task, result: `执行失败: ${err}` }));
    }
    this.memory.set("stepResults", stepResults);

    let refinedOutput = "";
    if (this.config.enableRefiner) {
      try {
        onStream({ type: "stream", msg: formatWorkerReceipt("内容润色与成果整合", "refiner") });
        const refiner = new RefinerAgent(this.adapter);
        refinedOutput = await refiner.run({ content: stepResults.map((r) => r.result).join("\n\n"), contextPrompt: this.memoryPrompt });
      } catch (err) {
        logger.warn(`Failed to refine output: ${err}`, 'Orchestrator');
        refinedOutput = stepResults.map((r) => `${r.task}\n${r.result}`).join("\n\n");
      }
    }

    const contentForSummary = refinedOutput || stepResults.map((r) => `- ${r.task}: ${r.result.slice(0, 200)}`).join("\n");
    let summary: string;
    try {
      if (this.adapter) {
        const summaryPrompt = this.memoryPrompt
          ? `## 会话历史上下文\n${this.memoryPrompt}\n\n请按以下格式汇总任务执行结果：\n\n## 任务完成总览\n**原始需求**：${task}\n\n### 完成状态\n对每个步骤列出完成情况（✅ 已完成 / ❌ 失败）\n\n### 成果整合\n说明各模块如何集成\n\n### 交付内容\n列出所有交付物\n\n步骤结果:\n${contentForSummary}`
          : `请按以下格式汇总任务执行结果：\n\n## 任务完成总览\n**原始需求**：${task}\n\n### 完成状态\n对每个步骤列出完成情况\n\n### 成果整合\n说明各模块如何集成\n\n### 交付内容\n列出所有交付物\n\n步骤结果:\n${contentForSummary}`;
        summary = await this.adapter.sendMessage(summaryPrompt, { temperature: 0.3, signal });
      } else {
        summary = contentForSummary;
      }
    } catch (err) {
      logger.warn(`Failed to generate summary: ${err}`, 'Orchestrator');
      summary = contentForSummary;
    }

    const allOutputs = stepResults.flatMap(sr => extractOutputInfo(sr.result));
    if (!summary.includes("任务完成总览")) {
      summary = formatFinalSummary(task, stepResults, allOutputs) + "\n\n" + summary;
    }

    this.memory.set("lastTask", task, 30 * 60 * 1000);
    this.memory.set("lastSummary", summary, 30 * 60 * 1000);

    const final = { task, plan: planSteps.map((s) => ({ id: s.id, task: s.task })), stepResults, summary, errors: errors.length > 0 ? errors : undefined };
    onStream({ type: "final", msg: final });
    return final;
  }

  private async executeDAGWithCritic(
    steps: PlanNode[],
    task: string,
    edges: Array<{ source: string; target: string; label?: string }>,
    onStream: (e: StreamEvent) => void,
    signal?: AbortSignal
  ) {
    const results = new Map<string, string>();
    const completed = new Set<string>();
    const remaining = new Map(steps.map((s) => [s.id, s]));

    while (remaining.size > 0) {
      const wave: PlanNode[] = [];
      for (const [, step] of remaining) {
        const blockedByCondition = step.dependsOn.some((depId) => {
          const condEdges = edges.filter((e) => e.source === depId && e.label);
          if (condEdges.length === 0) return false;
          const sourceResult = results.get(depId);
          if (sourceResult === undefined) return false;
          return !condEdges.some((e) => sourceResult === e.label);
        });
        if (blockedByCondition) continue;

        if (step.dependsOn.every((depId) => completed.has(depId))) {
          wave.push(step);
        }
      }
      if (wave.length === 0 && remaining.size > 0) throw new Error("DAG 死锁：无法继续推进");

      const waveResults = await Promise.all(wave.map(async (step) => {
        try {
          return await this.executeStep(step, results, onStream, signal);
        } catch (err) { return { result: `步骤执行异常: ${err}` }; }
      }));

      for (let i = 0; i < wave.length; i++) {
        results.set(wave[i].id, waveResults[i].result);
        completed.add(wave[i].id);
        remaining.delete(wave[i].id);
      }
    }

    return steps.map((s) => ({ id: s.id, task: s.task, result: results.get(s.id) ?? "" }));
  }

  private async executeStep(
    step: PlanNode,
    results: Map<string, string>,
    onStream: (e: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<{ result: string }> {
    const nodeType = step.type ?? "agent";
    const agentRole = step.agentRole ?? "worker";

    switch (nodeType) {
      case "code": {
        onStream({ type: "stream", msg: formatWorkerReceipt(step.task, agentRole) });
        const config = (step.config ?? {}) as { language?: string; timeout?: number };
        const language = config.language ?? "javascript";
        const resolvedTask = this.resolveVariables(step.task);
        const execResult = await toolRegistry.execute("code", {
          input: { input: resolvedTask, language },
          memory: this.memory.getAll(),
        });
        const output = execResult.success
          ? `代码执行结果:\n${typeof execResult.data === "string" ? execResult.data : JSON.stringify(execResult.data, null, 2)}`
          : `代码执行失败: ${execResult.error}`;
        const outputs = extractOutputInfo(output);
        onStream({ type: "stream", msg: `\n${formatWorkerReport(step.task, agentRole, `在 ${language} 沙箱中执行代码`, outputs)}` });
        return { result: output };
      }

      case "variable": {
        const vconfig = (step.config ?? {}) as { operation?: string; variableName?: string; value?: string };
        const vName = vconfig.variableName ?? "result";
        const value = this.resolveVariables(vconfig.value ?? step.task);

        if (vconfig.operation === "transform") {
          const transformed = value;
          this.contextStore[vName] = transformed;
          onStream({ type: "variable", msg: { name: vName, value: transformed, operation: "transform" } });
          return { result: `变量 ${vName} 已转换为 ${String(transformed)}` };
        } else if (vconfig.operation === "get") {
          const val = this.contextStore[vName];
          onStream({ type: "variable", msg: { name: vName, value: val, operation: "get" } });
          return { result: val !== undefined ? String(val) : `变量 ${vName} 未定义` };
        } else {
          this.contextStore[vName] = value;
          onStream({ type: "variable", msg: { name: vName, value, operation: "set" } });
          return { result: `变量 ${vName} 已设置为 ${value}` };
        }
      }

      case "condition": {
        const cconfig = (step.config ?? {}) as { expression?: string };
        const expr = this.resolveVariables(cconfig.expression ?? step.task);
        const evaluated = this.safeEvaluate(expr);
        onStream({ type: "stream", msg: `[${step.id}] 条件判断: ${expr} → ${evaluated}` });
        return { result: evaluated ? "true" : "false" };
      }

      case "agent":
      default: {
        onStream({ type: "stream", msg: formatWorkerReceipt(step.task, agentRole) });

        const baseTask = step.dependsOn.length === 0
          ? step.task
          : `${step.task}\n前置结果:\n${step.dependsOn.map((depId) => `[${depId}]: ${results.get(depId)?.slice(0, 300)}`).join("\n")}`;
        const enrichedTask = this.resolveVariables(
          this.memoryPrompt ? `${baseTask}\n\n## 会话上下文\n${this.memoryPrompt}` : baseTask
        );

        const worker = new WorkerAgent(this.memory, this.adapter);
        worker.setTools(toolRegistry as unknown as { execute: (name: string, ctx: unknown) => Promise<{ success: boolean; data: unknown; error?: string }>; describe: () => string; list: () => string[] });
        let workerResult = await worker.run({ task: enrichedTask, contextPrompt: this.memoryPrompt, agentRole, signal }, (chunk) => onStream({ type: "stream", msg: chunk }));
        let output = (workerResult as { result: string }).result;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
          try {
            const critic = new CriticAgent(this.adapter);
            const review = await critic.run({ task: step.task, output, stepId: step.id, contextPrompt: this.memoryPrompt });
            onStream({ type: "critic", msg: { stepId: step.id, attempt: attempt + 1, ...review } });
            onStream({ type: "stream", msg: `\n${formatCriticReview(step.id, review.valid, review.score, review.issues, review.suggestion)}` });
            if (review.valid || review.score >= this.config.criticThreshold) break;
            if (attempt < this.config.maxRetries) {
              onStream({ type: "retry", msg: { stepId: step.id, suggestion: review.suggestion } });
              const retryWorker = new WorkerAgent(this.memory, this.adapter);
              retryWorker.setTools(toolRegistry as unknown as { execute: (name: string, ctx: unknown) => Promise<{ success: boolean; data: unknown; error?: string }>; describe: () => string; list: () => string[] });
              workerResult = await retryWorker.run({ task: `${step.task}\n改进要求: ${review.suggestion}`, contextPrompt: this.memoryPrompt, agentRole });
              output = (workerResult as { result: string }).result;
            }
          } catch (err) {
            logger.warn(`Critic review failed for step ${step.id}: ${err}`, 'Orchestrator');
            break;
          }
        }

        const outputs = extractOutputInfo(output);
        onStream({ type: "stream", msg: `\n${formatWorkerReport(step.task, agentRole, "已完成任务执行", outputs)}` });

        return { result: output };
      }
    }
  }

  private resolveVariables(text: string): string {
    return text.replace(/\{\{\s*(\w+)(?:\.(\w+))?\s*\}\}/g, (_, varName: string, prop: string) => {
      const val = this.contextStore[varName];
      if (val === undefined) return `(未定义:${varName})`;
      if (prop && typeof val === "object" && val !== null) {
        return String((val as Record<string, unknown>)[prop] ?? `(未定义:${varName}.${prop})`);
      }
      return String(val);
    });
  }

  private safeEvaluate(expression: string): boolean {
    const resolved = expression.replace(/\b([a-zA-Z_]\w*)\b/g, (_match: string, varName: string) => {
      if (["true", "false", "null", "undefined", "if", "else", "return", "typeof", "instanceof", "new", "var", "let", "const"].includes(varName)) return varName;
      const val = this.contextStore[varName];
      if (val === undefined) return "undefined";
      return JSON.stringify(val);
    });
    try {
      return new Function(`"use strict"; return Boolean(${resolved});`)();
    } catch {
      return false;
    }
  }
}

export const createOrchestrator = (adapter?: IAdapter, config?: Partial<OrchestratorConfig>) => new Orchestrator(config, adapter);
