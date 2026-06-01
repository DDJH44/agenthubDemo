// MCP 连接管理器

import { McpClient } from "./client";
import type { ITool } from "@agenthub/shared";
import { toolRegistry } from "../tools/registry";
import { mcpRepo } from "../db/repositories/mcp";
import { logger } from "../utils/logger";

class McpManager {
  private clients = new Map<string, McpClient>();
  private toolOwners = new Map<string, string>(); // toolName → serverId

  async connectServer(id: string): Promise<{ toolNames: string[] }> {
    const config = await mcpRepo.getById(id);
    if (!config) throw new Error(`MCP server ${id} not found`);

    // 如果已连接，先断开
    if (this.clients.has(id)) {
      await this.disconnectServer(id);
    }

    const env: string | undefined = typeof config.env === "string" ? config.env : undefined;
    const client = new McpClient(id, {
      name: config.name,
      protocol: config.protocol,
      command: config.command ?? undefined,
      url: config.url ?? undefined,
      env,
    });

    const tools = await client.connect();
    this.clients.set(id, client);

    // 适配并注册工具
    const toolNames: string[] = [];
    for (const mcpTool of tools) {
      const itool: ITool = client.wrapAsITool(mcpTool);
      toolRegistry.register(itool);
      this.toolOwners.set(itool.name, id);
      toolNames.push(itool.name);
    }

    await mcpRepo.update(id, { status: "connected", lastSeen: new Date() });
    logger.info(`MCP server ${config.name} connected: ${toolNames.length} tools`, 'MCP');
    return { toolNames };
  }

  async disconnectServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      await client.disconnect();
      this.clients.delete(id);
    }

    // 注销所有该服务器的工具
    for (const [toolName, serverId] of this.toolOwners) {
      if (serverId === id) {
        toolRegistry.unregister(toolName);
        this.toolOwners.delete(toolName);
      }
    }

    await mcpRepo.update(id, { status: "disconnected" });
  }

  async removeServer(id: string): Promise<void> {
    if (this.clients.has(id)) {
      await this.disconnectServer(id);
    }
    await mcpRepo.delete(id);
  }

  getStatus(id: string): string {
    const client = this.clients.get(id);
    if (!client) return "disconnected";
    return client.isConnected() ? "connected" : "disconnected";
  }

  listServerTools(): Array<{ serverId: string; serverName: string; tools: string[] }> {
    const result: Array<{ serverId: string; serverName: string; tools: string[] }> = [];
    for (const [id, client] of this.clients) {
      if (client.isConnected()) {
        const tools: string[] = [];
        for (const [toolName, serverId] of this.toolOwners) {
          if (serverId === id) tools.push(toolName);
        }
        result.push({ serverId: id, serverName: client.config.name, tools });
      }
    }
    return result;
  }
}

export const mcpManager = new McpManager();

// 启动时恢复所有 previously-connected 的 MCP 服务器
export async function resumeMcpConnections(): Promise<void> {
  try {
    const { prisma } = await import("../db/index");
    const servers = await prisma.mcpServerConfig.findMany({ where: { status: "connected" } });
    for (const server of servers) {
      try {
        await mcpManager.connectServer(server.id);
        logger.info(`Resumed MCP: ${server.name}`, 'MCP');
      } catch (err) {
        logger.warn(`Failed to resume MCP ${server.name}: ${err}`, 'MCP');
      }
    }
  } catch { /* 数据库可能未就绪 */ }
}
