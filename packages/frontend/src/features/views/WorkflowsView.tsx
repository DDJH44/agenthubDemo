"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Artifact, Message } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";

type NodeStatus = "idle" | "running" | "done" | "failed";

interface AgentNodeData {
  agentId: string;
  label: string;
  color: string;
  status: NodeStatus;
  config?: { model?: string; tools?: string[] };
}

interface LogicNodeData {
  label: string;
  color: string;
  nodeType: "code" | "condition" | "variable";
  status: NodeStatus;
  config: Record<string, unknown>;
}

type WorkflowNodeData = (AgentNodeData | LogicNodeData) & Record<string, unknown>;
type WorkflowNode = Node<WorkflowNodeData>;

interface WorkflowTemplate {
  id: string;
  title: string;
  desc: string;
  task: string;
  output: string;
  agents: string[];
}

interface WorkflowOutput {
  status: "idle" | "running" | "done" | "failed";
  title: string;
  summary: string;
  steps: Array<{ id: string; task: string; result: string; toolUsed?: string | null }>;
  errors?: string[];
}

type WorkflowArtifactKind = "document" | "html" | "slides";

interface WorkflowArtifactDraft {
  type: Extract<Artifact["type"], "document" | "html" | "slides">;
  filename: string;
  language: string;
  content: string;
  label: string;
  panelTab: "preview" | "slides";
}

interface WorkflowRunHistoryItem {
  id: string;
  task: string;
  templateId?: string;
  templateTitle?: string;
  output: WorkflowOutput;
  nodes: WorkflowNode[];
  edges: Edge[];
  createdAt: number;
}

const WORKFLOW_HISTORY_KEY = "agenthub-workflow-run-history";
const MAX_WORKFLOW_HISTORY = 12;
const CHAT_MESSAGES_KEY = "agenthub-chat-messages";
const CHAT_CONVERSATIONS_KEY = "agenthub-conversations";

const API_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3002`
  : "http://localhost:3002";

const AGENT_TEMPLATES: AgentNodeData[] = [
  { agentId: "planner", label: "PMO 规划", color: "var(--accent)", status: "idle", config: { model: "default", tools: ["plan", "context"] } },
  { agentId: "worker", label: "Codex 执行", color: "#0f766e", status: "idle", config: { model: "default", tools: ["code", "file", "deploy"] } },
  { agentId: "critic", label: "质量审查", color: "#b45309", status: "idle", config: { model: "default", tools: ["review", "diff"] } },
  { agentId: "researcher", label: "资料调研", color: "#2563eb", status: "idle", config: { model: "default", tools: ["search", "web"] } },
  { agentId: "refiner", label: "体验润色", color: "#be123c", status: "idle", config: { model: "default", tools: ["polish", "ux"] } },
];

const LOGIC_TEMPLATES: LogicNodeData[] = [
  { nodeType: "code", label: "代码执行", color: "#0f766e", status: "idle", config: { language: "javascript" } },
  { nodeType: "condition", label: "条件判断", color: "#b45309", status: "idle", config: { expression: "review_passed" } },
  { nodeType: "variable", label: "变量记录", color: "#6d28d9", status: "idle", config: { operation: "set", variableName: "result", value: "" } },
];

const FLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "web-deploy",
    title: "网页生成并部署",
    desc: "PMO 拆解需求，Codex 生成代码，UX 审查后部署。",
    task: "生成一个可预览的小型网页，并准备部署到默认服务器。",
    output: "网页产物、审查摘要、部署建议",
    agents: ["planner", "worker", "critic", "refiner"],
  },
  {
    id: "doc-export",
    title: "文档生成与导出",
    desc: "把资料整理为结构化文档，支持后续 Word/PDF 导出。",
    task: "根据用户资料生成一份结构化项目文档，包含摘要、正文、表格和后续建议。",
    output: "结构化文档、章节摘要、导出建议",
    agents: ["planner", "researcher", "worker", "refiner"],
  },
  {
    id: "code-review",
    title: "代码审查修复",
    desc: "读取上下文，定位问题，生成修复建议和变更说明。",
    task: "审查当前代码变更，找出风险、修复建议和需要补充的测试。",
    output: "风险列表、修复建议、测试清单",
    agents: ["planner", "worker", "critic"],
  },
  {
    id: "asset-to-product",
    title: "图片理解转产物",
    desc: "理解上传图片或资料，转成页面、文档或 PPT 产物。",
    task: "理解用户上传的图片内容，提炼重点并生成可编辑产物。",
    output: "图片理解摘要、产物草稿、下一步建议",
    agents: ["researcher", "planner", "worker", "refiner"],
  },
];

function isLogicNode(data: WorkflowNodeData): data is LogicNodeData & Record<string, unknown> {
  return "nodeType" in data;
}

function getStatusColor(status: NodeStatus) {
  if (status === "running") return "var(--accent)";
  if (status === "done") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  return "var(--border-strong)";
}

function WorkflowHandle() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ width: 8, height: 8, border: "2px solid var(--surface-white)", background: "var(--accent)" }} />
      <Handle type="source" position={Position.Bottom} style={{ width: 8, height: 8, border: "2px solid var(--surface-white)", background: "var(--accent)" }} />
    </>
  );
}

function AgentNode({ data }: { data: WorkflowNodeData }) {
  const agent = data as AgentNodeData;
  const statusColor = getStatusColor(agent.status);

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        minWidth: 188,
        background: "var(--surface-white)",
        border: `1px solid ${agent.status === "idle" ? "var(--border)" : statusColor}`,
        boxShadow: agent.status === "running" ? "var(--accent-glow)" : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)", background: agent.color + "10" }}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: agent.color }}>
          {agent.agentId.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{agent.label}</p>
          <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{agent.config?.model ?? "default model"}</p>
        </div>
        <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
      </div>
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {(agent.config?.tools ?? []).map((tool) => (
          <span key={tool} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
            {tool}
          </span>
        ))}
      </div>
      <WorkflowHandle />
    </div>
  );
}

function LogicNode({ data }: { data: WorkflowNodeData }) {
  const logic = data as LogicNodeData;
  const statusColor = getStatusColor(logic.status);
  const detail = logic.nodeType === "code"
    ? `language: ${String(logic.config.language ?? "javascript")}`
    : logic.nodeType === "condition"
      ? String(logic.config.expression || "条件表达式")
      : `${String(logic.config.variableName || "变量")} = ${String(logic.config.value || "...")}`;

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        minWidth: 188,
        background: "var(--surface-white)",
        border: `1px solid ${logic.status === "idle" ? "var(--border)" : statusColor}`,
        boxShadow: logic.status === "running" ? "var(--accent-glow)" : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)", background: logic.color + "10" }}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: logic.color }}>
          {logic.nodeType.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{logic.label}</p>
          <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{detail}</p>
        </div>
        <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
      </div>
      <div className="px-3 py-2 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
        {logic.nodeType === "condition" ? "根据上一步结果选择分支" : "可作为流程中的工具节点"}
      </div>
      <WorkflowHandle />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
  codeNode: LogicNode,
  conditionNode: LogicNode,
  variableNode: LogicNode,
};

function makeTemplateNodes(agentIds: string[]) {
  const nodes: WorkflowNode[] = agentIds.map((agentId, index) => {
    const template = AGENT_TEMPLATES.find((item) => item.agentId === agentId) ?? AGENT_TEMPLATES[0];
    return {
      id: `${agentId}-${index + 1}`,
      type: "agentNode",
      position: { x: 120 + index * 240, y: 120 },
      data: { ...template, agentId, status: "idle" },
    };
  });

  const edges: Edge[] = nodes.slice(1).map((node, index) => ({
    id: `edge-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    animated: true,
    style: { stroke: "var(--accent)", strokeWidth: 2 },
  }));

  return { nodes, edges };
}

function LogItem({ item }: { item: string }) {
  const tone = item.includes("失败") || item.includes("异常") ? "danger" : item.includes("完成") || item.includes("已") ? "success" : "accent";
  const color = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className="flex gap-2 rounded-md px-2.5 py-2 text-xs" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="line-clamp-2" style={{ color: "var(--fg-secondary)" }}>{item}</span>
    </div>
  );
}

function serializeWorkflowOutput(output: WorkflowOutput) {
  const steps = output.steps.map((step) => {
    const tool = step.toolUsed ? `\n工具：${step.toolUsed}` : "";
    return `### ${step.id}. ${step.task}${tool}\n${step.result}`;
  }).join("\n\n");

  return [
    `# ${output.title}`,
    `状态：${output.status}`,
    "## 摘要",
    output.summary,
    steps ? "## 步骤结果" : "",
    steps,
    output.errors?.length ? `## 错误\n${output.errors.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function createRunId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `workflow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function sanitizeNodesForHistory(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { ...node.data },
  }));
}

function sanitizeEdgesForHistory(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.animated,
    label: edge.label,
    style: edge.style,
  }));
}

function loadWorkflowHistory(): WorkflowRunHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WORKFLOW_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is WorkflowRunHistoryItem => Boolean(
        item
        && typeof item.id === "string"
        && typeof item.task === "string"
        && typeof item.createdAt === "number"
        && item.output
        && Array.isArray(item.nodes)
        && Array.isArray(item.edges),
      ))
      .slice(0, MAX_WORKFLOW_HISTORY);
  } catch {
    return [];
  }
}

function saveWorkflowHistory(items: WorkflowRunHistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKFLOW_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_WORKFLOW_HISTORY)));
}

function persistWorkflowArtifactFallback(conversationId: string, message: Message) {
  if (typeof window === "undefined") return;
  try {
    const storedMessages = JSON.parse(window.localStorage.getItem(CHAT_MESSAGES_KEY) || "{}") as Record<string, Message[]>;
    const existingMessages = storedMessages[conversationId] ?? [];
    storedMessages[conversationId] = existingMessages.some((item) => item.id === message.id)
      ? existingMessages
      : [...existingMessages, message].slice(-200);
    window.localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(storedMessages));
  } catch {
    // The in-memory event path still carries the artifact card.
  }

  try {
    const conversations = JSON.parse(window.localStorage.getItem(CHAT_CONVERSATIONS_KEY) || "[]") as Array<Record<string, unknown>>;
    const nextConversations = conversations.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            lastMessage: message.content.slice(0, 80),
            lastMessageAt: message.timestamp,
            updatedAt: message.timestamp,
          }
        : conversation
    ));
    window.localStorage.setItem(CHAT_CONVERSATIONS_KEY, JSON.stringify(nextConversations));
  } catch {
    // Ignore storage failures; the page-level store handler also attempts this.
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function artifactBaseName(output: WorkflowOutput) {
  const base = output.title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return base || "workflow-output";
}

function buildWorkflowHtmlArtifact(output: WorkflowOutput) {
  const steps = output.steps.length > 0
    ? output.steps.map((step, index) => `
      <article class="step">
        <div class="step-index">${index + 1}</div>
        <div>
          <h2>${escapeHtml(step.task)}</h2>
          ${step.toolUsed ? `<p class="tool">工具：${escapeHtml(step.toolUsed)}</p>` : ""}
          <p>${escapeHtml(step.result)}</p>
        </div>
      </article>
    `).join("")
    : `<p class="empty">本次工作流没有返回步骤明细。</p>`;
  const errors = output.errors?.length
    ? `<section class="notice"><strong>异常信息</strong><p>${escapeHtml(output.errors.join("；"))}</p></section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(output.title)} · AgentHub Workflow</title>
  <style>
    :root {
      color-scheme: light;
      --accent: #4f46e5;
      --ink: #172033;
      --muted: #667085;
      --line: #dde4f2;
      --surface: #ffffff;
      --soft: #f5f7fc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      background: linear-gradient(180deg, #f4f6ff 0%, #ffffff 58%, #f7f9fe 100%);
      color: var(--ink);
    }
    main {
      width: min(980px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 48px 0;
    }
    .hero {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.86);
      border-radius: 18px;
      padding: 32px;
      box-shadow: 0 22px 60px rgba(69, 82, 126, 0.14);
    }
    .kicker {
      margin: 0 0 12px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 52px);
      line-height: 1.08;
    }
    .summary {
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 24px;
    }
    .pill {
      border: 1px solid var(--line);
      background: var(--soft);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .section-title {
      margin: 32px 0 12px;
      font-size: 18px;
    }
    .steps {
      display: grid;
      gap: 12px;
    }
    .step {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 14px;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 14px;
      padding: 18px;
    }
    .step-index {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 10px;
      color: #fff;
      background: var(--accent);
      font-weight: 800;
    }
    .step h2 {
      margin: 0;
      font-size: 15px;
    }
    .step p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .tool {
      color: var(--accent) !important;
      font-size: 12px;
      font-weight: 700;
    }
    .notice {
      margin-top: 18px;
      border: 1px solid #fecaca;
      background: #fff5f5;
      border-radius: 14px;
      padding: 16px;
      color: #b42318;
    }
    .empty {
      color: var(--muted);
      background: var(--surface);
      border: 1px dashed var(--line);
      border-radius: 14px;
      padding: 18px;
    }
    footer {
      margin-top: 28px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="kicker">AgentHub Workflow Output</p>
      <h1>${escapeHtml(output.title)}</h1>
      <p class="summary">${escapeHtml(output.summary)}</p>
      <div class="meta">
        <span class="pill">状态：${output.status === "done" ? "已完成" : output.status === "failed" ? "失败" : output.status}</span>
        <span class="pill">步骤：${output.steps.length}</span>
        <span class="pill">生成时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</span>
      </div>
      ${errors}
    </section>

    <h2 class="section-title">步骤产出</h2>
    <section class="steps">${steps}</section>
    <footer>Generated by AgentHub Workflow Studio</footer>
  </main>
</body>
</html>`;
}

function buildWorkflowSlidesArtifact(output: WorkflowOutput) {
  const stepSlides = output.steps.slice(0, 5).map((step, index) => [
    `## ${index + 1}. ${step.task}`,
    step.toolUsed ? `- 使用工具：${step.toolUsed}` : "",
    `- ${step.result.replace(/\n+/g, "\n- ").slice(0, 680)}`,
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");

  return [
    `# ${output.title}`,
    "AgentHub Workflow Studio",
    "",
    "---",
    "",
    "## 执行摘要",
    output.summary,
    "",
    "---",
    "",
    "## 关键步骤",
    output.steps.length > 0 ? output.steps.slice(0, 6).map((step) => `- ${step.task}`).join("\n") : "- 暂无步骤明细",
    "",
    stepSlides ? ["---", "", stepSlides].join("\n") : "",
    output.errors?.length ? ["---", "", "## 异常与风险", output.errors.map((error) => `- ${error}`).join("\n")].join("\n") : "",
    "",
    "---",
    "",
    "## 下一步",
    "- 在会话中引用关键段落继续追问",
    "- 对网页或代码产物进行预览、编辑和部署",
    "- 将最终结果纳入版本历史与答辩演示",
  ].filter(Boolean).join("\n");
}

function createWorkflowArtifactDraft(kind: WorkflowArtifactKind, output: WorkflowOutput): WorkflowArtifactDraft {
  const baseName = artifactBaseName(output);
  if (kind === "html") {
    return {
      type: "html",
      filename: `${baseName}.html`,
      language: "html",
      label: "网页产物",
      panelTab: "preview",
      content: buildWorkflowHtmlArtifact(output),
    };
  }
  if (kind === "slides") {
    return {
      type: "slides",
      filename: `${baseName}.pptx`,
      language: "md",
      label: "PPTX 产物",
      panelTab: "slides",
      content: buildWorkflowSlidesArtifact(output),
    };
  }
  return {
    type: "document",
    filename: `${baseName}.md`,
    language: "md",
    label: "文档产物",
    panelTab: "preview",
    content: serializeWorkflowOutput(output),
  };
}

function OutputPanel({
  output,
  actionStatus,
  onCopy,
  onSendToChat,
  onAskFollowUp,
  onCreateArtifact,
}: {
  output: WorkflowOutput | null;
  actionStatus: string;
  onCopy: () => void;
  onSendToChat: () => void;
  onAskFollowUp: () => void;
  onCreateArtifact: (kind: WorkflowArtifactKind) => void;
}) {
  if (!output) {
    return (
      <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>输出结果</h3>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>等待运行</span>
        </div>
        <p className="mt-2 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
          运行工作流后，这里会展示最终总结、每个节点的产出，以及可继续交给会话处理的结果。
        </p>
      </div>
    );
  }

  const isDone = output.status === "done";
  const isFailed = output.status === "failed";
  const badgeColor = isDone ? "var(--success)" : isFailed ? "var(--danger)" : "var(--accent)";
  const badgeBg = isDone ? "var(--success-subtle)" : isFailed ? "var(--danger-subtle)" : "var(--accent-subtle)";

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: `1px solid ${isFailed ? "rgba(186,26,26,.22)" : "var(--border)"}` }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>输出结果</h3>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: badgeBg, color: badgeColor }}>
          {isDone ? "已生成" : isFailed ? "失败" : "生成中"}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{output.title}</p>
      <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 custom-scrollbar" style={{ color: "var(--fg-secondary)" }}>
        {output.summary}
      </p>

      {output.steps.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {output.steps.slice(0, 4).map((step) => (
            <div key={step.id} className="rounded-md px-2.5 py-2" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  {step.id}
                </span>
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>{step.task}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: "var(--fg-tertiary)" }}>{step.result}</p>
            </div>
          ))}
          {output.steps.length > 4 && (
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>还有 {output.steps.length - 4} 个步骤结果已收起。</p>
          )}
        </div>
      )}

      {output.errors?.length ? (
        <div className="mt-3 rounded-md px-2.5 py-2 text-[11px]" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
          {output.errors.join("；")}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onCopy}
          disabled={output.status === "running"}
          className="h-8 rounded-md text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)", background: "var(--surface-white)" }}
        >
          复制
        </button>
        <button
          type="button"
          onClick={onSendToChat}
          disabled={output.status === "running"}
          className="h-8 rounded-md text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ border: "1px solid var(--accent-border)", color: "var(--accent)", background: "var(--accent-subtle)" }}
        >
          发到会话
        </button>
        <button
          type="button"
          onClick={onAskFollowUp}
          disabled={output.status === "running"}
          className="h-8 rounded-md text-[11px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          继续追问
        </button>
      </div>

      <div className="mt-2 rounded-md p-2" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>转为会话产物</span>
          <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>Artifact</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["document", "文档"],
            ["html", "网页"],
            ["slides", "PPTX"],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => onCreateArtifact(kind)}
              disabled={output.status === "running"}
              className="h-7 rounded-md text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)", background: "var(--surface-white)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionStatus && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{actionStatus}</p>
      )}
    </div>
  );
}

function WorkflowHistoryPanel({
  history,
  onRestore,
  onClear,
}: {
  history: WorkflowRunHistoryItem[];
  onRestore: (item: WorkflowRunHistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>运行历史</h3>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-semibold transition hover:text-[var(--danger)]"
            style={{ color: "var(--fg-tertiary)" }}
          >
            清空
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="mt-2 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
          暂无运行记录。工作流完成后会自动保存最近 {MAX_WORKFLOW_HISTORY} 次输入、画布和输出。
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {history.slice(0, 5).map((item) => {
            const isFailed = item.output.status === "failed";
            return (
              <div key={item.id} className="rounded-md p-2.5" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                    {item.templateTitle ?? "自定义工作流"}
                  </p>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: isFailed ? "var(--danger-subtle)" : "var(--success-subtle)",
                      color: isFailed ? "var(--danger)" : "var(--success)",
                    }}
                  >
                    {isFailed ? "失败" : "完成"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: "var(--fg-tertiary)" }}>{item.task}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{formatHistoryTime(item.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => onRestore(item)}
                    className="h-7 rounded-md px-2.5 text-[11px] font-semibold transition hover:bg-[var(--accent-subtle)]"
                    style={{ border: "1px solid var(--accent-border)", color: "var(--accent)", background: "var(--surface-white)" }}
                  >
                    恢复
                  </button>
                </div>
              </div>
            );
          })}
          {history.length > 5 && (
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              还有 {history.length - 5} 条较早记录已收起。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowsView() {
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [mode, setMode] = useState<"edit" | "run">("edit");
  const [task, setTask] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [workflowOutput, setWorkflowOutput] = useState<WorkflowOutput | null>(null);
  const [outputActionStatus, setOutputActionStatus] = useState("");
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowRunHistoryItem[]>([]);
  const [runLog, setRunLog] = useState<string[]>(["选择模板或拖拽节点，形成一个可复用的多 Agent 流程。"]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    setWorkflowHistory(loadWorkflowHistory());
  }, []);

  const addWorkflowHistory = useCallback((output: WorkflowOutput) => {
    const item: WorkflowRunHistoryItem = {
      id: createRunId(),
      task: task.trim(),
      templateId: selectedTemplate?.id,
      templateTitle: selectedTemplate?.title,
      output,
      nodes: sanitizeNodesForHistory(nodes),
      edges: sanitizeEdgesForHistory(edges),
      createdAt: Date.now(),
    };

    setWorkflowHistory((items) => {
      const next = [item, ...items].slice(0, MAX_WORKFLOW_HISTORY);
      saveWorkflowHistory(next);
      return next;
    });
  }, [edges, nodes, selectedTemplate, task]);

  const restoreWorkflowHistory = useCallback((item: WorkflowRunHistoryItem) => {
    const template = FLOW_TEMPLATES.find((flow) => flow.id === item.templateId) ?? null;
    setNodes(item.nodes);
    setEdges(item.edges);
    setTask(item.task);
    setSelectedTemplate(template);
    setSelectedNode(null);
    setMode("edit");
    setWorkflowOutput(item.output);
    setOutputActionStatus("已恢复历史运行，可继续发到会话或追问。");
    setRunLog([
      `已恢复历史：${item.templateTitle ?? "自定义工作流"}`,
      `运行时间：${formatHistoryTime(item.createdAt)}`,
      item.output.summary,
    ].filter(Boolean).slice(0, 8));
  }, [setEdges, setNodes]);

  const clearWorkflowHistory = useCallback(() => {
    setWorkflowHistory([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WORKFLOW_HISTORY_KEY);
    }
    setOutputActionStatus("运行历史已清空。");
  }, []);

  const navigateToChat = useCallback(() => {
    setActiveNav("chat");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("agenthub-active-nav", "chat");
      window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key: "chat" } }));
    }
  }, [setActiveNav]);

  const onConnect = useCallback((conn: Connection) => {
    const sourceNode = nodes.find((node) => node.id === conn.source);
    const sourceData = sourceNode?.data;
    const isCondition = sourceData && isLogicNode(sourceData) && sourceData.nodeType === "condition";
    setEdges((currentEdges) => addEdge({
      ...conn,
      animated: true,
      label: isCondition ? "true" : undefined,
      style: { stroke: "var(--accent)", strokeWidth: 2 },
    }, currentEdges));
  }, [nodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/reactflow");
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    if (!rect) return;

    const logic = LOGIC_TEMPLATES.find((item) => item.nodeType === id);
    if (logic) {
      const nodeId = `${id}-${++nextId.current}`;
      const typeMap: Record<string, string> = { code: "codeNode", condition: "conditionNode", variable: "variableNode" };
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id: nodeId,
          type: typeMap[id] ?? "codeNode",
          position: { x: event.clientX - rect.left - 94, y: event.clientY - rect.top - 40 },
          data: { ...logic, status: "idle", config: { ...logic.config } },
        },
      ]);
      return;
    }

    const agent = AGENT_TEMPLATES.find((item) => item.agentId === id);
    if (!agent) return;
    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: `${id}-${++nextId.current}`,
        type: "agentNode",
        position: { x: event.clientX - rect.left - 94, y: event.clientY - rect.top - 40 },
        data: { ...agent, status: "idle" },
      },
    ]);
  }, [setNodes]);

  const resetStatuses = useCallback(() => {
    setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "idle" as NodeStatus } })));
  }, [setNodes]);

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setMode("edit");
    setSelectedTemplate(null);
    setWorkflowOutput(null);
    setOutputActionStatus("");
    setRunLog(["画布已清空，可以重新选择模板或拖拽节点。"]);
  }, [setEdges, setNodes]);

  const applyTemplate = useCallback((template: WorkflowTemplate) => {
    const graph = makeTemplateNodes(template.agents);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(null);
    setMode("edit");
    setSelectedTemplate(template);
    setWorkflowOutput(null);
    setOutputActionStatus("");
    setTask(template.task);
    setRunLog([`已载入模板：${template.title}`, `预期输出：${template.output}`, template.desc]);
  }, [setEdges, setNodes]);

  const onDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("application/reactflow", id);
    event.dataTransfer.effectAllowed = "move";
  };

  const runWorkflow = async () => {
    if (nodes.length === 0) {
      setRunLog((items) => ["请先选择模板或添加至少一个节点。", ...items]);
      return;
    }
    if (!task.trim()) {
      setRunLog((items) => ["请先填写输入任务，工作流需要明确的输入才能执行。", ...items]);
      setWorkflowOutput({
        status: "failed",
        title: "缺少输入",
        summary: "请在左侧“输入任务”中描述你希望这个工作流处理什么内容，然后再运行。",
        steps: [],
        errors: ["缺少输入任务"],
      });
      return;
    }

    setMode("run");
    setRunLog(["开始执行工作流，正在提交给后端编排器。"]);
    setOutputActionStatus("");
    setWorkflowOutput({
      status: "running",
      title: selectedTemplate ? selectedTemplate.title : "自定义工作流",
      summary: "工作流正在执行，输出会在后端返回 final 事件后汇总到这里。",
      steps: [],
    });
    resetStatuses();

    const dag = nodes.map((node) => {
      const data = node.data;
      const nodeType = isLogicNode(data) ? data.nodeType : "agent";
      const agentRole = "agentId" in data ? data.agentId : "worker";
      return {
        id: node.id,
        task: `${data.label}: ${task.trim()}`,
        dependsOn: edges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
        type: nodeType,
        config: "config" in data ? data.config : undefined,
        agentRole,
      };
    });
    const edgeData = edges.map((edge) => ({ source: edge.source, target: edge.target, label: edge.label as string | undefined }));

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("agenthub-auth-token") : null;
      const response = await fetch(`${API_BASE}/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task: task.trim(), plan: dag, edges: edgeData }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("后端没有返回可读取的执行流");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type?: string; msg?: unknown; result?: unknown };
            if (event.type === "stream" && typeof event.msg === "string") {
              const stepId = event.msg.match(/^\[(.*?)\]/)?.[1];
              if (stepId) {
                setNodes((currentNodes) => currentNodes.map((node) => node.id === stepId ? { ...node, data: { ...node.data, status: "running" } } : node));
              }
              const clean = event.msg.replace(/\s+/g, " ").trim();
              if (clean) setRunLog((items) => [clean.slice(0, 140), ...items].slice(0, 8));
            }
            if (event.type === "final" && event.msg && typeof event.msg === "object") {
              const final = event.msg as {
                summary?: string;
                stepResults?: Array<{ id: string; task: string; result: string; toolUsed?: string | null }>;
                errors?: string[];
              };
              const completedIds = new Set((final.stepResults ?? []).map((item) => item.id));
              const output: WorkflowOutput = {
                status: "done",
                title: selectedTemplate ? selectedTemplate.title : "工作流输出",
                summary: final.summary || "工作流已完成，但后端没有返回摘要。",
                steps: final.stepResults ?? [],
                errors: final.errors,
              };
              setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, data: { ...node.data, status: completedIds.has(node.id) ? "done" : "idle" } })));
              setWorkflowOutput(output);
              addWorkflowHistory(output);
              setRunLog((items) => ["工作流执行完成，结果已返回到当前流程。", ...items].slice(0, 8));
            }
          } catch {
            // Ignore malformed event chunks and keep the stream alive.
          }
        }
      }
    } catch (error) {
      const output: WorkflowOutput = {
        status: "failed",
        title: selectedTemplate ? selectedTemplate.title : "工作流执行失败",
        summary: error instanceof Error ? error.message : "未知错误",
        steps: [],
        errors: [error instanceof Error ? error.message : "未知错误"],
      };
      setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "failed" } })));
      setWorkflowOutput(output);
      addWorkflowHistory(output);
      setRunLog((items) => [`执行失败：${error instanceof Error ? error.message : "未知错误"}`, ...items].slice(0, 8));
    }
  };

  const copyWorkflowOutput = async () => {
    if (!workflowOutput || workflowOutput.status === "running") return;
    try {
      await navigator.clipboard.writeText(serializeWorkflowOutput(workflowOutput));
      setOutputActionStatus("结果已复制到剪贴板。");
    } catch {
      setOutputActionStatus("复制失败，请手动选择文本复制。");
    }
  };

  const sendWorkflowOutputToChat = (intent: "handoff" | "follow-up") => {
    if (!workflowOutput || workflowOutput.status === "running") return;
    const serialized = serializeWorkflowOutput(workflowOutput);
    const text = intent === "follow-up"
      ? `请基于以下工作流输出继续推进，补充下一步可执行方案：\n\n${serialized}`
      : `请接收并继续处理以下工作流输出：\n\n${serialized}`;
    const chatStore = useChatStore.getState();
    if (!chatStore.activeConversationId) {
      chatStore.setPendingMessage(text);
    }
    window.dispatchEvent(new CustomEvent("dashboard:send", { detail: { text } }));
    navigateToChat();
    setOutputActionStatus(intent === "follow-up" ? "已发送到会话继续追问。" : "已发送到会话。");
  };

  const createWorkflowArtifact = useCallback((kind: WorkflowArtifactKind) => {
    if (!workflowOutput || workflowOutput.status === "running") return;
    const chatStore = useChatStore.getState();
    const conversationId = chatStore.activeConversationId;
    if (!conversationId) {
      navigateToChat();
      setOutputActionStatus("请先选择或创建一个会话，再把工作流输出转为产物卡片。");
      return;
    }

    const draft = createWorkflowArtifactDraft(kind, workflowOutput);
    const now = Date.now();
    const artifactId = `workflow-${kind}-${now}`;
    const artifact: Artifact = {
      id: artifactId,
      jobId: `workflow-${selectedTemplate?.id ?? "custom"}-${now}`,
      type: draft.type,
      content: draft.content,
      filename: draft.filename,
      metadata: {
        source: "workflow-studio",
        templateId: selectedTemplate?.id,
        templateTitle: selectedTemplate?.title,
        outputStatus: workflowOutput.status,
        changeSummary: `由工作流输出生成${draft.label}`,
      },
      version: 1,
      createdAt: now,
      createdBy: "Workflow Studio",
    };

    const message: Message = {
      id: crypto.randomUUID(),
      conversationId,
      type: "agent_message",
      sender: kind === "html" ? "coder" : "planner",
      senderId: kind === "html" ? "codex" : "pmo",
      content: draft.content,
      mentions: [],
      payload: {
        artifactType: draft.type,
        artifactId,
        filename: draft.filename,
        language: draft.language,
        source: "workflow-studio",
        workflowTemplateId: selectedTemplate?.id,
      },
      timestamp: now,
    };
    navigateToChat();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("workflow:artifact:create", {
        detail: {
          conversationId,
          artifact,
          message,
          panelTab: draft.panelTab,
        },
      }));
    }, 0);
    window.setTimeout(() => {
      navigateToChat();
      persistWorkflowArtifactFallback(conversationId, message);
    }, 120);
    setOutputActionStatus(`${draft.label}已生成到当前会话。`);
  }, [navigateToChat, selectedTemplate, workflowOutput]);

  const selectedData = selectedNode?.data;

  return (
    <div className="flex h-full min-h-0" style={{ background: "var(--surface-white)" }}>
      <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto p-4" style={{ borderRight: "1px solid var(--border)", background: "var(--page-bg)" }}>
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-normal" style={{ color: "var(--accent)" }}>Workflow Studio</p>
          <h2 className="mt-1 text-lg font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>工作流</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
            把常见多 Agent 协作沉淀为可复用流程，适合演示任务拆解、并行调度和失败降级。
          </p>
        </div>

        <section className="mb-4 rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--accent-border)", boxShadow: "var(--shadow-xs)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>输入任务</h3>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              Input
            </span>
          </div>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="例如：生成一个小型烟花网站，包含 Canvas 动画、响应式布局和部署说明..."
            className="min-h-[112px] w-full resize-none rounded-lg px-3 py-2 text-xs leading-5 outline-none transition focus:border-[var(--accent-border)]"
            style={{ border: "1px solid var(--border)", background: "var(--page-bg)", color: "var(--fg-primary)" }}
          />
          <div className="mt-2 rounded-md px-2.5 py-2" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>预期输出</p>
            <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--fg-secondary)" }}>
              {selectedTemplate?.output ?? "选择模板后会显示该流程的默认输出类型。"}
            </p>
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>推荐模板</h3>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {FLOW_TEMPLATES.length}
            </span>
          </div>
          <div className="space-y-2">
            {FLOW_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className="w-full rounded-lg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent-border)] hover:bg-[var(--surface-white)]"
                style={{ border: "1px solid var(--border)", background: "var(--surface-white)", boxShadow: "var(--shadow-xs)" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{template.title}</p>
                <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--fg-tertiary)" }}>{template.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>Agent 节点</h3>
          <div className="space-y-2">
            {AGENT_TEMPLATES.map((agent) => (
              <div
                key={agent.agentId}
                draggable
                onDragStart={(event) => onDragStart(event, agent.agentId)}
                className="cursor-grab rounded-lg p-2.5 transition-all active:cursor-grabbing hover:bg-[var(--surface-white)]"
                style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: agent.color }}>
                    {agent.agentId.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{agent.label}</p>
                    <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{agent.config?.tools?.join(", ")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>逻辑节点</h3>
          <div className="grid grid-cols-1 gap-2">
            {LOGIC_TEMPLATES.map((logic) => (
              <div
                key={logic.nodeType}
                draggable
                onDragStart={(event) => onDragStart(event, logic.nodeType)}
                className="cursor-grab rounded-lg p-2.5 transition-all active:cursor-grabbing hover:bg-[var(--surface-white)]"
                style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: logic.color }}>
                    {logic.nodeType.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{logic.label}</p>
                    <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{logic.nodeType}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-5" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-white)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>多 Agent 流程画布</h2>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: mode === "run" ? "var(--success-subtle)" : "var(--accent-subtle)", color: mode === "run" ? "var(--success)" : "var(--accent)" }}>
                {mode === "run" ? "执行中" : "编辑中"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>节点 {nodes.length} · 连线 {edges.length} · 可拖拽节点、连接依赖并运行</p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden rounded-lg px-2.5 py-1.5 text-[11px] font-semibold md:inline-flex" style={{ background: task.trim() ? "var(--success-subtle)" : "var(--surface-low)", color: task.trim() ? "var(--success)" : "var(--fg-tertiary)" }}>
              {task.trim() ? "输入已就绪" : "等待输入"}
            </span>
            <button
              type="button"
              onClick={runWorkflow}
              disabled={nodes.length === 0}
              className="h-8 rounded-lg px-3 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              运行
            </button>
            <button
              type="button"
              onClick={clearCanvas}
              className="h-8 rounded-lg px-3 text-xs font-semibold transition hover:bg-[var(--surface-low)]"
              style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
            >
              清空
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div ref={reactFlowWrapper} className="min-w-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={mode === "edit" ? onNodesChange : undefined}
              onEdgesChange={mode === "edit" ? onEdgesChange : undefined}
              onConnect={mode === "edit" ? onConnect : undefined}
              onNodeClick={(_event, node) => setSelectedNode(node as WorkflowNode)}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={mode === "edit" ? ["Backspace", "Delete"] : []}
              style={{ background: "var(--page-bg)" }}
            >
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
              <MiniMap
                nodeColor={(node) => (node.data as WorkflowNodeData).color ?? "var(--accent)"}
                style={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
              <Panel position="bottom-right">
                <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", color: "var(--fg-tertiary)" }}>
                  拖拽节点到画布，连线表示依赖关系
                </div>
              </Panel>
            </ReactFlow>
          </div>

          <aside className="w-[340px] shrink-0 overflow-y-auto p-4" style={{ borderLeft: "1px solid var(--border)", background: "var(--page-bg)" }}>
            <section className="mb-4">
              <OutputPanel
                output={workflowOutput}
                actionStatus={outputActionStatus}
                onCopy={copyWorkflowOutput}
                onSendToChat={() => sendWorkflowOutputToChat("handoff")}
                onAskFollowUp={() => sendWorkflowOutputToChat("follow-up")}
                onCreateArtifact={createWorkflowArtifact}
              />
            </section>

            <section className="mb-4">
              <WorkflowHistoryPanel
                history={workflowHistory}
                onRestore={restoreWorkflowHistory}
                onClear={clearWorkflowHistory}
              />
            </section>

            <section className="mb-4">
              <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>执行日志</h3>
              <div className="mt-2 space-y-2">
                {runLog.map((item, index) => <LogItem key={`${item}-${index}`} item={item} />)}
              </div>
            </section>

            <section className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>节点属性</h3>
                {selectedNode && (
                  <button type="button" onClick={() => setSelectedNode(null)} className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                    关闭
                  </button>
                )}
              </div>
              {selectedNode && selectedData ? (
                <div className="space-y-3">
                  <Field label="名称" value={String(selectedData.label)} />
                  <Field label="ID" value={selectedNode.id} />
                  <Field label="类型" value={isLogicNode(selectedData) ? selectedData.nodeType : "agent"} />
                  <Field label="状态" value={String(selectedData.status)} />
                  {"config" in selectedData && selectedData.config ? (
                    <Field label="配置" value={Object.entries(selectedData.config).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" · ")} />
                  ) : null}
                </div>
              ) : (
                <p className="text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
                  点击画布中的节点可以查看角色、工具和运行状态。后续可在这里扩展模型选择、权限和失败降级策略。
                </p>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-normal" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-1 break-words text-xs" style={{ color: "var(--fg-primary)" }}>{value || "-"}</p>
    </div>
  );
}
