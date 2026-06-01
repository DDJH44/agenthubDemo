"use client";

import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Message } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { ArtifactCard, type ArtifactCardType } from "./ArtifactCard";

const AGENT_META: Record<string, { label: string; badge: string; color: string }> = {
  planner: { label: "PMO 主 Agent", badge: "PMO", color: "#174ea6" },
  pmo: { label: "PMO 主 Agent", badge: "PMO", color: "#174ea6" },
  researcher: { label: "Researcher", badge: "R", color: "#0e7490" },
  coder: { label: "Codex", badge: "CX", color: "#0f766e" },
  codex: { label: "Codex", badge: "CX", color: "#0f766e" },
  worker: { label: "Worker Agent", badge: "W", color: "#5f6368" },
  "claude-code": { label: "Claude Code", badge: "CL", color: "#9a6700" },
  "open-code": { label: "Open Code", badge: "OC", color: "#7c3aed" },
  critic: { label: "Critic", badge: "CR", color: "#a50e0e" },
  refiner: { label: "UX Reviewer", badge: "UX", color: "#a50e0e" },
  "ux-reviewer": { label: "自建 UX Reviewer", badge: "UX", color: "#a50e0e" },
  assistant: { label: "Assistant", badge: "AI", color: "#5f6368" },
  system: { label: "系统", badge: "SYS", color: "#5f6368" },
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

function getSenderMeta(message: Message) {
  if (message.type === "user_message" || message.sender === "user") {
    return { label: "我", badge: "我", color: "#174ea6" };
  }
  const key = message.senderId || message.sender || "assistant";
  return AGENT_META[key] ?? AGENT_META[message.sender] ?? {
    label: message.sender || "Agent",
    badge: (message.sender || "A").slice(0, 2).toUpperCase(),
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

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} style={{ background: "var(--surface-low)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "#174ea6" }}>
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
            <blockquote key={index} className="rounded-md px-3 py-2 text-xs" style={{ borderLeft: "3px solid #174ea6", background: "rgba(23, 78, 166, 0.06)", color: "var(--fg-secondary)" }}>
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

function splitCodeBlocks(content: string) {
  const parts: Array<{ type: "text" | "code"; value: string; language?: string }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", value: match[2].trim(), language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text" as const, value: content }];
}

function InlineCodeBlock({ code, language }: { code: string; language?: string }) {
  return <ArtifactCard type="code" content={code} language={language} filename={language ? `snippet.${language}` : "snippet.txt"} />;
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
    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button type="button" onClick={copy} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: copied ? "var(--success)" : "var(--fg-tertiary)" }}>
        {copied ? "已复制" : "复制"}
      </button>
      <button type="button" onClick={addToContext} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: referenced ? "var(--success)" : "var(--fg-tertiary)" }}>
        {referenced ? "已加入" : "加入上下文"}
      </button>
      <button type="button" onClick={() => handoffToAgent("pmo", "PMO", "planner")} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-tertiary)" }}>
        交 PMO
      </button>
      <button type="button" onClick={() => handoffToAgent("codex", "Codex", "coder")} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-tertiary)" }}>
        交 Codex
      </button>
      <button type="button" onClick={() => handoffToAgent("ux-reviewer", "UX Reviewer", "refiner")} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-tertiary)" }}>
        交 UX
      </button>
      {isStreaming && onStop && (
        <button type="button" onClick={onStop} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "#174ea6" }}>
          暂停
        </button>
      )}
      {isUser && onUndo && (
        <button type="button" onClick={() => onUndo(message.id)} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-tertiary)" }}>
          撤回
        </button>
      )}
      <button type="button" onClick={() => deleteMessage(message.conversationId, message.id)} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--danger)" }}>
        删除
      </button>
    </div>
  );
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
  const setCurrentPreview = useChatStore((state) => state.setCurrentPreview);
  const { hasThinking, main } = extractDisplayContent(message.content);
  const displayContent = main || message.content;
  const artifactId = String(payload?.artifactId || payload?.modifiedArtifactId || payload?.originalArtifactId || message.id);
  const artifactFilename = payload?.filename as string | undefined;
  const previewArtifact = (type: string, content: string, filename?: string) => {
    setCurrentPreview({
      artifactId,
      type,
      content,
      filename,
    });
  };
  const htmlLike = !artifactType && !["diff_card", "deploy_card", "preview_card"].includes(message.type) &&
    (displayContent.includes("<!DOCTYPE html>") || displayContent.includes("<html"));
  const parts = useMemo(() => splitCodeBlocks(displayContent), [displayContent]);

  const showAvatar = !prevMessage || prevMessage.sender !== message.sender || prevMessage.senderId !== message.senderId || message.timestamp - prevMessage.timestamp > 5 * 60 * 1000;
  const showDate = prevMessage && message.timestamp - prevMessage.timestamp > 30 * 60 * 1000;

  if (isSystem) {
    return (
      <div className="px-4 py-2">
        <div className="mx-auto w-fit max-w-[82%] rounded-md px-3 py-1.5 text-center text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
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
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: senderMeta.color }}>
              {senderMeta.badge}
            </div>
          ) : (
            <div className="w-9 shrink-0" />
          )
        )}

        <div className="min-w-0" style={{ maxWidth: isUser ? "72%" : "86%" }}>
          {showAvatar && (
            <div className={`mb-1 flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
              <span className="text-xs font-bold" style={{ color: isUser ? "#174ea6" : "var(--fg-secondary)" }}>
                {senderMeta.label}
              </span>
              <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>{formatTime(message.timestamp)}</span>
            </div>
          )}

          <div
            className="overflow-hidden rounded-lg"
            style={{
              background: isUser ? "#174ea6" : "var(--surface-white)",
              color: isUser ? "#fff" : "var(--fg-primary)",
              border: isUser ? "none" : "1px solid var(--border)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            {message.type === "diff_card" && (
              <ArtifactCard type="diff" content={message.content} filename={String(payload?.fileName || "diff")} />
            )}

            {(message.type === "deploy_card" || message.type === "preview_card") && (
              <ArtifactCard
                type={message.type === "deploy_card" ? "deploy_url" : "preview_url"}
                content={message.content}
                deployUrl={payload?.url as string | undefined}
                deployStatus={payload?.status as string | undefined}
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
                onPreview={artifactType === "slides" ? undefined : () => previewArtifact(artifactType, message.content, artifactFilename)}
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

            {!artifactType && !htmlLike && !["diff_card", "deploy_card", "preview_card"].includes(message.type) && (
              <div className="px-4 py-3">
                {hasThinking && (
                  <div className="mb-2 w-fit rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: isUser ? "rgba(255,255,255,0.16)" : "var(--surface-low)" }}>
                    已省略思考过程
                  </div>
                )}
                {parts.map((part, index) => part.type === "code" ? (
                  <InlineCodeBlock key={index} code={part.value} language={part.language} />
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
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "#174ea6" }}>
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
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "#174ea6" }}>
          AI
        </div>
        <div className="min-w-0 flex-1" style={{ maxWidth: "86%" }}>
          <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-white)", border: "1px solid rgba(23, 78, 166, 0.16)", boxShadow: "var(--shadow-xs)" }}>
            {streamBuffer ? (
              <pre className="m-0 whitespace-pre-wrap" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", lineHeight: 1.65 }}>
                {streamBuffer}
                <span className="ml-1 inline-block h-4 w-1 animate-pulse align-text-bottom" style={{ background: "#174ea6" }} />
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#174ea6" }} />
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
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "#5f6368" }}>
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
  const { messageFilter, messageSearchQuery } = useChatStore();

  const filtered = useMemo(() => {
    return messages
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
          isStreaming={isStreaming && index === filtered.length - 1}
          onUndo={onUndo}
          onStop={onStop}
        />
      ))}

      <StreamDisplay isStreaming={isStreaming} streamBuffer={streamBuffer} />
      <AgentTypingIndicator />

      {taskSummary && !isStreaming && (
        <div className="px-4 py-3">
          <div className="flex gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: "var(--success)" }}>
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
