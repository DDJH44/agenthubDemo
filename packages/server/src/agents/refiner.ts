import { BaseAgent } from "./base";
import type { IAdapter } from "@agenthub/adapter";

export class RefinerAgent extends BaseAgent {
  constructor(adapter?: IAdapter) { super("refiner", adapter); }

  async run(input: { content: string; contextPrompt?: string }, onStream?: (msg: string) => void): Promise<string> {
    const { content, contextPrompt } = input;
    onStream?.(`[Refiner] 润色优化...`);
    if (!this.adapter) return content;
    const enriched = contextPrompt
      ? `## 会话上下文\n${contextPrompt}\n\n优化以下内容（专业、简洁、结构化，保持原意）:\n${content}`
      : `优化以下内容（专业、简洁、结构化，保持原意）:\n${content}`;
    const result = await this.adapter.sendMessage(enriched, { temperature: 0.3 });
    return result;
  }
}
