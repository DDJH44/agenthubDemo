import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const TAVILY_KEY = process.env.TAVILY_API_KEY;

export const searchTool: ITool = {
  name: "search",
  description: "搜索网络获取实时信息。参数: { input: 搜索关键词 }",
  parameters: { input: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const query = String(ctx.input ?? "");

    // Real: Tavily API
    if (TAVILY_KEY) {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: "basic", max_results: 5 }),
        });
        const json = await res.json();
        const results = (json.results ?? []).map((r: { title: string; url: string; content: string }) => ({
          title: r.title, url: r.url, snippet: r.content.slice(0, 300),
        }));
        return { success: true, data: { query, results, source: "tavily" } };
      } catch (_err) {
        logger.warn("Tavily failed, fallback to mock", 'Search');
      }
    }

    // Mock fallback
    return {
      success: true,
      data: {
        query,
        results: [
          { title: `${query} - 官方文档`, url: `https://docs.example.com/${encodeURIComponent(query)}`, snippet: "官方技术文档中的详细说明与最佳实践..." },
          { title: `${query} - 技术博客`, url: `https://blog.example.com/${encodeURIComponent(query)}`, snippet: "社区开发者分享的实现经验与踩坑记录..." },
          { title: `${query} - GitHub`, url: `https://github.com/search?q=${encodeURIComponent(query)}`, snippet: "相关开源项目与代码示例..." },
        ],
        source: "mock",
      },
    };
  },
};
