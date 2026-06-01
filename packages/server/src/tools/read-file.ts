import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { readFileSync, existsSync, statSync } from "fs";
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

export const readFileTool: ITool = {
  name: "read_file",
  description: "读取指定文件内容。参数: { path: 文件路径（相对或绝对）, offset?: 起始行号（1-based）, limit?: 读取行数 }",
  parameters: { path: "string", offset: "number?", limit: "number?" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { path?: string; offset?: number; limit?: number };
    const filePath = input.path;
    if (!filePath) return { success: false, data: null, error: "缺少 path 参数" };

    try {
      const resolved = resolvePath(filePath, ctx.workspaceId ? path.join(process.cwd(), "workspaces", ctx.workspaceId) : undefined);
      if (!existsSync(resolved)) {
        return { success: false, data: null, error: `文件不存在: ${filePath}` };
      }

      const stat = statSync(resolved);
      if (stat.isDirectory()) {
        return { success: false, data: null, error: `路径是目录: ${filePath}` };
      }

      const maxSize = 1024 * 1024; // 1MB
      if (stat.size > maxSize) {
        return { success: false, data: null, error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大支持 1MB` };
      }

      const content = readFileSync(resolved, "utf-8");
      const lines = content.split("\n");
      const offset = (input.offset ?? 1) - 1;
      const limit = input.limit ?? lines.length;
      const slice = lines.slice(offset, offset + limit);

      logger.info(`读取文件: ${filePath} (行 ${offset + 1}-${offset + slice.length} / ${lines.length})`, "ReadFile");
      return {
        success: true,
        data: {
          path: filePath,
          content: slice.join("\n"),
          totalLines: lines.length,
          startLine: offset + 1,
          endLine: offset + slice.length,
        },
      };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "读取文件失败" };
    }
  },
};
