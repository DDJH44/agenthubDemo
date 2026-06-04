"use client";

import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Message } from "@agenthub/shared";
import { BrandMascot, type BrandMascotVariant } from "@/components/BrandMascot";
import { useChatStore } from "@/stores/chat-store";
import { ArtifactCard, type ArtifactCardType } from "./ArtifactCard";
import { getCodeFilename, inferCodeLanguage, splitMessageContent } from "./message-content-parser";

interface SenderMeta {
  label: string;
  badge: string;
  color: string;
  role?: string;
  mascot?: BrandMascotVariant;
}

const AGENT_META: Record<string, SenderMeta> = {
  planner: { label: "PMO 主 Agent", badge: "PMO", role: "协调器", color: "var(--accent)" },
  pmo: { label: "PMO 主 Agent", badge: "PMO", role: "协调器", color: "var(--accent)" },
  researcher: { label: "Researcher", badge: "R", role: "资料检索", color: "#0e7490" },
  coder: { label: "Codex", badge: "CX", role: "代码生成", color: "#0f766e" },
  codex: { label: "Codex", badge: "CX", role: "代码生成", color: "#0f766e" },
  worker: { label: "Worker Agent", badge: "W", role: "执行", color: "#5f6368" },
  "claude-code": { label: "Claude Code", badge: "CL", role: "冲突处理", color: "#9a6700" },
  "open-code": { label: "Open Code", badge: "OC", role: "部署", color: "#7c3aed" },
  critic: { label: "Critic", badge: "CR", role: "审查", color: "#a50e0e" },
  refiner: { label: "UX Reviewer", badge: "UX", role: "体验审查", color: "#a50e0e" },
  "ux-reviewer": { label: "自建 UX Reviewer", badge: "UX", role: "自建 Agent", color: "#a50e0e" },
  assistant: { label: "Assistant", badge: "AI", role: "助手", color: "#5f6368" },
  system: { label: "系统", badge: "SYS", role: "通知", color: "#5f6368" },
};

const ARTIFACT_TYPES = new Set<ArtifactCardType>(["code", "html", "json", "markdown", "document", "slides", "preview_url", "deploy_url", "diff"]);

function formatTime(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function getSenderMeta(message: Message): SenderMeta {
  if (message.type === "user_message" || message.sender === "user") {
    return { label: "我", badge: "我", role: "用户", color: "var(--accent)" };
  }
  const key = message.senderId || message.sender || "assistant";
  return AGENT_META[key] ?? AGENT_META[message.sender] ?? {
    label: message.sender || "Agent",
    badge: (message.sender || "A").slice(0, 2).toUpperCase(),
    role: "Agent",
    color: "#5f6368",
  };
}

function extractDisplayContent(content: string) {
  const hasThinking = /<think>[\s\S]*?<\/think>/i.test(content);
  return {
    hasThinking,
    main: content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
  };
}

function isStandaloneHtmlContent(content: string) {
  const trimmed = content.trim();
  if (!/^<!doctype html|^<html[\s>]/i.test(trimmed)) return false;
  const endMatch = /<\/html\s*>/i.exec(trimmed);
  if (!endMatch) return true;
  return trimmed.slice(endMatch.index + endMatch[0].length).trim().length === 0;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} style={{ background: "var(--surface-low)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--accent)" }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function TextContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1" style={{ lineHeight: 1.65 }}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;

        if (trimmed.startsWith("### ")) {
          return <h4 key={index} className="pt-1 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={index} className="pt-1 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={index} className="rounded-md px-3 py-2 text-xs" style={{ borderLeft: "3px solid var(--accent)", background: "var(--accent-subtle)", color: "var(--fg-secondary)" }}>
              {renderInline(trimmed.slice(2))}
            </blockquote>
          );
        }
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={index} className="flex items-start gap-2 text-sm" style={{ color: "var(--fg-primary)" }}>
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--fg-disabled)" }} />
              <span>{renderInline(trimmed.replace(/^[-*]\s+/, ""))}</span>
            </div>
          );
        }
        return <p key={index} className="text-sm" style={{ color: "inherit" }}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function InlineCodeBlock({
  code,
  language,
  filename,
  isOpen,
  messageId,
  conversationId,
}: {
  code: string;
  language?: string;
  filename?: string;
  isOpen?: boolean;
  messageId: string;
  conversationId: string;
}) {
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const normalized = inferCodeLanguage(language, code);
  const isHtml = normalized === "html" || /<!doctype html|<html/i.test(code);
  const displayFilename = filename || (isHtml ? "index.html" : getCodeFilename(normalized));
  return (
    <ArtifactCard
      type={isHtml ? "html" : "code"}
      content={code}
      language={isHtml ? "html" : normalized}
      filename={displayFilename}
      artifactId={`${messageId}-${displayFilename}`}
      conversationId={conversationId}
      onPreview={isHtml && !isOpen ? () => setCurrentPreview({
        artifactId: `${messageId}-${displayFilename}`,
        type: "html",
        content: code,
        filename: displayFilename,
      }) : undefined}
    />
  );
}

function getArtifactType(payload: Record<string, unknown> | undefined): ArtifactCardType | null {
  const raw = String(payload?.artifactType || payload?.type || "").toLowerCase();
  const normalized = ({
    doc: "document",
    docx: "document",
    ppt: "slides",
    pptx: "slides",
    slide: "slides",
  } as Record<string, ArtifactCardType>)[raw] ?? raw;
  return ARTIFACT_TYPES.has(normalized as ArtifactCardType) ? normalized as ArtifactCardType : null;
}

function _TaskStatusCard({ payload }: { payload?: Record<string, unknown> }) {
  const status = String(payload?.status || "running");
  const title = String(payload?.title || "任务处理中");
  const body = String(payload?.body || "");
  const items = Array.isArray(payload?.items)
    ? payload.items as Array<{ label?: string; status?: string }>
    : [];
  const color =
    status === "done" ? "var(--success)" :
    status === "failed" ? "var(--danger)" :
    status === "queued" ? "var(--fg-tertiary)" :
    "var(--accent)";

  return (
    <div className="p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color, background: "var(--surface-low)" }}>
              {status === "done" ? "完成" : status === "failed" ? "失败" : status === "queued" ? "排队" : "进行中"}
            </span>
          </div>
          {body && <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{body}</p>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {items.slice(0, 5).map((item, index) => {
            const itemStatus = item.status || "pending";
            const itemColor =
              itemStatus === "done" ? "var(--success)" :
              itemStatus === "running" ? "var(--accent)" :
              "var(--fg-disabled)";
            return (
              <div key={`${index}-${item.label}`} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: "var(--surface-low)" }}>
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold" style={{ color: itemColor, border: `1px solid ${itemColor}` }}>
                  {itemStatus === "done" ? "✓" : itemStatus === "running" ? "…" : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{item.label || "任务步骤"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TaskLifecyclePhase = "received" | "planning" | "dispatching" | "executing" | "reviewing" | "completed" | "failed";

const TASK_LIFECYCLE_STEPS: Array<{ phase: Exclude<TaskLifecyclePhase, "failed">; label: string; hint: string }> = [
  { phase: "received", label: "接收", hint: "理解目标" },
  { phase: "planning", label: "规划", hint: "拆解步骤" },
  { phase: "dispatching", label: "分派", hint: "匹配 Agent" },
  { phase: "executing", label: "执行", hint: "生成内容" },
  { phase: "completed", label: "交付", hint: "产物就绪" },
];

function getAgentLabelFallback(agentId: string) {
  return AGENT_META[agentId]?.label || agentId || "Agent";
}

function normalizeTaskPhase(payload: Record<string, unknown> | undefined, status: string): TaskLifecyclePhase {
  const raw = typeof payload?.phase === "string" ? payload.phase : "";
  if (["received", "planning", "dispatching", "executing", "reviewing", "completed", "failed"].includes(raw)) {
    return raw as TaskLifecyclePhase;
  }
  if (status === "failed") return "failed";
  if (status === "done") return "completed";
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.some((item) => typeof item === "object" && item && (item as { status?: string }).status === "running")) return "executing";
  if (items.length > 0) return "planning";
  return "received";
}

function taskCardStatusLabel(status: string) {
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "queued") return "排队中";
  return "进行中";
}

function taskItemStatusLabel(status: string) {
  if (status === "done") return "完成";
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  return "等待";
}

function taskPhaseIndex(phase: TaskLifecyclePhase) {
  if (phase === "failed") return Math.max(0, TASK_LIFECYCLE_STEPS.findIndex((step) => step.phase === "executing"));
  if (phase === "reviewing") return Math.max(0, TASK_LIFECYCLE_STEPS.findIndex((step) => step.phase === "completed"));
  return Math.max(0, TASK_LIFECYCLE_STEPS.findIndex((step) => step.phase === phase));
}

function openRightPanel(tab: "tasks" | "preview" | "code" | "deploy" | "context") {
  window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
  }, 0);
}

function composeTaskFollowup(title: string) {
  window.dispatchEvent(new CustomEvent("chat:compose", {
    detail: {
      mode: "replace",
      text: `继续优化这个任务：${title}\n\n请基于当前会话、产物和任务流程，先说明你准备改哪一部分，再继续执行。`,
    },
  }));
}

function TaskLifecycleCard({ payload }: { payload?: Record<string, unknown> }) {
  const status = String(payload?.status || "running");
  const title = String(payload?.title || "任务处理中");
  const body = String(payload?.body || "");
  const phase = normalizeTaskPhase(payload, status);
  const items = Array.isArray(payload?.items)
    ? payload.items as Array<{ label?: string; status?: string }>
    : [];
  const currentPhaseIndex = taskPhaseIndex(phase);
  const doneCount = items.filter((item) => item.status === "done").length;
  const activeAgentId = String(payload?.activeAgentId || payload?.agentId || "");
  const activeAgentLabel = activeAgentId ? getAgentLabelFallback(activeAgentId) : "";
  const color =
    status === "done" ? "var(--success)" :
    status === "failed" ? "var(--danger)" :
    status === "queued" ? "var(--fg-tertiary)" :
    "var(--accent)";

  return (
    <div className="p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color, background: "var(--surface-low)" }}>
              {taskCardStatusLabel(status)}
            </span>
            {activeAgentLabel && status !== "done" && status !== "failed" && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                {activeAgentLabel}
              </span>
            )}
          </div>
          {body && <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{body}</p>}
        </div>
      </div>

      <div className="mt-3 rounded-lg px-2.5 py-2.5" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-5 gap-1.5">
          {TASK_LIFECYCLE_STEPS.map((step, index) => {
            const isDone = status === "done" || (phase !== "failed" && index < currentPhaseIndex);
            const isActive = phase === "failed" ? index === currentPhaseIndex : index === currentPhaseIndex && status !== "done";
            const stateColor = phase === "failed" && isActive ? "var(--danger)" : isDone ? "var(--success)" : isActive ? "var(--accent)" : "var(--fg-disabled)";
            return (
              <div key={step.phase} className="min-w-0">
                <div className="mb-1 flex items-center gap-1">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ color: isDone ? "#fff" : stateColor, background: isDone ? stateColor : "var(--surface-white)", border: `1px solid ${stateColor}` }}>
                    {isDone ? "✓" : index + 1}
                  </span>
                  <span className="h-px min-w-0 flex-1" style={{ background: index === TASK_LIFECYCLE_STEPS.length - 1 ? "transparent" : stateColor, opacity: isDone || isActive ? 0.9 : 0.28 }} />
                </div>
                <div className="truncate text-[11px] font-semibold" style={{ color: isActive || isDone ? "var(--fg-primary)" : "var(--fg-tertiary)" }}>{step.label}</div>
                <div className="truncate text-[10px]" style={{ color: "var(--fg-disabled)" }}>{step.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>步骤进度</span>
            <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>{doneCount}/{items.length}</span>
          </div>
          {items.slice(0, 5).map((item, index) => {
            const itemStatus = item.status || "pending";
            const itemColor =
              itemStatus === "done" ? "var(--success)" :
              itemStatus === "running" ? "var(--accent)" :
              itemStatus === "failed" ? "var(--danger)" :
              "var(--fg-disabled)";
            return (
              <div key={`${index}-${item.label}`} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold" style={{ color: itemStatus === "done" ? "#fff" : itemColor, background: itemStatus === "done" ? itemColor : "transparent", border: `1px solid ${itemColor}` }}>
                  {itemStatus === "done" ? "✓" : itemStatus === "running" ? "…" : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{item.label || "任务步骤"}</span>
                <span className="shrink-0 text-[10px]" style={{ color: itemColor }}>{taskItemStatusLabel(itemStatus)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => openRightPanel("tasks")} className="h-7 rounded-md px-2 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
          查看流程
        </button>
        <button type="button" onClick={() => openRightPanel(status === "done" ? "preview" : "code")} className="h-7 rounded-md px-2 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          {status === "done" ? "查看产物" : "查看产物区"}
        </button>
        <button type="button" onClick={() => composeTaskFollowup(title)} className="h-7 rounded-md px-2 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          继续优化
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  disabled,
  tone = "neutral",
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "accent" | "success" | "danger";
  children: ReactNode;
}) {
  const color =
    tone === "accent" ? "var(--accent)" :
    tone === "success" ? "var(--success)" :
    tone === "danger" ? "var(--danger)" :
    "var(--fg-tertiary)";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[10px] font-bold transition-colors hover:bg-[var(--surface-low)] disabled:opacity-40"
      style={{ color, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {children}
    </button>
  );
}

function MessageActions({
  message,
  isUser,
  isStreaming,
  onUndo,
  onStop,
}: {
  message: Message;
  isUser: boolean;
  isStreaming?: boolean;
  onUndo?: (messageId: string) => void;
  onStop?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [referenced, setReferenced] = useState(false);
  const [pinned, setPinned] = useState(false);
  const addContextReference = useChatStore((state) => state.addContextReference);
  const addMessage = useChatStore((state) => state.addMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const addToContext = () => {
    const meta = getSenderMeta(message);
    addContextReference(message.conversationId, {
      messageId: message.id,
      sourceType: "message",
      sender: meta.label,
      senderId: message.senderId,
      title: `${meta.label} · ${formatTime(message.timestamp)}`,
      content: message.content,
    });
    setReferenced(true);
    window.setTimeout(() => setReferenced(false), 1400);
  };

  const quoteContent = () => message.content.split("\n").slice(0, 6).join("\n").slice(0, 640);

  const replyToMessage = () => {
    const meta = getSenderMeta(message);
    const quoted = quoteContent().replace(/\n/g, "\n> ");
    window.dispatchEvent(new CustomEvent("chat:compose", {
      detail: {
        mode: "replace",
        text: `回复 ${meta.label}：\n> ${quoted}\n\n`,
      },
    }));
  };

  const pinToContext = () => {
    const meta = getSenderMeta(message);
    addContextReference(message.conversationId, {
      id: `pinned-${message.id}`,
      messageId: message.id,
      sourceType: "quote",
      sender: meta.label,
      senderId: message.senderId,
      title: `固定 · ${meta.label} · ${formatTime(message.timestamp)}`,
      content: message.content,
      pinned: true,
      pinnedAt: Date.now(),
    });
    setPinned(true);
  };

  const regenerateMessage = () => {
    const meta = getSenderMeta(message);
    addToContext();
    addMessage(message.conversationId, {
      id: crypto.randomUUID(),
      conversationId: message.conversationId,
      type: "user_message",
      sender: "user",
      content: `请重新生成 ${meta.label} 在 ${formatTime(message.timestamp)} 的这条回复，保留原上下文但给出更清晰的方案：\n\n> ${quoteContent()}`,
      mentions: [message.senderId || message.sender || "assistant"],
      payload: {
        contextAction: "regenerate",
        sourceMessageId: message.id,
        sourceSender: meta.label,
      },
      timestamp: Date.now(),
    });
    addMessage(message.conversationId, {
      id: crypto.randomUUID(),
      conversationId: message.conversationId,
      type: "agent_message",
      sender: "planner",
      senderId: "pmo",
      content: `PMO 已创建重生成请求：将引用 ${meta.label} 的原回复，并要求执行 Agent 产出更清晰版本。`,
      payload: {
        contextAction: "regenerate-queued",
        sourceMessageId: message.id,
      },
      timestamp: Date.now(),
    });
  };

  const handoffToAgent = (agentId: string, label: string, sender: string) => {
    const meta = getSenderMeta(message);
    addToContext();
    addMessage(message.conversationId, {
      id: crypto.randomUUID(),
      conversationId: message.conversationId,
      type: "user_message",
      sender: "user",
      content: `@${agentId} 请基于这条消息继续处理：\n\n> ${message.content.slice(0, 1200)}`,
      mentions: [agentId],
      payload: {
        contextAction: "message-handoff",
        sourceMessageId: message.id,
        sourceSender: meta.label,
      },
      timestamp: Date.now(),
    });
    addMessage(message.conversationId, {
      id: crypto.randomUUID(),
      conversationId: message.conversationId,
      type: "agent_message",
      sender,
      senderId: agentId,
      content: `${label} 已接收该消息引用，会把它作为后续处理上下文。`,
      payload: {
        contextAction: "message-accepted",
        sourceMessageId: message.id,
      },
      timestamp: Date.now(),
    });
  };

  return (
    <div
      className={`mt-0 flex h-0 w-fit items-center overflow-hidden rounded-lg border px-1 py-0 opacity-0 transition-[height,margin,opacity,padding] group-hover:mt-1 group-hover:h-8 group-hover:py-0.5 group-hover:opacity-100 group-focus-within:mt-1 group-focus-within:h-8 group-focus-within:py-0.5 group-focus-within:opacity-100 ${isUser ? "ml-auto" : ""}`}
      style={{ background: "rgba(255,255,255,0.92)", borderColor: "var(--border)", boxShadow: "var(--shadow-xs)" }}
    >
      <ActionButton title={copied ? "已复制" : "复制"} onClick={copy} tone={copied ? "success" : "neutral"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 8h11v11H8z" />
          <path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
        </svg>
      </ActionButton>
      <ActionButton title={referenced ? "已加入上下文" : "加入上下文"} onClick={addToContext} tone={referenced ? "success" : "neutral"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16v5H4z" />
          <path d="M4 15h7v5H4z" />
          <path d="M15 15h5v5h-5z" />
        </svg>
      </ActionButton>
      <ActionButton title="回复引用" onClick={replyToMessage}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 10 4 15l5 5" />
          <path d="M4 15h10a6 6 0 0 0 0-12h-1" />
        </svg>
      </ActionButton>
      <ActionButton title={pinned ? "已锁定上下文" : "锁定上下文"} onClick={pinToContext} tone={pinned ? "success" : "neutral"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 17v5" />
          <path d="M5 17h14" />
          <path d="M7 3h10l-2 8 3 4H6l3-4z" />
        </svg>
      </ActionButton>
      {!isUser && (
        <ActionButton title="重新生成" onClick={regenerateMessage} tone="accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12A9 9 0 0 1 18.5 5.8" />
            <path d="M18 2v4h4" />
            <path d="M6 22v-4H2" />
          </svg>
        </ActionButton>
      )}
      <ActionButton title="交给 PMO" onClick={() => handoffToAgent("pmo", "PMO", "planner")} tone="accent">PMO</ActionButton>
      <ActionButton title="交给 Codex" onClick={() => handoffToAgent("codex", "Codex", "coder")} tone="accent">CX</ActionButton>
      <ActionButton title="交给 UX Reviewer" onClick={() => handoffToAgent("ux-reviewer", "UX Reviewer", "refiner")} tone="accent">UX</ActionButton>
      {isStreaming && onStop && (
        <ActionButton title="暂停生成" onClick={onStop} tone="accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 4H6v16h4z" />
            <path d="M18 4h-4v16h4z" />
          </svg>
        </ActionButton>
      )}
      {isUser && onUndo && (
        <ActionButton title="撤回" onClick={() => onUndo(message.id)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-1" />
          </svg>
        </ActionButton>
      )}
      <ActionButton title="删除" onClick={() => deleteMessage(message.conversationId, message.id)} tone="danger">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      </ActionButton>
    </div>
  );
}

function getWorkflowReferenceMeta(payload: Record<string, unknown> | undefined) {
  const raw = payload?.workflowRef;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ref = raw as Record<string, unknown>;
  const name = typeof ref.name === "string" ? ref.name : "";
  if (!name) return null;
  return {
    name,
    templateTitle: typeof ref.templateTitle === "string" ? ref.templateTitle : "",
    nodeCount: typeof ref.nodeCount === "number" ? ref.nodeCount : undefined,
  };
}

const TASK_CARD_SUFFIXES = ["lifecycle", "queued", "plan", "progress", "completed", "failed"];

function taskLifecycleGroupKey(message: Message) {
  const payload = message.payload as Record<string, unknown> | undefined;
  const isTaskStatus = message.type === "task_card" || payload?.kind === "task_status";
  if (!isTaskStatus) return null;

  const payloadJobId = typeof payload?.jobId === "string" ? payload.jobId : "";
  if (payloadJobId) return payloadJobId;

  if (!message.id.startsWith("task-")) return null;
  const body = message.id.slice(5);
  for (const suffix of TASK_CARD_SUFFIXES) {
    if (body.endsWith(`-${suffix}`)) return body.slice(0, -suffix.length - 1);
  }
  const assignedIndex = body.lastIndexOf("-assigned-");
  if (assignedIndex > 0) return body.slice(0, assignedIndex);
  return null;
}

function collapseTaskLifecycleMessages(messages: Message[]) {
  const latestIndexByJob = new Map<string, number>();
  messages.forEach((message, index) => {
    const key = taskLifecycleGroupKey(message);
    if (key) latestIndexByJob.set(key, index);
  });

  if (latestIndexByJob.size === 0) return messages;
  return messages.filter((message, index) => {
    const key = taskLifecycleGroupKey(message);
    return !key || latestIndexByJob.get(key) === index;
  });
}

const MessageBubble = memo(function MessageBubble({
  message,
  prevMessage,
  isStreaming,
  onUndo,
  onStop,
}: {
  message: Message;
  prevMessage?: Message;
  isStreaming?: boolean;
  onUndo?: (messageId: string) => void;
  onStop?: () => void;
}) {
  const isUser = message.type === "user_message" || message.sender === "user";
  const isSystem = message.type === "system";
  const senderMeta = getSenderMeta(message);
  const payload = message.payload as Record<string, unknown> | undefined;
  const artifactType = getArtifactType(payload);
  const isTaskCard = message.type === "task_card" || payload?.kind === "task_status";
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const { hasThinking, main } = extractDisplayContent(message.content);
  const displayContent = main || message.content;
  const artifactId = String(payload?.artifactId || payload?.modifiedArtifactId || payload?.originalArtifactId || message.id);
  const artifactFilename = payload?.filename as string | undefined;
  const workflowReferenceMeta = getWorkflowReferenceMeta(payload);
  const previewArtifact = (type: string, content: string, filename?: string) => {
    setCurrentPreview({
      artifactId,
      type,
      content,
      filename,
    });
    const tab = type === "slides" ? "slides" : "preview";
    window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 0);
  };
  const trimmedDisplayContent = displayContent.trim();
  const hasFencedCode = /```[\s\S]*?```/.test(displayContent);
  const htmlLike = !artifactType && !["diff_card", "deploy_card", "preview_card"].includes(message.type) &&
    !hasFencedCode &&
    isStandaloneHtmlContent(trimmedDisplayContent);
  const parts = useMemo(() => splitMessageContent(displayContent), [displayContent]);

  const showAvatar = !prevMessage || prevMessage.sender !== message.sender || prevMessage.senderId !== message.senderId || message.timestamp - prevMessage.timestamp > 5 * 60 * 1000;
  const showDate = prevMessage && message.timestamp - prevMessage.timestamp > 30 * 60 * 1000;

  if (isSystem) {
    return (
      <div className="px-4 py-2">
        <div className="mx-auto w-fit max-w-[82%] rounded-lg px-3 py-1.5 text-center text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <>
      {showDate && (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>{formatDate(message.timestamp)}</span>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>
      )}

      <div className={`group flex gap-3 px-4 py-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
        {!isUser && (
          showAvatar ? (
            senderMeta.mascot ? (
              <BrandMascot variant={senderMeta.mascot} size={34} className="mt-0.5" />
            ) : (
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: senderMeta.color }}>
                {senderMeta.badge}
              </div>
            )
          ) : (
            <div className="w-9 shrink-0" />
          )
        )}

        <div className="min-w-0" style={{ maxWidth: isUser ? "72%" : "86%" }}>
          {showAvatar && (
            <div className={`mb-1 flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
              <span className="text-xs font-bold" style={{ color: isUser ? "var(--accent)" : "var(--fg-secondary)" }}>
                {senderMeta.label}
              </span>
              {senderMeta.role && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                  {senderMeta.role}
                </span>
              )}
              <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>{formatTime(message.timestamp)}</span>
            </div>
          )}

          <div
            className="overflow-hidden rounded-lg"
            style={{
              background: isUser ? "#eef5ff" : "rgba(255, 255, 255, 0.82)",
              color: isUser ? "#173a7a" : "var(--fg-primary)",
              border: `1px solid ${isUser ? "rgba(68, 86, 223, 0.10)" : "rgba(62, 79, 118, 0.08)"}`,
              boxShadow: "none",
            }}
          >
            {message.type === "diff_card" && (
              <ArtifactCard type="diff" content={message.content} filename={String(payload?.fileName || "diff")} />
            )}

            {isTaskCard && (
              <TaskLifecycleCard payload={payload} />
            )}

            {(message.type === "deploy_card" || message.type === "preview_card") && (
              <ArtifactCard
                type={message.type === "deploy_card" ? "deploy_url" : "preview_url"}
                content={message.content}
                conversationId={message.conversationId}
                deployUrl={payload?.url as string | undefined}
                deployDescription={message.content}
                deployStatus={payload?.status as string | undefined}
                deployProvider={(payload?.platformLabel || payload?.platform) as string | undefined}
                deployError={payload?.error as string | undefined}
                deployVerified={payload?.verified as boolean | undefined}
                deployVerificationStatus={payload?.verificationStatus as number | undefined}
                deployProgress={typeof payload?.progress === "number" ? payload.progress : undefined}
              />
            )}

            {artifactType && !["diff_card", "deploy_card", "preview_card"].includes(message.type) && (
              <ArtifactCard
                type={artifactType}
                content={message.content}
                artifactId={artifactId}
                conversationId={message.conversationId}
                filename={artifactFilename}
                language={payload?.language as string | undefined}
                deployUrl={payload?.deployUrl as string | undefined}
                deployStatus={payload?.deployStatus as string | undefined}
                onPreview={() => previewArtifact(artifactType, message.content, artifactFilename)}
              />
            )}

            {htmlLike && (
              <ArtifactCard
                type="html"
                content={displayContent}
                artifactId={message.id}
                conversationId={message.conversationId}
                filename="index.html"
                language="html"
                onPreview={() => previewArtifact("html", displayContent, "index.html")}
              />
            )}

            {!isTaskCard && !artifactType && !htmlLike && !["diff_card", "deploy_card", "preview_card"].includes(message.type) && (
              <div className="px-4 py-3">
                {workflowReferenceMeta && (
                  <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: isUser ? "rgba(255,255,255,0.72)" : "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                    <span className="truncate">引用工作流：{workflowReferenceMeta.name}</span>
                    {workflowReferenceMeta.nodeCount ? (
                      <span className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>· {workflowReferenceMeta.nodeCount} 节点</span>
                    ) : null}
                  </div>
                )}
                {hasThinking && (
                  <div className="mb-2 w-fit rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: isUser ? "rgba(255,255,255,0.56)" : "var(--surface-low)" }}>
                    已省略思考过程
                  </div>
                )}
                {parts.map((part, index) => part.type === "code" ? (
                  <InlineCodeBlock
                    key={index}
                    code={part.value}
                    language={part.language}
                    filename={part.filename}
                    isOpen={part.open}
                    messageId={message.id}
                    conversationId={message.conversationId}
                  />
                ) : (
                  <TextContent key={index} text={part.value} />
                ))}
              </div>
            )}
          </div>

          <MessageActions
            message={message}
            isUser={isUser}
            isStreaming={isStreaming}
            onUndo={onUndo}
            onStop={onStop}
          />
        </div>

        {isUser && (
          showAvatar ? (
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
              我
            </div>
          ) : (
            <div className="w-9 shrink-0" />
          )
        )}
      </div>
    </>
  );
});

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamBuffer: string;
  taskSummary: string;
  onUndo?: (messageId: string) => void;
  onStop?: () => void;
}

function StreamDisplay({ isStreaming, streamBuffer }: { isStreaming: boolean; streamBuffer: string }) {
  if (!isStreaming && !streamBuffer) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
          AI
        </div>
        <div className="min-w-0 flex-1" style={{ maxWidth: "86%" }}>
          <div className="rounded-lg px-4 py-3" style={{ background: "rgba(255, 255, 255, 0.82)", border: "1px solid var(--accent-border)", boxShadow: "none" }}>
            {streamBuffer ? (
              <pre className="m-0 whitespace-pre-wrap" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", lineHeight: 1.65 }}>
                {streamBuffer}
                <span className="ml-1 inline-block h-4 w-1 animate-pulse align-text-bottom" style={{ background: "var(--accent)" }} />
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
                Agent 正在处理
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentTypingIndicator() {
  const agentTyping = useChatStore((state) => state.agentTyping);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const typing = activeConversationId ? (agentTyping[activeConversationId] ?? []) : [];
  if (typing.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: "#5f6368" }}>
          AG
        </div>
        <div className="rounded-lg px-3 py-2 text-xs" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          {typing.map((id) => AGENT_META[id]?.label ?? id).join("、")} 正在输入
        </div>
      </div>
    </div>
  );
}

export const MessageList = memo(function MessageList({
  messages,
  isStreaming,
  streamBuffer,
  taskSummary,
  onUndo,
  onStop,
}: MessageListProps) {
  const { messageFilter, messageSearchQuery, activeConversationId, streamingMessages } = useChatStore();
  const activeStreamingMessages = activeConversationId ? (streamingMessages[activeConversationId] ?? {}) : {};
  const hasInlineStreamingMessages = Object.keys(activeStreamingMessages).length > 0;
  const hasAgentOutput = messages.some((message) => message.type === "agent_message");

  const filtered = useMemo(() => {
    return collapseTaskLifecycleMessages(messages)
      .filter((message) => message.content !== "[AGENT_START]" && message.content !== "[AGENT_END]")
      .filter((message) => {
        if (messageFilter === "all") return true;
        if (messageFilter === "system") return message.type === "system";
        if (messageFilter === "agent") return message.type === "agent_message";
        return message.type === "agent_message" && (message.sender === messageFilter || message.senderId === messageFilter);
      })
      .filter((message) => {
        if (!messageSearchQuery.trim()) return true;
        return message.content.toLowerCase().includes(messageSearchQuery.toLowerCase());
      });
  }, [messageFilter, messageSearchQuery, messages]);

  return (
    <div className="flex flex-col pb-3">
      {filtered.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          prevMessage={index > 0 ? filtered[index - 1] : undefined}
          isStreaming={Boolean(activeStreamingMessages[message.id]) || (!hasInlineStreamingMessages && isStreaming && index === filtered.length - 1)}
          onUndo={onUndo}
          onStop={onStop}
        />
      ))}

      <StreamDisplay isStreaming={isStreaming && !hasInlineStreamingMessages} streamBuffer={hasInlineStreamingMessages ? "" : streamBuffer} />
      <AgentTypingIndicator />

      {taskSummary && !isStreaming && !hasAgentOutput && (
        <div className="px-4 py-3">
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: "var(--success)" }}>
              OK
            </div>
            <div className="min-w-0 flex-1" style={{ maxWidth: "86%" }}>
              <div className="rounded-lg px-4 py-3" style={{ background: "var(--success-subtle)", border: "1px solid rgba(24, 128, 56, 0.18)" }}>
                <div className="mb-1 text-xs font-bold" style={{ color: "var(--success)" }}>任务完成</div>
                <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--fg-primary)", lineHeight: 1.65 }}>
                  {taskSummary}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
