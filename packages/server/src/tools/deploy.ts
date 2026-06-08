import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

export const deployTool: ITool = {
  name: "deploy",
  description: "Submit a project to a configured deployment provider. Params: { input: project path, target: 'vercel' }",
  parameters: { input: "string", target: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { input?: string; target?: string };
    const target = input?.target ?? "vercel";

    if (target !== "vercel") {
      return {
        success: false,
        data: null,
        error: `Deployment target "${target}" is not configured for this tool. Use the Deploy Panel for self-hosted/static/container deployments.`,
      };
    }

    if (!VERCEL_TOKEN) {
      return {
        success: false,
        data: null,
        error: "Vercel deployment is not configured. Set VERCEL_TOKEN or use the self-hosted Deploy Panel.",
      };
    }

    try {
      const res = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "agenthub-deploy", target: "production" }),
      });

      if (!res.ok) {
        const detail = await res.text();
        return {
          success: false,
          data: null,
          error: `Vercel deployment failed: HTTP ${res.status} ${detail.slice(0, 300)}`,
        };
      }

      const json = await res.json() as { alias?: string[]; url?: string };
      const url = json.alias?.[0] ?? json.url;
      if (!url) {
        return {
          success: false,
          data: null,
          error: "Vercel deployment completed without a public URL.",
        };
      }

      return { success: true, data: { deployUrl: `https://${url}`, status: "deployed", target: "vercel", source: "vercel" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Vercel deployment failed: ${message}`, "Deploy");
      return {
        success: false,
        data: null,
        error: `Vercel deployment failed: ${message}`,
      };
    }
  },
};
