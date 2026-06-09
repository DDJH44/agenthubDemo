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
import { isArtifactGenerationTask, isSimpleChat } from "../utils/task-classifier";

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
    return isSimpleChat(task);
  }

  private isCodeGenerationTask(task: string): boolean {
    return isArtifactGenerationTask(task);
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

    const enrichedTask = this.memoryPrompt
      ? `## 会话上下文\n${this.memoryPrompt}\n\n用户需求: ${task}`
      : task;

    const planSteps: PlanNode[] = [
      { id: "1", task: `确认产物目标：${task}`, dependsOn: [], agentRole: "planner" },
      { id: "2", task: "设计页面结构、视觉风格和交互节奏", dependsOn: ["1"], agentRole: "refiner" },
      { id: "3", task: "生成完整可运行的前端代码", dependsOn: ["2"], agentRole: "worker" },
      { id: "4", task: "准备预览、编辑和部署建议", dependsOn: ["3"], agentRole: "critic" },
    ];
    onStream({ type: "plan", msg: { steps: planSteps } });
    onStream({ type: "stream", msg: `\n${formatTaskDecomposition(planSteps)}\n\n${formatTaskAssignment(planSteps)}` });

    onStream({ type: "stream", msg: "\n\n[PMO 进度] 1/4 已确认这是一个可预览的前端产物任务，会优先生成单文件交付。" });
    onStream({ type: "stream", msg: "\n[Design Agent] 2/4 正在确定页面层级、视觉氛围和动画节奏。" });
    onStream({ type: "stream", msg: `\n${formatWorkerReceipt("完整前端代码生成", "worker")}` });
    onStream({ type: "stream", msg: "\n[Codex] 3/4 开始生成代码，内容会持续写入当前消息。\n\n" });

    const systemPrompt = `你是一个高级前端工程师，正在 AgentHub 的多 Agent 流程中生成可预览产物。
请严格按以下规则输出：
1. 输出一个完整可运行的单文件前端产物，优先使用 HTML，内联 CSS 和 JavaScript
2. 必须使用代码块标记，例如 \`\`\`html
3. 代码不能省略，不能写“此处省略”
4. 产物要包含基础交互、响应式适配和清晰注释
5. 如果用户要求后端、数据库、CRUD、管理系统或后台，但当前交付目标是静态预览，请只生成浏览器端轻量原型，并明确标注“非真实后端”；不要声称已经接入真实 API 或数据库。若用户明确要求真实服务端项目，请输出真实项目结构、接口代码和运行说明
6. 除代码块外，只允许有一句很短的交付说明`;

    const generationPrompt = `${enrichedTask}\n\n请生成 index.html。若用户没有指定技术栈，使用原生 HTML/CSS/JavaScript；如果是烟花、动画、游戏或可视化类需求，优先使用 Canvas 实现；如果是轻量管理系统、后端、CRUD 或数据库需求，生成一个包含列表、表单、搜索、状态统计和浏览器本地存储的单文件可预览版本，并在界面或注释中标明这是静态原型而不是真实后端。`;

    let reply = "";
    for await (const chunk of this.adapter!.streamResponse(generationPrompt, { systemPrompt, temperature: 0.35, maxTokens: 8192, signal })) {
      reply += chunk;
      onStream({ type: "stream", msg: chunk });
    }

    if (!reply.trim()) {
      reply = await this.adapter!.sendMessage(generationPrompt, { systemPrompt, temperature: 0.35, maxTokens: 8192, signal });
      onStream({ type: "stream", msg: reply });
    }

    const outputs = extractOutputInfo(reply);
    const report = formatWorkerReport(task, "worker", "直接生成完整可运行代码", outputs);
    onStream({ type: "stream", msg: `\n\n[UX Reviewer] 4/4 已完成可预览交付物检查，建议先预览再微调视觉细节。\n\n${report}` });

    const stepResults = [
      { id: "1", task: planSteps[0].task, result: "已识别为可预览前端产物任务。" },
      { id: "2", task: planSteps[1].task, result: "已确定采用单文件结构，便于预览、编辑和部署。" },
      { id: "3", task: planSteps[2].task, result: reply, toolUsed: "code" as const },
      { id: "4", task: planSteps[3].task, result: "已准备预览、编辑和部署后续操作。" },
    ];
    const summary = `${formatFinalSummary(task, stepResults, outputs)}\n\n接下来可以直接在产物卡片里预览，也可以继续要求我调整动画、配色或部署方式。`;
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
    signal?: AbortSignal,
    runtimePrompt?: string
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
    if (runtimePrompt?.trim()) {
      this.memoryPrompt = [runtimePrompt.trim(), this.memoryPrompt].filter(Boolean).join("\n\n");
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
    const toolUsedByStep = new Map<string, string | null | undefined>();
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
        toolUsedByStep.set(wave[i].id, waveResults[i].toolUsed);
        completed.add(wave[i].id);
        remaining.delete(wave[i].id);
      }
    }

    return steps.map((s) => ({ id: s.id, task: s.task, result: results.get(s.id) ?? "", toolUsed: toolUsedByStep.get(s.id) }));
  }

  private async executeStep(
    step: PlanNode,
    results: Map<string, string>,
    onStream: (e: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<{ result: string; toolUsed?: string | null }> {
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
        return { result: output, toolUsed: "code" };
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

        return { result: output, toolUsed: (workerResult as { toolUsed?: string | null }).toolUsed };
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
