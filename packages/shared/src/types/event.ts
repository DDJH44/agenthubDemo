export type AgentEventType =
  | "task:created" | "task:started" | "agent:started" | "agent:thinking"
  | "agent:stream" | "agent:completed" | "tool:called" | "tool:result"
  | "critic:review" | "critic:retry" | "dag:wave_start" | "dag:wave_end"
  | "refine:started" | "refine:completed" | "task:completed" | "task:failed" | "error";

export interface AgentEvent {
  id: string; timestamp: number; type: AgentEventType; jobId: string;
  agentId?: string; nodeId?: string; payload: Record<string, unknown>;
}
