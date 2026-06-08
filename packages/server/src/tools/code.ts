import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const E2B_KEY = process.env.E2B_API_KEY;

export const codeTool: ITool = {
  name: "code",
  description: "Execute code in a configured sandbox. Params: { input: code, language: 'python'|'javascript'|'bash' }",
  parameters: { input: "string", language: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = typeof ctx.input === "string" ? ctx.input : (ctx.input as Record<string, string>)?.input ?? "";
    const language = (ctx.input as Record<string, string>)?.language ?? "javascript";

    if (!E2B_KEY) {
      return {
        success: false,
        data: null,
        error: "Code execution sandbox is not configured. Set E2B_API_KEY before using the code tool.",
      };
    }

    try {
      const { Sandbox } = await import("@e2b/code-interpreter");
      const sandbox = await Sandbox.create();
      const result = await sandbox.runCode(input, { language });
      await sandbox.close();
      return {
        success: true,
        data: {
          output: result.logs.stdout?.join("\n") ?? result.text,
          error: result.logs.stderr?.join("\n") ?? result.error?.value,
          language,
          source: "e2b",
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`E2B execution failed: ${message}`, "Code");
      return {
        success: false,
        data: null,
        error: `Code execution failed: ${message}`,
      };
    }
  },
};
