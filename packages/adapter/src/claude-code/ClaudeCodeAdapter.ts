import { spawn, ChildProcess } from "child_process";
import { BaseAdapter } from "../base";
import type { AdapterConfig, AdapterCapabilities, AdapterContext } from "../types";

export class ClaudeCodeAdapter extends BaseAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true, toolCalling: true, vision: true, embeddings: false,
    maxContextTokens: 200000, supportsSystemPrompt: true,
  };
  private process: ChildProcess | null = null;

  constructor(config: AdapterConfig) { super(config, "claude-code"); }

  async connect(): Promise<void> {
    try {
      this.process = spawn(this.config.cliPath ?? "claude", ["--print", "--output-format=stream-json"], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
      this.connected = true;
    } catch (err) {
      console.warn(`[ClaudeCodeAdapter] Failed to spawn process: ${err}, running in mock mode`);
      this.connected = true;
    }
  }

  async sendMessage(content: string, _context?: AdapterContext): Promise<string> {
    this.ensureConnected();
    if (!this.process) return `[Claude Code mock] ${content.substring(0, 50)}`;
    this.process.stdin?.write(JSON.stringify({ prompt: content }) + "\n");
    return "Task dispatched to Claude Code";
  }

  async *streamResponse(content: string, _context?: AdapterContext): AsyncGenerator<string, string, unknown> {
    if (!this.process) { yield "[Claude Code] mock stream..."; return ""; }
    this.process.stdin?.write(JSON.stringify({ prompt: content, stream: true }) + "\n");
    if (this.process.stdout) for await (const chunk of this.process.stdout) yield chunk.toString();
    return "";
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    this.process?.stdin?.write(JSON.stringify({ tool: name, params }) + "\n");
    return { dispatched: true };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error("ClaudeCodeAdapter does not support embeddings");
  }

  async disconnect(): Promise<void> {
    this.process?.stdin?.end(); this.process?.kill(); this.process = null; this.connected = false;
  }
}
