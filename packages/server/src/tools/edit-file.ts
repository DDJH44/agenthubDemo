import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { readFileSync, writeFileSync, existsSync } from "fs";
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

export const editFileTool: ITool = {
  name: "edit_file",
  description: "编辑文件，替换指定文本块。参数: { path: 文件路径, old_str: 要替换的原文本（必须唯一匹配）, new_str: 新文本 }",
  parameters: { path: "string", old_str: "string", new_str: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { path?: string; old_str?: string; new_str?: string };
    if (!input.path) return { success: false, data: null, error: "缺少 path 参数" };
    if (input.old_str === undefined) return { success: false, data: null, error: "缺少 old_str 参数" };
    if (input.new_str === undefined) return { success: false, data: null, error: "缺少 new_str 参数" };

    try {
      const resolved = resolvePath(input.path, ctx.workspaceId ? path.join(process.cwd(), "workspaces", ctx.workspaceId) : undefined);
      if (!existsSync(resolved)) {
        return { success: false, data: null, error: `文件不存在: ${input.path}` };
      }

      const content = readFileSync(resolved, "utf-8");
      const oldStr = input.old_str;
      const newStr = input.new_str;

      if (oldStr === newStr) {
        return { success: false, data: null, error: "old_str 和 new_str 相同，无需修改" };
      }

      const occurrences = content.split(oldStr).length - 1;
      if (occurrences === 0) {
        return { success: false, data: null, error: `在文件中未找到匹配的 old_str` };
      }
      if (occurrences > 1) {
        return { success: false, data: null, error: `old_str 匹配了 ${occurrences} 处，请提供更精确的上下文` };
      }

      const newContent = content.replace(oldStr, newStr);
      writeFileSync(resolved, newContent, "utf-8");

      logger.info(`编辑文件: ${input.path}`, "EditFile");
      return {
        success: true,
        data: {
          path: input.path,
          oldSize: Buffer.byteLength(content, "utf-8"),
          newSize: Buffer.byteLength(newContent, "utf-8"),
          changes: 1,
        },
      };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "编辑文件失败" };
    }
  },
};
