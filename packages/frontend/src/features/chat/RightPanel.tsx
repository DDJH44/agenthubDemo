"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Artifact, Message, ResourceItem, SessionAgentStatus, StepResult } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { DeployPanel as DeployWorkflowPanel } from "./DeployPanel";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.default), { ssr: false });
const MonacoDiffEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.DiffEditor), { ssr: false });

type PanelTab = "tasks" | "code" | "preview" | "diff" | "slides" | "history" | "deploy" | "context";

const TABS: Array<{ key: PanelTab; label: string; icon: string }> = [
  { key: "tasks", label: "任务", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { key: "code", label: "代码", icon: "M16 18l6-6-6-6M8 6l-6 6 6 6" },
  { key: "preview", label: "预览", icon: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z" },
  { key: "diff", label: "Diff", icon: "M6 18L18 6M6 6l12 12" },
  { key: "slides", label: "PPT", icon: "M4 5h16v14H4zM8 9h8M8 13h5" },
  { key: "history", label: "历史", icon: "M3 12a9 9 0 109-9M3 3v6h6M12 7v5l3 3" },
  { key: "deploy", label: "部署", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { key: "context", label: "上下文", icon: "M4 4h16v5H4zM4 15h7v5H4zM15 15h5v5h-5z" },
];

const LANG_MAP: Record<string, string> = {
  html: "html",
  css: "css",
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  diff: "diff",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
};

const AGENT_OPTIONS = [
  { id: "pmo", label: "PMO", sender: "planner" },
  { id: "codex", label: "Codex", sender: "coder" },
  { id: "ux-reviewer", label: "UX Reviewer", sender: "refiner" },
];

function formatTime(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownToHtml(markdown: string) {
  let html = escapeHtml(markdown);
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
}

function documentShell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 28px; color: #202124; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.75; }
    h1 { font-size: 26px; margin: 0 0 18px; }
    h2 { font-size: 20px; margin: 22px 0 10px; }
    h3 { font-size: 16px; margin: 18px 0 8px; }
    p { margin: 10px 0; }
    blockquote { margin: 14px 0; padding: 10px 14px; border-left: 4px solid #174ea6; background: #f6f8fb; color: #4b5563; }
    code { background: #f1f3f4; border-radius: 4px; padding: 1px 5px; color: #174ea6; }
    ul { padding-left: 22px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg px-6 text-center" style={{ background: "var(--surface-white)", border: "1px dashed var(--border)" }}>
      <div className="mb-3 h-2 w-2 rounded-full" style={{ background: "var(--fg-disabled)" }} />
      <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{title}</p>
      {desc && <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>{desc}</p>}
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</h3>
      {desc && <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>{desc}</p>}
    </div>
  );
}

interface TaskPanelItem {
  id: string;
  taskName: string;
  taskDescription: string;
  agentName: string;
  status: string;
  progress: number;
}

function getArtifactLanguage(artifact: Artifact) {
  const ext = artifact.filename?.split(".").pop()?.toLowerCase();
  return LANG_MAP[ext ?? ""] ?? LANG_MAP[artifact.type] ?? "plaintext";
}

function addLocalMessage(conversationId: string, message: Omit<Message, "id" | "conversationId" | "timestamp">) {
  useChatStore.getState().addMessage(conversationId, {
    id: crypto.randomUUID(),
    conversationId,
    timestamp: Date.now(),
    ...message,
  });
}

function artifactRootId(artifact: Artifact) {
  return artifact.parentId ?? artifact.id;
}

function familyArtifacts(artifacts: Artifact[], artifact: Artifact) {
  const rootId = artifactRootId(artifact);
  return artifacts
    .filter((item) => item.id === rootId || item.parentId === rootId)
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1) || b.createdAt - a.createdAt);
}

function latestArtifacts(artifacts: Artifact[]) {
  const grouped = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    const rootId = artifactRootId(artifact);
    const current = grouped.get(rootId);
    const artifactVersion = artifact.version ?? 1;
    const currentVersion = current?.version ?? 1;
    if (!current || artifactVersion > currentVersion || (artifactVersion === currentVersion && artifact.createdAt > current.createdAt)) {
      grouped.set(rootId, artifact);
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function previewTypeForArtifact(artifact: Pick<Artifact, "type" | "filename">) {
  if (artifact.type === "html" || artifact.filename?.endsWith(".html")) return "html";
  if (artifact.type === "markdown" || artifact.type === "document" || artifact.filename?.endsWith(".md")) return "document";
  if (artifact.type === "preview_url" || artifact.type === "deploy_url") return "url";
  return "code";
}

function applyUnifiedDiff(source: string, diff: string) {
  const sourceLines = source.split("\n");
  const output: string[] = [];
  const diffLines = diff.split("\n");
  let cursor = 0;
  let touched = false;

  for (let index = 0; index < diffLines.length; index++) {
    const header = diffLines[index].match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (!header) continue;

    touched = true;
    const oldStart = Number.parseInt(header[1], 10) - 1;
    while (cursor < oldStart && cursor < sourceLines.length) {
      output.push(sourceLines[cursor]);
      cursor += 1;
    }

    index += 1;
    while (index < diffLines.length && !diffLines[index].startsWith("@@")) {
      const line = diffLines[index];
      if (line.startsWith(" ")) {
        output.push(sourceLines[cursor] ?? line.slice(1));
        cursor += 1;
      } else if (line.startsWith("-")) {
        cursor += 1;
      } else if (line.startsWith("+")) {
        output.push(line.slice(1));
      }
      index += 1;
    }
    index -= 1;
  }

  if (!touched) return null;
  while (cursor < sourceLines.length) {
    output.push(sourceLines[cursor]);
    cursor += 1;
  }
  return output.join("\n");
}

function statusText(status: string) {
  if (status === "done") return "已完成";
  if (status === "running") return "运行中";
  if (status === "failed") return "需降级";
  return "等待中";
}

function statusColor(status: string) {
  if (status === "done") return "var(--success)";
  if (status === "running") return "#174ea6";
  if (status === "failed") return "var(--danger)";
  return "var(--fg-tertiary)";
}

function OrchestrationBoard({
  items,
  messages,
  sessionAgentStatuses,
}: {
  items: TaskPanelItem[];
  messages: Message[];
  sessionAgentStatuses: SessionAgentStatus[];
}) {
  const pmoItem = items.find((item) => /pmo|主 Agent|理解|拆解/i.test(`${item.agentName} ${item.taskName}`));
  const conflictEvents = messages.filter((message) => message.type === "critic_review" || message.type === "diff_card" || /冲突|降级|接管/.test(message.content));
  const deployEvents = messages.filter((message) => message.type === "deploy_card");
  const runningAgents = sessionAgentStatuses.filter((agent) => agent.status === "running");
  const completedAgents = sessionAgentStatuses.filter((agent) => agent.status === "done");
  const lanes = [
    {
      title: "并行批次 A",
      desc: "需求引用与网页产物同步推进",
      agents: ["Researcher", "Codex"],
      progress: Math.round(
        items
          .filter((item) => /Researcher|Codex/.test(item.agentName))
          .reduce((sum, item, _, list) => sum + item.progress / Math.max(1, list.length), 0)
      ),
    },
    {
      title: "降级通道",
      desc: "冲突文件交给 Claude Code 接管",
      agents: ["Claude Code"],
      progress: sessionAgentStatuses.find((agent) => agent.agentId === "claude-code")?.progress ?? (conflictEvents.length ? 76 : 0),
    },
    {
      title: "发布与复核",
      desc: "部署完成后进入 UX 验收",
      agents: ["Open Code", "UX Reviewer"],
      progress: Math.round(
        items
          .filter((item) => /Open Code|UX Reviewer/.test(item.agentName))
          .reduce((sum, item, _, list) => sum + item.progress / Math.max(1, list.length), 0)
      ),
    },
  ];

  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "#174ea6" }}>
            PMO
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>主 Agent 调度中枢</p>
              <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>
                协调器
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
              {pmoItem?.taskDescription || "PMO 负责理解目标、拆解任务、派发子 Agent、监听风险并在失败时切换执行者。"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "运行中", value: runningAgents.length },
                { label: "已完成", value: completedAgents.length },
                { label: "风险事件", value: conflictEvents.length },
              ].map((item) => (
                <div key={item.label} className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-low)" }}>
                  <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{item.label}</p>
                  <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>并行调度队列</p>
          <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>按依赖收敛</span>
        </div>
        <div className="grid gap-2">
          {lanes.map((lane) => (
            <div key={lane.title} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>{lane.title}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{lane.desc}</p>
                </div>
                <span className="shrink-0 text-xs font-bold" style={{ color: "#174ea6" }}>{lane.progress}%</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {lane.agents.map((agent) => (
                  <span key={agent} className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                    {agent}
                  </span>
                ))}
              </div>
              <div className="h-1 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
                <div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(lane.progress, 100))}%`, background: "#174ea6" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {(conflictEvents.length > 0 || deployEvents.length > 0) && (
        <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>失败降级与冲突处理</p>
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--danger)", background: "var(--danger-subtle)" }}>
              自动兜底
            </span>
          </div>
          <div className="space-y-2">
            {conflictEvents.slice(-2).map((event) => (
              <div key={event.id} className="rounded-md px-2 py-2" style={{ background: "var(--surface-low)" }}>
                <p className="text-[10px] font-semibold" style={{ color: event.type === "diff_card" ? "#174ea6" : "var(--danger)" }}>
                  {event.type === "diff_card" ? "Diff 已生成" : "PMO 风险判断"} · {formatTime(event.timestamp)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{event.content}</p>
              </div>
            ))}
            {deployEvents.slice(-1).map((event) => (
              <div key={event.id} className="rounded-md px-2 py-2" style={{ background: "var(--success-subtle)" }}>
                <p className="text-[10px] font-semibold" style={{ color: "var(--success)" }}>发布回调 · {formatTime(event.timestamp)}</p>
                <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{event.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskPanel({ messages }: { messages: Message[] }) {
  const taskFlow = useChatStore((state) => state.taskFlow);
  const taskProgress = useChatStore((state) => state.taskProgress);
  const sessionAgentStatuses = useChatStore((state) => state.sessionAgentStatuses);
  const workspace = useWorkspaceStore();
  const items = taskFlow.length > 0 ? taskFlow : workspace.plan.map((node) => {
    const dagNode = workspace.dagNodes.find((item) => item.id === node.id);
    return {
      id: node.id,
      taskName: node.task,
      taskDescription: node.dependsOn.length ? `依赖：${node.dependsOn.join("、")}` : "无前置依赖",
      agentName: node.agentRole ?? "agent",
      status: dagNode?.status === "done" ? "done" : dagNode?.status === "running" ? "running" : "waiting",
      progress: dagNode?.status === "done" ? 100 : dagNode?.status === "running" ? 60 : 0,
    };
  });

  if (items.length === 0) {
    return <EmptyState title="暂无任务" desc="启动验收演示后，这里会展示 PMO 的拆解步骤。" />;
  }

  return (
    <div>
      <SectionHeader title="任务拆解" desc="主 Agent 的计划、子 Agent 分工与执行状态。" />
      <OrchestrationBoard items={items} messages={messages} sessionAgentStatuses={sessionAgentStatuses} />
      {taskProgress && (
        <div className="mb-3 rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span style={{ color: "var(--fg-secondary)" }}>总进度</span>
            <span className="font-semibold" style={{ color: "#174ea6" }}>{taskProgress.percentage}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
            <div className="h-full" style={{ width: `${taskProgress.percentage}%`, background: "#174ea6" }} />
          </div>
          <div className="mt-2 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
            已完成 {taskProgress.completed} / {taskProgress.total}，进行中 {taskProgress.inProgress}，等待 {taskProgress.waiting}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => {
          const status = statusText(item.status);
          const color = statusColor(item.status);
          return (
            <div key={item.id} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: color }}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{item.taskName}</p>
                    <span className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color, background: "var(--surface-low)" }}>{status}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{item.taskDescription}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{item.agentName}</span>
                    <div className="h-1 flex-1 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
                      <div className="h-full" style={{ width: `${item.progress}%`, background: color }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sessionAgentStatuses.length > 0 && (
        <div className="mt-4">
          <SectionHeader title="Agent 运行状态" />
          <div className="space-y-2">
            {sessionAgentStatuses.map((agent) => (
              <div key={agent.agentId} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <span className="grid h-7 w-7 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: agent.status === "running" ? "#174ea6" : agent.status === "done" ? "var(--success)" : "var(--fg-tertiary)" }}>
                  {agent.agentName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{agent.agentName}</p>
                  <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{agent.agentRole}</p>
                </div>
                <span className="text-[10px] font-semibold" style={{ color: agent.status === "running" ? "#174ea6" : agent.status === "done" ? "var(--success)" : "var(--fg-tertiary)" }}>
                  {agent.status === "running" ? `${agent.progress ?? 0}%` : agent.status === "done" ? "完成" : "等待"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function extractCodeItems(artifacts: Artifact[], messages: Message[]) {
  const artifactItems = artifacts
    .filter((artifact) => ["code", "html", "json", "markdown"].includes(artifact.type))
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1) || b.createdAt - a.createdAt)
    .map((artifact) => ({
      id: artifact.id,
      artifactId: artifact.id,
      filename: artifact.filename || artifact.type,
      content: artifact.content,
      language: getArtifactLanguage(artifact),
      version: artifact.version,
      source: "artifact" as const,
    }));

  const messageItems: Array<{ id: string; artifactId: string; filename: string; content: string; language: string; version?: number; source: "message" }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  for (const message of messages) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message.content)) !== null) {
      const language = match[1] || "text";
      const content = match[2].trim();
      if (content.length < 20) continue;
      messageItems.push({
        id: `${message.id}-${messageItems.length}`,
        artifactId: message.id,
        filename: `snippet.${language}`,
        content,
        language: LANG_MAP[language] ?? language,
        source: "message",
      });
    }
  }

  return [...artifactItems, ...messageItems];
}

function CodePanel({ artifacts, messages }: { artifacts: Artifact[]; messages: Message[] }) {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const createArtifactVersion = useWorkspaceStore((state) => state.createArtifactVersion);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const items = extractCodeItems(artifacts, messages);
  const activeItem = items.find((item) => item.id === (activeId ?? items[0]?.id));

  const askAgent = (artifactId: string, content: string) => {
    if (!activeConversationId) return;
    addLocalMessage(activeConversationId, {
      type: "user_message",
      sender: "user",
      content: `@Codex 请基于当前代码修改产物：${artifactId}`,
      mentions: ["codex"],
      payload: { artifactId, content },
    });
    addLocalMessage(activeConversationId, {
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: "已收到代码编辑上下文。我会基于右侧工作台中的最新内容继续处理，并在需要时输出 Diff。",
    });
  };

  if (!activeItem) {
    return <EmptyState title="暂无代码产物" desc="Agent 回复代码块或生成产物后，会在这里进入编辑。" />;
  }

  const value = drafts[activeItem.id] ?? activeItem.content;
  const isDirty = value !== activeItem.content;
  const canSaveVersion = activeItem.source === "artifact" && isDirty;

  const resetDraft = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[activeItem.id];
      return next;
    });
  };

  const saveVersion = () => {
    if (!canSaveVersion) return;
    const created = createArtifactVersion(activeItem.artifactId, value, {
      createdBy: "User",
      changeSummary: "在代码编辑器中保存手动修改",
      metadata: { revisionSource: "code-editor" },
    });
    if (!created) return;
    setActiveId(created.id);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[activeItem.id];
      return next;
    });
    setCurrentPreview({
      artifactId: created.id,
      type: previewTypeForArtifact(created),
      content: created.content,
      filename: created.filename,
    });
    if (activeConversationId) {
      addLocalMessage(activeConversationId, {
        type: "system",
        sender: "system",
        content: `已保存 ${created.filename || created.type} v${created.version}，可在历史中回滚或继续交给 Agent。`,
        payload: { artifactId: created.id, version: created.version },
      });
    }
  };

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <SectionHeader title="代码编辑" desc="支持查看、局部编辑、保存新版本，并将修改交给 Agent 继续处理。" />
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
            style={{
              color: item.id === activeItem.id ? "#174ea6" : "var(--fg-secondary)",
              background: item.id === activeItem.id ? "rgba(23, 78, 166, 0.07)" : "var(--surface-white)",
              border: `1px solid ${item.id === activeItem.id ? "rgba(23, 78, 166, 0.18)" : "var(--border)"}`,
            }}
          >
            {item.filename}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)", background: "#1e1e1e" }}>
        <div className="flex h-9 items-center justify-between gap-2 px-3" style={{ background: "#2b2b2b", borderBottom: "1px solid #3b3b3b" }}>
          <div className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-white">{activeItem.filename}</span>
            <span className="text-[10px]" style={{ color: "#a1a1aa" }}>{activeItem.language}{activeItem.version ? ` · v${activeItem.version}` : ""}{isDirty ? " · 未保存" : ""}</span>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={resetDraft} disabled={!isDirty} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: isDirty ? "#dbeafe" : "#71717a", background: isDirty ? "#3f3f46" : "#2b2b2b", border: "1px solid #3b3b3b" }}>
              重置
            </button>
            <button type="button" onClick={saveVersion} disabled={!canSaveVersion} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: canSaveVersion ? "#dbeafe" : "#71717a", background: canSaveVersion ? "#174ea6" : "#2b2b2b", border: "1px solid #3b3b3b" }}>
              保存版本
            </button>
            <button type="button" onClick={() => askAgent(activeItem.artifactId, value)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "#dbeafe", background: "#174ea6" }}>
              交给 Agent
            </button>
          </div>
        </div>
        <div style={{ height: 420 }}>
          <MonacoEditor
            height="100%"
            language={activeItem.language}
            theme="vs-dark"
            value={value}
            onChange={(next) => setDrafts((prev) => ({ ...prev, [activeItem.id]: next ?? "" }))}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 19,
              lineNumbers: "on",
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function findPreviewArtifact(artifacts: Artifact[]) {
  const htmlArtifacts = artifacts
    .filter((artifact) => artifact.type === "html" || artifact.filename?.endsWith(".html") || artifact.content.includes("<html"))
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || b.createdAt - a.createdAt);
  if (htmlArtifacts[0]) return { artifact: htmlArtifacts[0], type: "html" as const };

  const docArtifacts = artifacts
    .filter((artifact) => artifact.type === "markdown" || artifact.type === "document" || artifact.filename?.endsWith(".md"))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (docArtifacts[0]) return { artifact: docArtifacts[0], type: "document" as const };

  const urlArtifacts = artifacts.filter((artifact) => artifact.type === "preview_url" || artifact.type === "deploy_url");
  if (urlArtifacts[0]) return { artifact: urlArtifacts[0], type: "url" as const };
  return null;
}

function PreviewPanel({ artifacts }: { artifacts: Artifact[] }) {
  const currentPreview = useChatStore((state) => state.currentPreview);
  const previewArtifact = currentPreview
    ? {
        artifact: {
          id: currentPreview.artifactId,
          jobId: "local-preview",
          type: (["html", "markdown", "document", "preview_url", "deploy_url", "code"].includes(currentPreview.type) ? currentPreview.type : "code") as Artifact["type"],
          filename: currentPreview.filename,
          content: currentPreview.content,
          createdAt: 0,
          version: undefined,
        } as Artifact,
        type: currentPreview.type === "url" ? "url" as const : currentPreview.type === "html" ? "html" as const : "document" as const,
      }
    : null;
  const item = previewArtifact ?? findPreviewArtifact(artifacts);
  if (!item) {
    return <EmptyState title="暂无预览" desc="HTML、文档或部署链接生成后会在这里渲染。" />;
  }

  let srcDoc: string | undefined;
  let src: string | undefined;
  if (item.type === "html") {
    srcDoc = item.artifact.content;
  } else if (item.type === "document") {
    srcDoc = documentShell(item.artifact.filename || "document", markdownToHtml(item.artifact.content));
  } else {
    src = item.artifact.content;
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <SectionHeader title="产物预览" desc="优先展示最新 HTML 版本，也支持文档渲染和 URL 预览。" />
      <div className="mb-2 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{item.artifact.filename || item.artifact.type}</p>
          <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{currentPreview ? "临时预览" : item.artifact.version ? `v${item.artifact.version}` : "当前版本"}</p>
        </div>
        {src && (
          <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-[10px] font-semibold no-underline" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>
            新窗口
          </a>
        )}
      </div>
      <iframe
        src={src}
        srcDoc={srcDoc}
        className="min-h-0 flex-1 rounded-lg"
        style={{ width: "100%", border: "1px solid var(--border)", background: "#fff" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="artifact-preview"
      />
    </div>
  );
}

function parseDiff(content: string) {
  let original = "";
  let modified = "";
  for (const line of content.split("\n")) {
    if (line.startsWith("-") && !line.startsWith("---")) {
      original += `${line.slice(1)}\n`;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      modified += `${line.slice(1)}\n`;
    } else if (!line.startsWith("@@") && !line.startsWith("---") && !line.startsWith("+++")) {
      const clean = line.startsWith(" ") ? line.slice(1) : line;
      original += `${clean}\n`;
      modified += `${clean}\n`;
    }
  }
  return { original, modified };
}

function DiffPanel({ messages, artifacts }: { messages: Message[]; artifacts: Artifact[] }) {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const createArtifactVersion = useWorkspaceStore((state) => state.createArtifactVersion);
  const diffMessages = messages.filter((message) => message.type === "diff_card");
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = diffMessages.find((message) => message.id === (activeId ?? diffMessages[0]?.id));

  if (!active) {
    return <EmptyState title="暂无 Diff" desc="出现代码冲突、版本变更或审查修改后会显示在这里。" />;
  }

  const payload = active.payload as { fileName?: string } | undefined;
  const { original, modified } = parseDiff(active.content);
  const fileName = payload?.fileName;
  const latest = latestArtifacts(artifacts);
  const targetArtifact =
    latest.find((artifact) => fileName && (artifact.filename === fileName || artifact.filename?.endsWith(fileName) || fileName.endsWith(artifact.filename ?? ""))) ??
    latest.find((artifact) => ["html", "code", "markdown", "json"].includes(artifact.type));

  const applyDiff = () => {
    if (!targetArtifact) return;
    const nextContent = applyUnifiedDiff(targetArtifact.content, active.content) ?? modified.trimEnd();
    const created = createArtifactVersion(targetArtifact.id, nextContent, {
      createdBy: active.senderId || active.sender || "Agent",
      changeSummary: `应用 Diff：${fileName || targetArtifact.filename || targetArtifact.type}`,
      metadata: { revisionSource: "diff", diffMessageId: active.id },
    });
    if (!created) return;
    setCurrentPreview({
      artifactId: created.id,
      type: previewTypeForArtifact(created),
      content: created.content,
      filename: created.filename,
    });
    if (activeConversationId) {
      addLocalMessage(activeConversationId, {
        type: "system",
        sender: "system",
        content: `已将 Diff 应用为 ${created.filename || created.type} v${created.version}。`,
        payload: { artifactId: created.id, diffMessageId: active.id },
      });
    }
  };

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <SectionHeader title="Diff 视图" desc="用于展示 Agent 合并冲突、修复代码和版本差异，并可应用为新版本。" />
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {diffMessages.map((message) => {
          const itemPayload = message.payload as { fileName?: string } | undefined;
          return (
            <button
              key={message.id}
              type="button"
              onClick={() => setActiveId(message.id)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
              style={{
                color: message.id === active.id ? "#174ea6" : "var(--fg-secondary)",
                background: message.id === active.id ? "rgba(23, 78, 166, 0.07)" : "var(--surface-white)",
                border: `1px solid ${message.id === active.id ? "rgba(23, 78, 166, 0.18)" : "var(--border)"}`,
              }}
            >
              {itemPayload?.fileName || "diff"}
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <div className="flex h-9 items-center justify-between px-3" style={{ background: "var(--surface-low)", borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <span className="block truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{payload?.fileName || "diff"}</span>
            <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{targetArtifact?.filename ? `目标：${targetArtifact.filename}` : formatTime(active.timestamp)}</span>
          </div>
          <button type="button" onClick={applyDiff} disabled={!targetArtifact} className="h-6 shrink-0 rounded px-2 text-[10px] font-semibold" style={{ color: targetArtifact ? "#fff" : "var(--fg-disabled)", background: targetArtifact ? "#174ea6" : "var(--surface-white)", border: "1px solid var(--border)" }}>
            应用为版本
          </button>
        </div>
        <div style={{ height: 430 }}>
          <MonacoDiffEditor
            height="100%"
            language={LANG_MAP[payload?.fileName?.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext"}
            original={original}
            modified={modified}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 19,
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface Slide {
  title: string;
  body: string;
  notes?: string;
}

function parseSlides(content: string): Slide[] {
  const sections = content.split(/(?=^##\s)/m).map((part) => part.trim()).filter(Boolean);
  return sections.map((section, index) => {
    const lines = section.split("\n");
    const titleLine = lines[0]?.startsWith("## ") ? lines.shift() : undefined;
    const notes = lines.filter((line) => line.startsWith("> ")).map((line) => line.slice(2)).join("\n");
    const body = lines.filter((line) => !line.startsWith("> ")).join("\n").trim();
    return { title: titleLine?.replace(/^##\s+/, "") || `第 ${index + 1} 页`, body, notes: notes || undefined };
  });
}

function SlidesPanel({ artifacts }: { artifacts: Artifact[] }) {
  const slidesArtifacts = artifacts.filter((artifact) => artifact.type === "slides" || artifact.filename?.includes("slides"));
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const artifact = slidesArtifacts.find((item) => item.id === (artifactId ?? slidesArtifacts[0]?.id));
  const slides = artifact?.content ? parseSlides(artifact.content) : [];
  const current = slides[Math.min(page, Math.max(0, slides.length - 1))];

  if (!artifact || slides.length === 0 || !current) {
    return <EmptyState title="暂无 PPT" desc="Agent 生成 slides 产物后，可以在这里逐页浏览。" />;
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <SectionHeader title="PPT 浏览" desc="使用 Markdown slides 渲染，适合验收演示和复盘。" />
      {slidesArtifacts.length > 1 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {slidesArtifacts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setArtifactId(item.id); setPage(0); }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
              style={{
                color: item.id === artifact.id ? "#174ea6" : "var(--fg-secondary)",
                background: item.id === artifact.id ? "rgba(23, 78, 166, 0.07)" : "var(--surface-white)",
                border: `1px solid ${item.id === artifact.id ? "rgba(23, 78, 166, 0.18)" : "var(--border)"}`,
              }}
            >
              {item.filename || "slides"}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg" style={{ background: "#fff", border: "1px solid var(--border)" }}>
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)", background: "#f6f8fb" }}>
          <p className="text-[10px] font-semibold" style={{ color: "#174ea6" }}>SLIDE {page + 1} / {slides.length}</p>
          <h2 className="mt-1 text-xl font-bold" style={{ color: "#202124" }}>{current.title}</h2>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5" style={{ color: "#202124", lineHeight: 1.8 }}>
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(current.body) }} />
          {current.notes && (
            <div className="mt-5 rounded-lg p-3" style={{ background: "#fff8e1", border: "1px solid #f5d276" }}>
              <p className="text-xs font-semibold" style={{ color: "#8a5a00" }}>演讲备注</p>
              <pre className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "#6f4a00", fontFamily: "var(--font-sans)" }}>{current.notes}</pre>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-low)" }}>
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-md px-3 py-1 text-xs font-semibold" style={{ color: page === 0 ? "var(--fg-disabled)" : "#174ea6", background: "#fff", border: "1px solid var(--border)" }}>
            上一页
          </button>
          <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{artifact.filename || "slides.md"}</span>
          <button type="button" disabled={page >= slides.length - 1} onClick={() => setPage((value) => Math.min(slides.length - 1, value + 1))} className="rounded-md px-3 py-1 text-xs font-semibold" style={{ color: page >= slides.length - 1 ? "var(--fg-disabled)" : "#174ea6", background: "#fff", border: "1px solid var(--border)" }}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ artifacts, stepResults }: { artifacts: Artifact[]; stepResults: StepResult[] }) {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const createArtifactVersion = useWorkspaceStore((state) => state.createArtifactVersion);
  const versionGroups = latestArtifacts(artifacts)
    .map((artifact) => familyArtifacts(artifacts, artifact))
    .filter((family) => family.some((artifact) => artifact.version || artifact.parentId));

  const previewVersion = (artifact: Artifact) => {
    setCurrentPreview({
      artifactId: artifact.id,
      type: previewTypeForArtifact(artifact),
      content: artifact.content,
      filename: artifact.filename,
    });
  };

  const restoreVersion = (artifact: Artifact) => {
    const created = createArtifactVersion(artifact.id, artifact.content, {
      createdBy: "User",
      changeSummary: `回滚到 v${artifact.version ?? 1}`,
      metadata: { revisionSource: "restore", restoredFromArtifactId: artifact.id, restoredFromVersion: artifact.version ?? 1 },
    });
    if (!created) return;
    previewVersion(created);
    if (activeConversationId) {
      addLocalMessage(activeConversationId, {
        type: "system",
        sender: "system",
        content: `已从 ${artifact.filename || artifact.type} v${artifact.version ?? 1} 回滚生成 v${created.version}。`,
        payload: { artifactId: created.id, restoredFromArtifactId: artifact.id },
      });
    }
  };

  const handoffVersion = (artifact: Artifact) => {
    if (!activeConversationId) return;
    addLocalMessage(activeConversationId, {
      type: "user_message",
      sender: "user",
      content: `@Codex 请基于 ${artifact.filename || artifact.type} v${artifact.version ?? 1} 继续修改。`,
      mentions: ["codex"],
      payload: { artifactId: artifact.id, content: artifact.content, version: artifact.version },
    });
    addLocalMessage(activeConversationId, {
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: `已收到 ${artifact.filename || artifact.type} v${artifact.version ?? 1} 的完整内容。我会以这个版本作为基线继续处理。`,
      payload: { artifactId: artifact.id, version: artifact.version },
    });
  };

  if (versionGroups.length === 0 && stepResults.length === 0) {
    return <EmptyState title="暂无版本历史" desc="产物更新、Diff 合并或部署步骤会记录在这里。" />;
  }

  return (
    <div>
      <SectionHeader title="版本历史" desc="按产物版本和 Agent 步骤记录变更，可预览旧版、回滚并继续交给 Agent。" />
      {versionGroups.length > 0 && (
        <div className="mb-4 space-y-2">
          {versionGroups.map((family) => {
            const latest = family[0];
            return (
              <div key={artifactRootId(latest)} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{latest.filename || latest.type}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>最新 v{latest.version ?? 1} · {family.length} 个版本</p>
                  </div>
                  <button type="button" onClick={() => previewVersion(latest)} className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>
                    预览最新
                  </button>
                </div>
                <div className="space-y-1.5">
                  {family.map((artifact) => {
                    const isLatest = artifact.id === latest.id;
                    const changeSummary = typeof artifact.metadata?.changeSummary === "string" ? artifact.metadata.changeSummary : "产物版本";
                    return (
                      <div key={artifact.id} className="rounded-md p-2" style={{ background: isLatest ? "rgba(23, 78, 166, 0.05)" : "var(--surface-low)", border: `1px solid ${isLatest ? "rgba(23, 78, 166, 0.14)" : "transparent"}` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold" style={{ color: isLatest ? "#174ea6" : "var(--fg-secondary)", background: "var(--surface-white)" }}>v{artifact.version ?? 1}</span>
                              <span className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{artifact.createdBy || "Agent"} · {formatTime(artifact.createdAt)}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.5 }}>{changeSummary}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => previewVersion(artifact)} className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "#174ea6", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                            预览
                          </button>
                          <button type="button" onClick={() => restoreVersion(artifact)} disabled={isLatest} className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: isLatest ? "var(--fg-disabled)" : "#174ea6", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                            回滚到此版
                          </button>
                          <button type="button" onClick={() => handoffVersion(artifact)} className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "#174ea6", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                            交给 Agent
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {stepResults.length > 0 && (
        <div className="space-y-2">
          <SectionHeader title="执行记录" />
          {stepResults.map((result, index) => (
            <div key={result.id} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-sm text-[10px] font-bold text-white" style={{ background: "#5f6368" }}>{index + 1}</span>
                <p className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{result.task}</p>
                {result.toolUsed && <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>{result.toolUsed}</span>}
              </div>
              <p className="mt-2 line-clamp-3 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{result.result}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface QuoteItem {
  id: string;
  artifactId: string;
  filename: string;
  index: number;
  text: string;
}

function extractQuotes(artifacts: Artifact[]): QuoteItem[] {
  const quoteItems: QuoteItem[] = [];
  for (const artifact of artifacts) {
    if (!["markdown", "document", "slides"].includes(artifact.type) && !artifact.filename?.endsWith(".md")) continue;
    const blocks = artifact.content
      .split(/\n\s*\n/g)
      .map((block) => block.replace(/^#+\s+/gm, "").replace(/^>\s?/gm, "").replace(/^- /gm, "").trim())
      .filter((block) => block.length >= 18);
    blocks.slice(0, 8).forEach((block, index) => {
      quoteItems.push({
        id: `${artifact.id}-${index}`,
        artifactId: artifact.id,
        filename: artifact.filename || artifact.type,
        index: index + 1,
        text: block,
      });
    });
  }
  return quoteItems;
}

function ResourceList({ resources }: { resources: ResourceItem[] }) {
  if (resources.length === 0) {
    return <p className="rounded-md px-3 py-2 text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>暂无已绑定资源。</p>;
  }

  return (
    <div className="space-y-2">
      {resources.map((resource) => (
        <div key={resource.id} className="flex items-center gap-3 rounded-md p-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <span className="grid h-8 w-8 place-items-center rounded-md text-[10px] font-bold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>
            {resource.type.toUpperCase().slice(0, 3)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{resource.name}</p>
            <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{resource.size}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContextPanel({ artifacts, messages, resources }: { artifacts: Artifact[]; messages: Message[]; resources: ResourceItem[] }) {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const currentPreview = useChatStore((state) => state.currentPreview);
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const quotes = extractQuotes(artifacts);
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 1.5);

  const handoffQuote = (quote: QuoteItem, agentId: string) => {
    if (!activeConversationId) return;
    const agent = AGENT_OPTIONS.find((item) => item.id === agentId) ?? AGENT_OPTIONS[0];
    addLocalMessage(activeConversationId, {
      type: "user_message",
      sender: "user",
      content: `@${agent.id} 请处理这段引用：\n\n> ${quote.text}`,
      mentions: [agent.id],
      payload: {
        contextAction: "quote-handoff",
        artifactId: quote.artifactId,
        filename: quote.filename,
        paragraphIndex: quote.index,
        quote: quote.text,
      },
    });
    addLocalMessage(activeConversationId, {
      type: "agent_message",
      sender: agent.sender,
      senderId: agent.id,
      content: `已接收来自 ${quote.filename} 第 ${quote.index} 段的引用。我会把这段内容加入当前上下文，并基于它继续处理。`,
      payload: {
        contextAction: "quote-accepted",
        artifactId: quote.artifactId,
        quote: quote.text,
      },
    });
  };

  const summarizeContext = () => {
    if (!activeConversationId) return;
    addLocalMessage(activeConversationId, {
      type: "agent_message",
      sender: "planner",
      senderId: "pmo",
      content: `上下文摘要已更新：当前会话包含 ${messages.length} 条消息、${artifacts.length} 个产物、${resources.length} 个资源，约 ${estimatedTokens.toLocaleString()} tokens。后续任务会优先引用已标记段落、最新产物版本和部署状态。`,
    });
  };

  return (
    <div>
      <SectionHeader title="上下文管理" desc="管理当前会话中的消息、资源、预览产物和文档引用。" />

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "消息", value: messages.length },
          { label: "产物", value: artifacts.length },
          { label: "资源", value: resources.length },
        ].map((item) => (
          <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{item.label}</p>
            <p className="mt-1 text-lg font-bold" style={{ color: "var(--fg-primary)" }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>上下文窗口</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>约 {estimatedTokens.toLocaleString()} tokens</p>
          </div>
          <button type="button" onClick={summarizeContext} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)" }}>
            生成摘要
          </button>
        </div>
      </div>

      <div className="mb-4">
        <SectionHeader title="当前预览" />
        {currentPreview ? (
          <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{currentPreview.filename || currentPreview.artifactId}</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{currentPreview.type}</p>
            <button type="button" onClick={() => setCurrentPreview(null)} className="mt-2 rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--danger)", background: "var(--danger-subtle)" }}>
              清除临时预览
            </button>
          </div>
        ) : (
          <p className="rounded-md px-3 py-2 text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>暂无临时预览。</p>
        )}
      </div>

      <div className="mb-4">
        <SectionHeader title="资源引用" />
        <ResourceList resources={resources} />
      </div>

      <div>
        <SectionHeader title="文档段落引用" desc="选择段落后可以直接交给指定 Agent 继续处理。" />
        {quotes.length === 0 ? (
          <EmptyState title="暂无可引用段落" desc="生成 Markdown、文档或 PPT 产物后会自动提取段落。" />
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => (
              <div key={quote.id} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold" style={{ color: "#174ea6" }}>{quote.filename} · 第 {quote.index} 段</span>
                </div>
                <p className="line-clamp-4 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.65 }}>{quote.text}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {AGENT_OPTIONS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handoffQuote(quote, agent.id)}
                      className="rounded-md px-2 py-1 text-[10px] font-semibold"
                      style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.14)" }}
                    >
                      交给 {agent.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("tasks");
  const { messages, activeConversationId, resources } = useChatStore();
  const workspace = useWorkspaceStore();
  const convMessages = activeConversationId ? (messages[activeConversationId] ?? []) : [];

  return (
    <aside className="flex h-full flex-col" style={{ background: "var(--surface-white)", borderLeft: "1px solid var(--border)" }}>
      <div className="shrink-0 px-3 pt-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>产物工作台</h2>
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>预览、编辑、Diff、版本、部署和上下文</p>
          </div>
          <span className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
            {workspace.artifacts.length} 产物
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors"
                style={{
                  color: active ? "#174ea6" : "var(--fg-secondary)",
                  background: active ? "rgba(23, 78, 166, 0.07)" : "transparent",
                  border: `1px solid ${active ? "rgba(23, 78, 166, 0.18)" : "transparent"}`,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
        {activeTab === "tasks" && <TaskPanel messages={convMessages} />}
        {activeTab === "code" && <CodePanel artifacts={workspace.artifacts} messages={convMessages} />}
        {activeTab === "preview" && <PreviewPanel artifacts={workspace.artifacts} />}
        {activeTab === "diff" && <DiffPanel messages={convMessages} artifacts={workspace.artifacts} />}
        {activeTab === "slides" && <SlidesPanel artifacts={workspace.artifacts} />}
        {activeTab === "history" && <HistoryPanel artifacts={workspace.artifacts} stepResults={workspace.stepResults} />}
        {activeTab === "deploy" && <DeployWorkflowPanel />}
        {activeTab === "context" && <ContextPanel artifacts={workspace.artifacts} messages={convMessages} resources={resources} />}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <button type="button" onClick={() => useChatStore.getState().setStreaming(false)} className="h-8 rounded-md text-xs font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          暂停生成
        </button>
        <button type="button" onClick={() => useChatStore.getState().clearSession()} className="h-8 rounded-md text-xs font-semibold" style={{ color: "var(--danger)", background: "var(--danger-subtle)", border: "1px solid rgba(220, 53, 69, 0.16)" }}>
          清空会话状态
        </button>
      </div>
    </aside>
  );
}
