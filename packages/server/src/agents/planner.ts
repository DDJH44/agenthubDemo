import { BaseAgent } from "./base";
import type { IAdapter } from "@agenthub/adapter";
import { logger } from "../utils/logger";

interface PlannerOutput { steps: Array<{ id: string; task: string; dependsOn: string[]; agentRole?: string }>; }

export class PlannerAgent extends BaseAgent {
  constructor(adapter?: IAdapter) { super("planner", adapter); }

  async run(input: { task: string; contextPrompt?: string }, onStream?: (msg: string) => void): Promise<PlannerOutput> {
    const { task, contextPrompt } = input;
    onStream?.("分析需求并拆解为执行步骤...");

    const enrichedTask = contextPrompt
      ? `## 会话已完成任务的上下文\n${contextPrompt}\n\n## 当前任务\n${task}`
      : task;

    const systemPrompt = `你是一个任务规划专家。你的唯一职责是将用户需求拆解为可执行的步骤列表，并为每个步骤分配负责的智能体角色。
严格规则：
1. 只输出 JSON，绝对不要输出代码、HTML、CSS、JavaScript 或任何编程语言代码
2. 不要实现用户的需求，只做规划
3. 输出格式必须严格为：{"steps":[{"id":"1","task":"具体步骤描述","dependsOn":[],"agentRole":"角色名"}]}
4. 拆解为 3-5 个具体步骤，每个步骤有唯一 id
5. dependsOn 列出该步骤依赖的前置步骤 id（无依赖则为空数组）
6. agentRole 必须从以下角色中选择：
   - "researcher"：适合需求调研、信息收集、技术选型
   - "planner"：适合架构设计、方案制定
   - "worker"：适合代码实现、功能开发、核心逻辑编写
   - "critic"：适合代码审查、质量评估
   - "refiner"：适合内容润色、成果整合
7. 步骤描述要具体、可执行，中文描述
8. 根据步骤性质合理分配角色，例如：
   - 需求分析 → researcher
   - 架构设计 → planner
   - 功能实现 → worker
   - 代码审查 → critic
   - 文档整合 → refiner`;

    let raw = "";
    if (this.adapter) {
      for await (const chunk of this.adapter.streamResponse(enrichedTask, { systemPrompt, temperature: 0.2, maxTokens: 1000 })) {
        raw += chunk;
        onStream?.(chunk);
      }
    } else {
      raw = this.fallbackPlan(task);
    }

    const parsed = this.tryParsePlan(raw);
    if (parsed) {
      onStream?.(`\n已拆解为 ${parsed.steps.length} 个步骤`);
      return parsed;
    }

    logger.warn("Planner output was not valid JSON, using structured fallback", 'PlannerAgent');
    onStream?.("\n使用标准工作流执行任务");
    return this.structuredFallback(task);
  }

  private tryParsePlan(raw: string): PlannerOutput | null {
    const jsonBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonBlock) {
      try { const p = JSON.parse(jsonBlock[1].trim()); if (p.steps?.length) return this.normalizePlan(p); } catch {}
    }

    const cleaned = raw.replace(/```[\s\S]*?```/g, "").trim();
    try { const p = JSON.parse(cleaned); if (p.steps?.length) return this.normalizePlan(p); } catch {}

    const stepsMatch = cleaned.match(/\{\s*"steps"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (stepsMatch) {
      try { const p = JSON.parse(stepsMatch[0]); if (p.steps?.length) return this.normalizePlan(p); } catch {}
    }

    return null;
  }

  private normalizePlan(plan: { steps: Array<{ id: string; task: string; dependsOn: string[]; agentRole?: string }> }): PlannerOutput {
    return {
      steps: plan.steps.map(s => ({
        id: s.id,
        task: s.task,
        dependsOn: s.dependsOn ?? [],
        agentRole: s.agentRole ?? this.inferRole(s.task),
      })),
    };
  }

  private inferRole(task: string): string {
    const lower = task.toLowerCase();
    if (/调研|研究|收集|分析需求|技术选型/.test(lower)) return "researcher";
    if (/设计|架构|规划|方案/.test(lower)) return "planner";
    if (/审查|评估|检查|测试|验证/.test(lower)) return "critic";
    if (/整合|润色|优化|文档|总结/.test(lower)) return "refiner";
    return "worker";
  }

  private structuredFallback(task: string): PlannerOutput {
    return {
      steps: [
        { id: "1", task: `需求分析：${task}`, dependsOn: [], agentRole: "researcher" },
        { id: "2", task: `技术方案：设计${task}的架构和技术选型`, dependsOn: ["1"], agentRole: "planner" },
        { id: "3", task: `核心实现：${task}`, dependsOn: ["2"], agentRole: "worker" },
        { id: "4", task: `测试验证：检查${task}的功能完整性`, dependsOn: ["3"], agentRole: "critic" },
      ],
    };
  }

  private fallbackPlan(task: string): string {
    return JSON.stringify(this.structuredFallback(task));
  }
}
