import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { BaseAdapter } from "../base";
import type { AdapterConfig, AdapterCapabilities, AdapterContext } from "../types";

const SEND_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 180_000);
const STREAM_TIMEOUT_MS = Number(process.env.CODEX_STREAM_TIMEOUT_MS || 240_000);
const PLACEHOLDER_MODELS = new Set(["codex-cli", "gpt-4o-mini", "your-volcengine-endpoint-id"]);

export class CodexAdapter extends BaseAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: false,
    embeddings: false,
    maxContextTokens: 200000,
    supportsSystemPrompt: true,
  };

  private processes = new Set<ChildProcessWithoutNullStreams>();

  constructor(config: AdapterConfig) { super(config, "codex"); }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async sendMessage(content: string, context?: AdapterContext): Promise<string> {
    this.ensureConnected();
    return this.runCodex(content, context, SEND_TIMEOUT_MS);
  }

  async *streamResponse(content: string, context?: AdapterContext): AsyncGenerator<string, string, unknown> {
    this.ensureConnected();
    const result = await this.runCodex(content, context, STREAM_TIMEOUT_MS);
    yield result;
    return result;
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    return { dispatched: false, tool: name, params, reason: "Codex CLI tools are managed inside codex exec." };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error("CodexAdapter does not support embeddings");
  }

  async disconnect(): Promise<void> {
    for (const child of this.processes) {
      this.killProcessTree(child);
    }
    this.processes.clear();
    this.connected = false;
  }

  private buildPrompt(content: string, context?: AdapterContext) {
    const sections = [
      "你正在作为 AgentHub 群聊里的 Codex CLI Agent 被调用。",
      "只输出给用户看的最终内容，不要输出内部 JSON 事件、工具调用日志、命令交互提示或固定格式模板。",
      "请根据用户语境随机应变：闲聊就简短自然回复，明确代码/修复/分析任务才给出对应交付内容。",
      "除非用户明确要求修改仓库文件，否则不要声称已经写入本地文件。",
      context?.systemPrompt ? `系统要求：\n${context.systemPrompt}` : undefined,
      context?.history?.length
        ? `历史对话：\n${context.history.map((item) => `${item.role}: ${item.content}`).join("\n")}`
        : undefined,
      `用户任务：\n${content}`,
    ].filter(Boolean);
    return sections.join("\n\n");
  }

  private buildArgs(outputFile: string) {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--color",
      "never",
      "--output-last-message",
      outputFile,
    ];

    const sandbox = process.env.CODEX_SANDBOX?.trim() || "read-only";
    if (sandbox) args.push("--sandbox", sandbox);

    const model = this.config.model?.trim();
    if (model && !PLACEHOLDER_MODELS.has(model)) {
      args.push("--model", model);
    }

    args.push("-");
    return args;
  }

  private resolveCwd() {
    const configured = process.env.CODEX_WORKDIR?.trim();
    if (configured) return configured;

    let dir = process.cwd();
    let firstPackageDir = "";
    for (let depth = 0; depth < 6; depth += 1) {
      if (existsSync(path.join(dir, ".git"))) return dir;
      if (!firstPackageDir && existsSync(path.join(dir, "package.json"))) firstPackageDir = dir;
      const parent = path.dirname(dir);
      if (parent === dir) return firstPackageDir || process.cwd();
      dir = parent;
    }
    return firstPackageDir || process.cwd();
  }

  private async runCodex(content: string, context: AdapterContext | undefined, timeoutMs: number): Promise<string> {
    if (context?.signal?.aborted) {
      const err = new Error("Codex CLI request aborted before starting");
      err.name = "AbortError";
      throw err;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), "agenthub-codex-"));
    const outputFile = path.join(tempDir, "last-message.txt");

    try {
      return await new Promise<string>((resolve, reject) => {
        let settled = false;
        let stderr = "";
        let stdout = "";
        const command = this.config.cliPath ?? "codex";
        const child = spawn(command, this.buildArgs(outputFile), {
          cwd: this.resolveCwd(),
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
          shell: this.shouldUseShell(command),
        });
        this.processes.add(child);

        const timer = setTimeout(() => {
          this.killProcessTree(child);
          finish(() => {
            const err = new Error(`Codex CLI timed out after ${Math.round(timeoutMs / 1000)}s`);
            err.name = "AbortError";
            reject(err);
          });
        }, timeoutMs);

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          context?.signal?.removeEventListener("abort", onAbort);
          this.processes.delete(child);
          fn();
        };

        const onAbort = () => {
          this.killProcessTree(child);
          finish(() => {
            const err = new Error("Codex CLI request aborted");
            err.name = "AbortError";
            reject(err);
          });
        };
        context?.signal?.addEventListener("abort", onAbort);

        child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.on("error", (err) => {
          finish(() => reject(err));
        });
        child.on("close", async (code) => {
          try {
            const finalText = (await readFile(outputFile, "utf-8").catch(() => "")).trim();
            finish(() => {
              this.killProcessTree(child);
              if (code === 0 && finalText) {
                resolve(finalText);
                return;
              }

              const fallbackText = this.extractReadableOutput(stdout).trim();
              if (code === 0 && fallbackText) {
                resolve(fallbackText);
                return;
              }

              const detail = (stderr || fallbackText || stdout || `Codex CLI exited with code ${code}`).trim();
              reject(new Error(detail));
            });
          } catch (err) {
            finish(() => reject(err instanceof Error ? err : new Error(String(err))));
          }
        });

        child.stdin.end(this.buildPrompt(content, context));
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private extractReadableOutput(stdout: string) {
    const chunks: string[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        const msg = event.msg && typeof event.msg === "object" ? event.msg as Record<string, unknown> : undefined;
        const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : undefined;
        for (const candidate of [msg?.content, msg?.text, item?.content, item?.text, event.content, event.text]) {
          if (typeof candidate === "string" && candidate.trim()) chunks.push(candidate.trim());
        }
      } catch {
        chunks.push(trimmed);
      }
    }
    return chunks.join("\n\n");
  }

  private shouldUseShell(command: string) {
    return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  }

  private killProcessTree(child: ChildProcessWithoutNullStreams) {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    child.kill();
  }
}
