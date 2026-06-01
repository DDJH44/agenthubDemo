import { spawn, ChildProcess } from "child_process";
import { BaseAdapter } from "../base";
import type { AdapterConfig, AdapterCapabilities, AdapterContext } from "../types";

export class CodexAdapter extends BaseAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true, toolCalling: true, vision: false, embeddings: false,
    maxContextTokens: 128000, supportsSystemPrompt: true,
  };
  private process: ChildProcess | null = null;

  constructor(config: AdapterConfig) { super(config, "codex"); }

  async connect(): Promise<void> {
    try {
      this.process = spawn(this.config.cliPath ?? "codex", ["exec", "--json"], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
      this.connected = true;
    } catch (err) {
      console.warn(`[CodexAdapter] Failed to spawn process: ${err}, running in mock mode`);
      this.connected = true;
    }
  }

  async sendMessage(content: string, _context?: AdapterContext): Promise<string> {
    if (!this.process) return `[Codex mock] ${content.substring(0, 50)}`;
    this.process.stdin?.write(JSON.stringify({ input: content }) + "\n");
    return "Task dispatched to Codex";
  }

  async *streamResponse(content: string, _context?: AdapterContext): AsyncGenerator<string, string, unknown> {
    if (!this.process) { yield "[Codex] mock stream..."; return ""; }
    this.process.stdin?.write(JSON.stringify({ input: content, stream: true }) + "\n");
    if (this.process.stdout) for await (const chunk of this.process.stdout) yield chunk.toString();
    return "";
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    this.process?.stdin?.write(JSON.stringify({ tool: name, params }) + "\n");
    return { dispatched: true };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error("CodexAdapter does not support embeddings");
  }

  async disconnect(): Promise<void> {
    this.process?.stdin?.end(); this.process?.kill(); this.process = null; this.connected = false;
  }
}
