import type { AgentRole } from "./agent";

export type JobStatus = "pending" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface Job {
  id: string; workspaceId: string; conversationId?: string; title: string;
  description: string; status: JobStatus; priority: JobPriority; tags: string[];
  createdAt: number; startedAt?: number; completedAt?: number; duration?: number;
  summary?: string; error?: string; plan?: PlanNode[]; stepResults?: StepResult[]; stats?: JobStats;
}

export type WorkflowNodeType = "agent" | "code" | "condition" | "loop" | "variable";

export interface PlanNode {
  id: string; task: string; dependsOn: string[]; agentRole?: AgentRole;
  type?: WorkflowNodeType; config?: Record<string, unknown>;
}

export interface WorkflowReferencePayload {
  id: string;
  name: string;
  task?: string;
  templateId?: string;
  templateTitle?: string;
  outputHint?: string;
  plan: PlanNode[];
  edges: Array<{ source: string; target: string; label?: string }>;
}

export interface CodeNodeConfig { language?: "python" | "javascript" | "bash"; timeout?: number; }
export interface ConditionNodeConfig { expression: string; }
export interface VariableNodeConfig { operation: "set" | "get" | "transform"; variableName: string; value?: string; }

export interface StepResult {
  id: string; task: string; result: string; toolUsed?: string | null;
  tokenCount?: number; duration?: number;
}

export interface JobStats {
  totalSteps: number; completedSteps: number; criticReviews: number;
  retries: number; totalTokens: number; totalDuration: number; toolCalls: number;
}

export interface Artifact {
  id: string; jobId: string;
  type: "markdown" | "code" | "json" | "html" | "preview_url" | "deploy_url" | "image" | "document" | "slides";
  content: string; filename?: string; metadata?: Record<string, unknown>; createdAt: number;
  version?: number;
  parentId?: string;
  createdBy?: string;
}
