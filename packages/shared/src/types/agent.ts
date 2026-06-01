export type AgentRole = "planner" | "worker" | "critic" | "researcher" | "refiner" | "coder" | "reviewer" | "frontend" | "backend" | "design" | "custom";
export type AgentStatus = "idle" | "thinking" | "acting" | "done" | "error" | "offline";

export interface AgentDefinition {
  id: string; name: string; role: AgentRole; description: string;
  capabilities: string[]; adapterType: string;
}

export interface AgentState {
  id: string; role: AgentRole; status: AgentStatus; output: string;
  toolCalls?: number; lastError?: string; logs: LogEntry[];
}

export interface LogEntry {
  timestamp: number; level: "info" | "warn" | "error"; message: string;
}
