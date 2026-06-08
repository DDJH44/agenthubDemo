"use client";

import type { AgentRole, PlanNode, WorkflowNodeType, WorkflowReferencePayload } from "@agenthub/shared";

export interface SavedWorkflowNodeSnapshot {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown> & {
    agentId?: string;
    color?: string;
    label?: string;
    nodeType?: string;
    status?: string;
  };
}

export interface SavedWorkflowEdgeSnapshot {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
  style?: unknown;
}

export interface SavedWorkflowSnapshot {
  id: string;
  name: string;
  task: string;
  templateId?: string;
  templateTitle?: string;
  outputHint?: string;
  nodes: SavedWorkflowNodeSnapshot[];
  edges: SavedWorkflowEdgeSnapshot[];
  createdAt: number;
  updatedAt: number;
}

export const SAVED_WORKFLOWS_KEY = "agenthub-saved-workflows";
export const SAVED_WORKFLOWS_EVENT = "agenthub:saved-workflows-updated";
const MAX_SAVED_WORKFLOWS = 24;

function hasBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isSavedWorkflow(value: unknown): value is SavedWorkflowSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.task === "string"
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number"
    && Array.isArray(value.nodes)
    && Array.isArray(value.edges)
  );
}

function notifySavedWorkflowsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SAVED_WORKFLOWS_EVENT));
}

export function loadSavedWorkflows(): SavedWorkflowSnapshot[] {
  if (!hasBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SAVED_WORKFLOWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSavedWorkflow)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_WORKFLOWS);
  } catch {
    return [];
  }
}

export function persistSavedWorkflows(items: SavedWorkflowSnapshot[]) {
  if (!hasBrowserStorage()) return [];
  const next = items
    .filter(isSavedWorkflow)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_WORKFLOWS);
  window.localStorage.setItem(SAVED_WORKFLOWS_KEY, JSON.stringify(next));
  notifySavedWorkflowsChanged();
  return next;
}

export function upsertSavedWorkflow(item: SavedWorkflowSnapshot) {
  const existing = loadSavedWorkflows();
  return persistSavedWorkflows([item, ...existing.filter((workflow) => workflow.id !== item.id)]);
}

export function removeSavedWorkflow(id: string) {
  return persistSavedWorkflows(loadSavedWorkflows().filter((workflow) => workflow.id !== id));
}

export function getWorkflowNodeLabels(workflow: SavedWorkflowSnapshot, limit = 5) {
  return workflow.nodes
    .map((node) => {
      const label = node.data.label ?? node.data.agentId ?? node.data.nodeType ?? node.id;
      return typeof label === "string" ? label : node.id;
    })
    .filter(Boolean)
    .slice(0, limit);
}

export function getWorkflowReferencePrompt(workflow: SavedWorkflowSnapshot) {
  const labels = getWorkflowNodeLabels(workflow, 8);
  const lines = [
    `引用工作流「${workflow.name}」`,
    workflow.templateTitle ? `来源模板：${workflow.templateTitle}` : "",
    workflow.task ? `默认输入：${workflow.task}` : "",
    labels.length ? `执行链路：${labels.join(" -> ")}` : "",
    workflow.outputHint ? `预期输出：${workflow.outputHint}` : "",
    "请按这个工作流处理当前任务：",
  ].filter(Boolean);

  return lines.join("\n");
}

const AGENT_ROLE_ALIASES: Record<string, AgentRole> = {
  planner: "planner",
  pmo: "planner",
  worker: "worker",
  codex: "worker",
  coder: "worker",
  critic: "critic",
  reviewer: "critic",
  "ux-reviewer": "critic",
  researcher: "researcher",
  refiner: "refiner",
};

const WORKFLOW_NODE_TYPES = new Set<WorkflowNodeType>(["agent", "code", "condition", "loop", "variable"]);

function getNodeLabel(node: SavedWorkflowNodeSnapshot) {
  const label = node.data.label ?? node.data.agentId ?? node.data.nodeType ?? node.id;
  return typeof label === "string" ? label : node.id;
}

function getAgentRole(node: SavedWorkflowNodeSnapshot): AgentRole {
  const agentId = typeof node.data.agentId === "string" ? node.data.agentId : "";
  const nodeType = typeof node.data.nodeType === "string" ? node.data.nodeType : "";
  return AGENT_ROLE_ALIASES[agentId] ?? AGENT_ROLE_ALIASES[nodeType] ?? (nodeType === "condition" || nodeType === "variable" ? "planner" : "worker");
}

function getWorkflowNodeType(node: SavedWorkflowNodeSnapshot): WorkflowNodeType {
  const nodeType = typeof node.data.nodeType === "string" ? node.data.nodeType : "agent";
  return WORKFLOW_NODE_TYPES.has(nodeType as WorkflowNodeType) ? nodeType as WorkflowNodeType : "agent";
}

function getNodeConfig(node: SavedWorkflowNodeSnapshot): Record<string, unknown> | undefined {
  const config = node.data.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  return config as Record<string, unknown>;
}

export function stripWorkflowReferencePrompt(text: string, workflow: SavedWorkflowSnapshot) {
  const prompt = getWorkflowReferencePrompt(workflow);
  const stripped = text.replace(prompt, "").trim();
  return stripped || workflow.task || text;
}

export function toWorkflowReferencePayload(workflow: SavedWorkflowSnapshot, userTask: string): WorkflowReferencePayload {
  const task = userTask.trim() || workflow.task || `执行工作流「${workflow.name}」`;
  const edges = workflow.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    label: edge.label,
  }));

  const plan: PlanNode[] = workflow.nodes.map((node) => {
    const label = getNodeLabel(node);
    const dependsOn = edges.filter((edge) => edge.target === node.id).map((edge) => edge.source);
    return {
      id: node.id,
      task: `${label}: ${task}`,
      dependsOn,
      agentRole: getAgentRole(node),
      type: getWorkflowNodeType(node),
      config: getNodeConfig(node),
    };
  });

  return {
    id: workflow.id,
    name: workflow.name,
    task,
    templateId: workflow.templateId,
    templateTitle: workflow.templateTitle,
    outputHint: workflow.outputHint,
    plan,
    edges,
  };
}
