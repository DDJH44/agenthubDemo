export interface ToolContext { input: unknown; memory?: Record<string, unknown>; workspaceId?: string; jobId?: string; }
export interface ToolResult { success: boolean; data: unknown; error?: string; }
export interface ITool { name: string; description: string; parameters?: Record<string, unknown>; run(ctx: ToolContext): Promise<ToolResult>; }
