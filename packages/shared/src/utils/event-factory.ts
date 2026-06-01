import { generateId } from "./id-generator";
import type { AgentEvent, AgentEventType } from "../types/event";
export function createEvent(type: AgentEventType, jobId: string, payload: Record<string, unknown> = {}, overrides: Partial<Pick<AgentEvent, "agentId" | "nodeId">> = {}): AgentEvent {
  return { id: generateId(), timestamp: Date.now(), type, jobId, ...overrides, payload };
}
