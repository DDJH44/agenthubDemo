import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { logger } from "../utils/logger";

function resolvePath(filePath: string, workspaceRoot?: string): string {
  const root = workspaceRoot || process.cwd();
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(root)) {
    throw new Error(`路径越界: ${filePath}`);
  }
  return resolved;
}

export const writeFileTool: ITool = {
  name: "write_file",
  description: "写入或创建文件。参数: { path: 文件路径, content: 文件内容 }",
  parameters: { path: "string", content: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { path?: string; content?: string };
    if (!input.path) return { success: false, data: null, error: "缺少 path 参数" };
    if (input.content === undefined) return { success: false, data: null, error: "缺少 content 参数" };

    try {
      const resolved = resolvePath(input.path, ctx.workspaceId ? path.join(process.cwd(), "workspaces", ctx.workspaceId) : undefined);
      const dir = path.dirname(resolved);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const existed = existsSync(resolved);
      writeFileSync(resolved, input.content, "utf-8");

      logger.info(`${existed ? "更新" : "创建"}文件: ${input.path}`, "WriteFile");
      return {
        success: true,
        data: { path: input.path, action: existed ? "updated" : "created", size: Buffer.byteLength(input.content, "utf-8") },
      };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "写入文件失败" };
    }
  },
};
