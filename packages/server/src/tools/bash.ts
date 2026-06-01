import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { execSync } from "child_process";
import { logger } from "../utils/logger";

const BLOCKED_COMMANDS = ["rm -rf /", "mkfs", "dd if=", ":(){ :|:& };:", "chmod 777 /", "> /dev/sda"];

export const bashTool: ITool = {
  name: "bash",
  description: "执行 Shell 命令。参数: { command: 要执行的命令, workdir?: 工作目录（可选）, timeout?: 超时毫秒（默认 30000） }",
  parameters: { command: "string", workdir: "string?", timeout: "number?" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = ctx.input as { command?: string; workdir?: string; timeout?: number };
    if (!input.command) return { success: false, data: null, error: "缺少 command 参数" };

    const cmd = input.command.trim();
    for (const blocked of BLOCKED_COMMANDS) {
      if (cmd.includes(blocked)) {
        return { success: false, data: null, error: `命令被拦截: 包含危险操作 "${blocked}"` };
      }
    }

    try {
      const cwd = input.workdir || process.cwd();
      const timeout = Math.min(input.timeout || 30000, 60000);

      logger.info(`执行命令: ${cmd} (cwd: ${cwd})`, "Bash");
      const stdout = execSync(cmd, { cwd, timeout, encoding: "utf-8", maxBuffer: 1024 * 1024, shell: "powershell.exe" });

      return {
        success: true,
        data: {
          command: cmd,
          stdout: stdout.slice(0, 50000),
          exitCode: 0,
        },
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      return {
        success: false,
        data: {
          command: cmd,
          stdout: (typeof execErr.stdout === "string" ? execErr.stdout : execErr.stdout?.toString() ?? "").slice(0, 10000),
          stderr: (typeof execErr.stderr === "string" ? execErr.stderr : execErr.stderr?.toString() ?? execErr.message ?? "").slice(0, 10000),
          exitCode: -1,
        },
        error: execErr.message?.slice(0, 1000),
      };
    }
  },
};
