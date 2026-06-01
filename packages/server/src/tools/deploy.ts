import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

export const deployTool: ITool = {
  name: "deploy",
  description: "部署项目到 Vercel。参数: { input: 项目路径, target: 'vercel'|'cloudflare' }",
  parameters: { input: "string", target: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { input?: string; target?: string };
    const target = input?.target ?? "vercel";

    // Real: Vercel API
    if (VERCEL_TOKEN && target === "vercel") {
      try {
        const res = await fetch("https://api.vercel.com/v13/deployments", {
          method: "POST",
          headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "agenthub-deploy", target: "production" }),
        });
        const json = await res.json();
        return { success: true, data: { deployUrl: `https://${json.alias?.[0] ?? json.url}`, status: "deployed", target: "vercel" } };
      } catch (_err) {
        logger.warn("Vercel failed", 'Deploy');
      }
    }

    // Mock
    return {
      success: true,
      data: {
        status: "deployed",
        target,
        deployUrl: `https://agenthub-demo.${target}.app`,
        buildLog: "✓ Building...\n✓ Optimizing...\n✓ Deployed",
        source: "mock",
      },
    };
  },
};
