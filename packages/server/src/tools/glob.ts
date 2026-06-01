import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { globSync } from "glob";
import { logger } from "../utils/logger";

export const globTool: ITool = {
  name: "glob",
  description: "按 glob 模式搜索匹配的文件。参数: { pattern: glob 模式（如 **/*.ts）, workdir?: 搜索根目录 }",
  parameters: { pattern: "string", workdir: "string?" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { pattern?: string; workdir?: string };
    if (!input.pattern) return { success: false, data: null, error: "缺少 pattern 参数" };

    try {
      const cwd = input.workdir || process.cwd();

      logger.info(`Glob 搜索: ${input.pattern} (cwd: ${cwd})`, "Glob");
      const matches = globSync(input.pattern, {
        cwd,
        ignore: ["node_modules/**", ".git/**", "dist/**", ".next/**", "*.db", "*.db-journal"],
        nodir: true,
        absolute: false,
      });

      const relative = matches.map((m) => m.replace(/\\/g, "/"));
      logger.info(`找到 ${relative.length} 个文件`, "Glob");

      return {
        success: true,
        data: {
          pattern: input.pattern,
          count: relative.length,
          files: relative.slice(0, 200),
          truncated: relative.length > 200,
        },
      };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "Glob 搜索失败" };
    }
  },
};
