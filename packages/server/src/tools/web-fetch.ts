import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";

export const webFetchTool: ITool = {
  name: "web-fetch",
  description: "抓取网页内容并提取正文。参数: { input: URL地址 }",
  parameters: { input: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const url = String(ctx.input ?? "");

    try {
      const res = await fetch(url, { headers: { "User-Agent": "AgentHub/1.0" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, data: null, error: `HTTP ${res.status}` };
      const html = await res.text();
      // Simple text extraction: strip tags, limit length
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);
      return { success: true, data: { url, content: text, length: text.length } };
    } catch (err) {
      return { success: false, data: null, error: `无法抓取: ${err instanceof Error ? err.message : "Network error"}` };
    }
  },
};
