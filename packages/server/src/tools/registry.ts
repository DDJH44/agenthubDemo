import type { ITool, ToolContext } from "@agenthub/shared";

export class ToolRegistry {
  private tools = new Map<string, ITool>();
  register(tool: ITool): void { this.tools.set(tool.name, tool); }
  unregister(name: string): boolean { return this.tools.delete(name); }
  get(name: string): ITool | undefined { return this.tools.get(name); }
  list(): string[] { return Array.from(this.tools.keys()); }

  async execute(name: string, ctx: ToolContext): Promise<{ success: boolean; data: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) return { success: false, data: null, error: `Tool not found: ${name}` };
    try { const result = await tool.run(ctx); return { success: result.success, data: result.data, error: result.error }; }
    catch (err) { return { success: false, data: null, error: err instanceof Error ? err.message : "Tool error" }; }
  }

  describe(): string {
    return Array.from(this.tools.entries()).map(([name, tool]) => `- ${name}: ${tool.description}`).join("\n");
  }
}

export const toolRegistry = new ToolRegistry();
