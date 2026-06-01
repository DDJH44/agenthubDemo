// MCP 客户端封装

import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpClient {
  public readonly serverId: string;
  public readonly config: { name: string; protocol: string; command?: string; url?: string; env?: string };
  private connected = false;

  constructor(serverId: string, config: { name: string; protocol: string; command?: string; url?: string; env?: string }) {
    this.serverId = serverId;
    this.config = config;
  }

  async connect(): Promise<McpToolDescriptor[]> {
    const { protocol } = this.config;
    logger.info(`MCP connecting to ${this.config.name} (${protocol})`, 'MCP');

    if (protocol === "sse") {
      return this.connectSSE();
    } else if (protocol === "stdio") {
      return this.connectStdio();
    } else if (protocol === "websocket") {
      return this.connectWebSocket();
    }
    throw new Error(`Unsupported MCP protocol: ${protocol}`);
  }

  private async connectSSE(): Promise<McpToolDescriptor[]> {
    // SSE MCP 连接: HTTP GET → 事件流
    if (!this.config.url) throw new Error("URL required for SSE MCP server");
    try {
      const res = await fetch(this.config.url + "/tools", { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.connected = true;
      return (data.tools || data) as McpToolDescriptor[];
    } catch (err) {
      logger.warn(`MCP SSE connection failed for ${this.config.name}: ${err}`, 'MCP');
      return [];
    }
  }

  private async connectStdio(): Promise<McpToolDescriptor[]> {
    if (!this.config.command) throw new Error("Command required for stdio MCP server");
    // stdio MCP 通过子进程通信，需要 @modelcontextprotocol/sdk
    // 初期简化：返回空工具列表，标记连接成功
    this.connected = true;
    logger.info(`MCP stdio connected to ${this.config.name} (command: ${this.config.command})`, 'MCP');
    return [];
  }

  private async connectWebSocket(): Promise<McpToolDescriptor[]> {
    if (!this.config.url) throw new Error("URL required for WebSocket MCP server");
    // WebSocket MCP 连接
    try {
      const ws = new WebSocket(this.config.url);
      return new Promise((resolve) => {
        ws.onopen = () => { this.connected = true; resolve([]); };
        ws.onerror = () => { this.connected = false; resolve([]); };
        setTimeout(() => { if (!this.connected) resolve([]); }, 5000);
      });
    } catch {
      return [];
    }
  }

  wrapAsITool(mcpTool: McpToolDescriptor): ITool {
    const serverKey = this.config.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const toolName = `mcp_${serverKey}_${mcpTool.name}`;

    return {
      name: toolName,
      description: `[MCP:${this.config.name}] ${mcpTool.description}`,
      parameters: mcpTool.inputSchema,
      run: async (ctx: ToolContext): Promise<ToolResult> => {
        if (!this.connected) return { success: false, data: null, error: "MCP server not connected" };
        try {
          if (this.config.protocol === "sse" && this.config.url) {
            const res = await fetch(`${this.config.url}/tools/${mcpTool.name}/execute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(ctx.input),
              signal: AbortSignal.timeout(30000),
            });
            const data = await res.json();
            return { success: true, data };
          }
          return { success: false, data: null, error: `Protocol ${this.config.protocol} tool execution not implemented` };
        } catch (err) {
          return { success: false, data: null, error: err instanceof Error ? err.message : "MCP tool error" };
        }
      },
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info(`MCP disconnected: ${this.config.name}`, 'MCP');
  }

  isConnected(): boolean { return this.connected; }
}
