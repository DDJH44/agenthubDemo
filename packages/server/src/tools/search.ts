import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const TAVILY_KEY = process.env.TAVILY_API_KEY;

export const searchTool: ITool = {
  name: "search",
  description: "Search the web through a configured Tavily API key. Params: { input: query }",
  parameters: { input: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const query = String(ctx.input ?? "");

    if (!TAVILY_KEY) {
      return {
        success: false,
        data: null,
        error: "Web search is not configured. Set TAVILY_API_KEY before using the search tool.",
      };
    }

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: "basic", max_results: 5 }),
      });

      if (!res.ok) {
        const detail = await res.text();
        return {
          success: false,
          data: null,
          error: `Tavily search failed: HTTP ${res.status} ${detail.slice(0, 300)}`,
        };
      }

      const json = await res.json() as { results?: Array<{ title: string; url: string; content: string }> };
      const results = (json.results ?? []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content.slice(0, 300),
      }));
      return { success: true, data: { query, results, source: "tavily" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Tavily search failed: ${message}`, "Search");
      return {
        success: false,
        data: null,
        error: `Tavily search failed: ${message}`,
      };
    }
  },
};
