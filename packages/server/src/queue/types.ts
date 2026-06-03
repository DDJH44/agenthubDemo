import type { PlanNode, WorkflowReferencePayload } from "@agenthub/shared";

export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface JobPayload {
  workspaceId: string;
  conversationId?: string;
  userId: string;
  task: string;
  mentions: string[];
  plan?: PlanNode[];
  edges?: Array<{ source: string; target: string; label?: string }>;
  workflowRef?: WorkflowReferencePayload;
  priority?: JobPriority;
  timeoutMs?: number;          // max execution time before auto-cancel
  /** Callback to broadcast WS events to the conversation room */
  broadcast?: (data: Record<string, unknown>) => void;
}

export interface JobResult {
  jobId: string;
  status: "completed" | "failed";
  summary?: string;
  error?: string;
  steps: Array<{ id: string; task: string; result: string }>;
}

export interface IJobQueue {
  enqueue(payload: JobPayload): Promise<string>;
  cancel(jobId: string): void;
  onComplete(handler: (result: JobResult) => void): void;
  getStatus(jobId: string): Promise<"pending" | "running" | "completed" | "failed">;
  resume(): Promise<void>;
}
