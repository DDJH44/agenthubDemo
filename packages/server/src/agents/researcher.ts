import { BaseAgent } from "./base";
import type { IAdapter } from "@agenthub/adapter";

export class ResearcherAgent extends BaseAgent {
  constructor(adapter?: IAdapter) { super("researcher", adapter); }

  async run(input: { topic: string; contextPrompt?: string }, onStream?: (msg: string) => void): Promise<string> {
    const { topic, contextPrompt } = input;
    onStream?.("正在调研相关信息和最佳实践...");
    if (!this.adapter) return `[搜索] 关于 "${topic}" 的相关信息...`;
    const enrichedTopic = contextPrompt
      ? `## 历史上下文\n${contextPrompt}\n\n## 研究主题\n${topic}\n综合信息，输出结构化研究报告。`
      : `## 研究主题\n${topic}\n综合信息，输出结构化研究报告。`;

    let result = "";
    for await (const chunk of this.adapter.streamResponse(enrichedTopic, { temperature: 0.3 })) {
      result += chunk;
      onStream?.(chunk);
    }
    return result;
  }
}
