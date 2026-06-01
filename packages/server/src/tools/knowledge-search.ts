import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { hybridSearch } from "../knowledge/search";

export const knowledgeSearchTool: ITool = {
  name: "knowledge_search",
  description: "搜索知识库文档。参数: { query: string, knowledgeBaseId?: string } 返回相关文档片段及来源。",
  parameters: { query: "string", knowledgeBaseId: "string" },
  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = typeof ctx.input === "string" ? { query: ctx.input } : ctx.input as Record<string, string>;
    const query = input?.query ?? "";
    if (!query.trim()) return { success: false, data: null, error: "query is required" };

    try {
      const adapter = createAdapterFromEnv();
      await adapter.connect();
      const results = await hybridSearch(adapter, {
        query,
        knowledgeBaseId: input?.knowledgeBaseId ?? "default",
        topK: 20,
        rerankTopK: 5,
      });
      await adapter.disconnect();

      const formatted = results.map(r => ({
        document: r.documentTitle,
        section: r.sectionTitle ?? "",
        content: r.content.slice(0, 500),
      }));

      return { success: true, data: formatted };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "Knowledge search failed" };
    }
  },
};
