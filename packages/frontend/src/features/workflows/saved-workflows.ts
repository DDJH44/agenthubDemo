"use client";

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
