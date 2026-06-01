import { BaseAgent } from "./base";
import type { IAdapter } from "@agenthub/adapter";
import { logger } from "../utils/logger";

export interface CriticReview { valid: boolean; score: number; issues: string; suggestion: string; }

export class CriticAgent extends BaseAgent {
  constructor(adapter?: IAdapter) { super("critic", adapter); }

  async run(input: { task: string; output: string; stepId: string; contextPrompt?: string }, onStream?: (msg: string) => void): Promise<CriticReview> {
    const { task, output, contextPrompt } = input;
    onStream?.(`[Critic] 审查: ${input.stepId}`);
    const def: CriticReview = { valid: true, score: 8, issues: "", suggestion: "" };
    if (!this.adapter) return def;
    const promptPrefix = contextPrompt ? `## 会话上下文\n${contextPrompt}\n\n` : "";
    const raw = await this.adapter.sendMessage(
      `${promptPrefix}审查任务执行结果。\n任务: ${task}\n结果: ${output}\n输出JSON: { "valid": bool, "score": 0-10, "issues": "问题", "suggestion": "建议" }`,
      { temperature: 0.2 }
    );
    try {
      const r = JSON.parse(raw);
      return { valid: r.valid ?? true, score: r.score != null ? Number(r.score) : 6, issues: r.issues ?? "", suggestion: r.suggestion ?? "" };
    } catch (err) {
      logger.warn(`Failed to parse critic response: ${err}`, 'CriticAgent');
      return def;
    }
  }
}
