import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { readFileSync, existsSync, statSync } from "fs";
import { globSync } from "glob";
import path from "path";
import { logger } from "../utils/logger";

export const grepTool: ITool = {
  name: "grep",
  description: "在文件中搜索匹配正则表达式的内容。参数: { pattern: 正则表达式, path?: 搜索路径（文件或目录）, include?: 文件过滤 glob（如 *.ts）, workdir?: 工作目录 }",
  parameters: { pattern: "string", path: "string?", include: "string?", workdir: "string?" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { pattern?: string; path?: string; include?: string; workdir?: string };
    if (!input.pattern) return { success: false, data: null, error: "缺少 pattern 参数" };

    try {
      const cwd = input.workdir || process.cwd();
      const searchPath = input.path || ".";
      const resolvedPath = path.resolve(cwd, searchPath);

      let files: string[] = [];
      if (existsSync(resolvedPath)) {
        const stat = statSync(resolvedPath);
        if (stat.isFile()) {
          files = [resolvedPath];
        } else if (stat.isDirectory()) {
          const include = input.include || "**/*";
          files = globSync(include, {
            cwd: resolvedPath,
            ignore: ["node_modules/**", ".git/**", "dist/**", ".next/**", "*.db", "*.db-journal", "*.png", "*.jpg", "*.gif", "*.ico", "*.lock"],
            nodir: true,
            absolute: true,
          });
        }
      } else {
        // Treat searchPath as a glob itself
        files = globSync(searchPath, {
          cwd,
          ignore: ["node_modules/**", ".git/**", "dist/**", ".next/**", "*.db"],
          nodir: true,
          absolute: true,
        });
      }

      if (files.length === 0) {
        return { success: true, data: { pattern: input.pattern, count: 0, matches: [] } };
      }

      const regex = new RegExp(input.pattern, "g");
      const maxResults = 100;
      const results: Array<{ file: string; line: number; content: string }> = [];

      outer:
      for (const file of files.slice(0, 500)) {
        try {
          const fileStat = statSync(file);
          if (fileStat.size > 1024 * 1024) continue;

          const content = readFileSync(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const relativePath = path.relative(cwd, file).replace(/\\/g, "/");
              results.push({ file: relativePath, line: i + 1, content: lines[i].slice(0, 200) });
              regex.lastIndex = 0;
              if (results.length >= maxResults) break outer;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      logger.info(`Grep 搜索完成: ${input.pattern} → ${results.length} 个结果`, "Grep");
      return {
        success: true,
        data: {
          pattern: input.pattern,
          count: results.length,
          filesScanned: Math.min(files.length, 500),
          matches: results,
          truncated: results.length >= maxResults,
        },
      };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : "Grep 搜索失败" };
    }
  },
};
