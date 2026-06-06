import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { BaseAdapter } from "../base";
import type { AdapterConfig, AdapterCapabilities, AdapterContext } from "../types";

const SEND_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 180_000;
const PLACEHOLDER_MODELS = new Set(["gpt-4o-mini", "your-volcengine-endpoint-id"]);

export class ClaudeCodeAdapter extends BaseAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true, toolCalling: true, vision: true, embeddings: false,
    maxContextTokens: 200000, supportsSystemPrompt: true,
  };
  private processes = new Set<ChildProcessWithoutNullStreams>();

  constructor(config: AdapterConfig) { super(config, "claude-code"); }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async sendMessage(content: string, context?: AdapterContext): Promise<string> {
    this.ensureConnected();
    return this.runClaude(content, context, SEND_TIMEOUT_MS);
  }

  async *streamResponse(content: string, context?: AdapterContext): AsyncGenerator<string, string, unknown> {
    this.ensureConnected();
    const generator = this.runClaudeStreaming(content, context, STREAM_TIMEOUT_MS);
    let result = "";
    for await (const chunk of generator) {
      result += chunk;
      yield chunk;
    }
    return result;
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    return { dispatched: true, tool: name, params };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error("ClaudeCodeAdapter does not support embeddings");
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
      "你正在作为 AgentHub 内部的 Claude Code Agent 被调用。请只输出给用户看的最终内容，不要输出 Claude Code 的内部工具调用 XML、<invoke> 标签、命令执行标签或交互式提示。",
      context?.systemPrompt ? `系统要求：\n${context.systemPrompt}` : undefined,
      context?.history?.length
        ? `历史对话：\n${context.history.map((item) => `${item.role}: ${item.content}`).join("\n")}`
        : undefined,
      `用户任务：\n${content}`,
    ].filter(Boolean);
    return sections.join("\n\n");
  }

  private buildArgs() {
    const args = ["--bare", "--print", "--output-format=text", "--no-session-persistence", "--tools=none"];
    const model = this.config.model?.trim();
    if (model && !PLACEHOLDER_MODELS.has(model)) {
      args.push("--model", model);
    }
    return args;
  }

  private runClaude(content: string, context: AdapterContext | undefined, timeoutMs: number): Promise<string> {
    if (context?.signal?.aborted) {
      const err = new Error("Claude Code request aborted before starting");
      err.name = "AbortError";
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      const child = spawn(this.config.cliPath ?? "claude", this.buildArgs(), {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
      });
      this.processes.add(child);

      const timer = setTimeout(() => {
        this.killProcessTree(child);
        finish(() => {
          const err = new Error(`Claude Code CLI timed out after ${Math.round(timeoutMs / 1000)}s`);
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
          const err = new Error("Claude Code request aborted");
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
      child.on("close", (code) => {
        finish(() => {
          this.killProcessTree(child);
          const text = stdout.trim();
          if (code === 0 && text) {
            resolve(text);
            return;
          }
          const errText = (stderr || stdout || `Claude Code exited with code ${code}`).trim();
          reject(new Error(errText));
        });
      });

      child.stdin.end(this.buildPrompt(content, context));
    });
  }

  private async *runClaudeStreaming(content: string, context: AdapterContext | undefined, timeoutMs: number): AsyncGenerator<string, string, unknown> {
    if (context?.signal?.aborted) {
      const err = new Error("Claude Code request aborted before starting");
      err.name = "AbortError";
      throw err;
    }

    let settled = false;
    let stderr = "";
    let result = "";
    let resolveOnClose!: (value: string) => void;
    let rejectOnClose!: (reason: Error) => void;
    const closePromise = new Promise<string>((resolve, reject) => {
      resolveOnClose = resolve;
      rejectOnClose = reject;
    });

    const child = spawn(this.config.cliPath ?? "claude", this.buildArgs(), {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
    });
    this.processes.add(child);

    const timer = setTimeout(() => {
      this.killProcessTree(child);
      finish(() => {
        const err = new Error(`Claude Code CLI timed out after ${Math.round(timeoutMs / 1000)}s`);
        err.name = "AbortError";
        rejectOnClose(err);
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
        const err = new Error("Claude Code request aborted");
        err.name = "AbortError";
        rejectOnClose(err);
      });
    };
    context?.signal?.addEventListener("abort", onAbort);

    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      finish(() => rejectOnClose(err instanceof Error ? err : new Error(String(err))));
    });
    child.on("close", (code) => {
      finish(() => {
        this.killProcessTree(child);
        if (code === 0 && result) {
          resolveOnClose(result);
          return;
        }
        const errText = (stderr || result || `Claude Code exited with code ${code}`).trim();
        rejectOnClose(new Error(errText));
      });
    });

    child.stdin.end(this.buildPrompt(content, context));

    for await (const chunk of child.stdout) {
      const text = chunk.toString();
      result += text;
      yield text;
    }

    return closePromise;
  }

  private killProcessTree(child: ChildProcessWithoutNullStreams) {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    child.kill();
  }
}
