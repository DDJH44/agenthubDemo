"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Message } from "@agenthub/shared";
import { createId } from "@/lib/id";
import { useChatStore } from "@/stores/chat-store";

interface ContextReference {
  id: string;
  messageId?: string;
  sourceType: "message" | "quote" | "artifact";
  sender: string;
  senderId?: string;
  title: string;
  content: string;
  createdAt: number;
  pinned?: boolean;
  pinnedAt?: number;
}

const AGENTS = [
  { id: "pmo", label: "PMO", sender: "planner", short: "PMO" },
  { id: "codex", label: "Codex", sender: "coder", short: "CX" },
  { id: "ux-reviewer", label: "UX Reviewer", sender: "refiner", short: "UX" },
];

function formatTime(ts: number) {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function estimateTokens(refs: ContextReference[]) {
  const chars = refs.reduce((sum, ref) => sum + ref.content.length, 0);
  return Math.ceil(chars / 1.5);
}

function clip(value: string, max = 560) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function addLocalMessage(conversationId: string, message: Omit<Message, "id" | "conversationId" | "timestamp">) {
  useChatStore.getState().addMessage(conversationId, {
    id: createId(),
    conversationId,
    timestamp: Date.now(),
    ...message,
  });
}

function Icon({ path, size = 13 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function TinyButton({
  title,
  onClick,
  children,
  tone = "neutral",
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger";
}) {
  const color = tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : "var(--fg-tertiary)";
  const background = tone === "accent" ? "var(--accent-subtle)" : tone === "danger" ? "var(--danger-subtle)" : "var(--surface-low)";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-white)]"
      style={{ color, background, border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}

function ContextChip({
  refItem,
  conversationId,
}: {
  refItem: ContextReference;
  conversationId: string;
}) {
  const toggleContextReferencePin = useChatStore((state) => state.toggleContextReferencePin);
  const removeContextReference = useChatStore((state) => state.removeContextReference);

  const handoff = (agent: (typeof AGENTS)[number]) => {
    addLocalMessage(conversationId, {
      type: "user_message",
      sender: "user",
      content: `@${agent.id} 请基于这条上下文引用继续处理：\n\n> ${clip(refItem.content, 1200)}`,
      mentions: [agent.id],
      payload: {
        contextAction: "context-basket-handoff",
        referenceId: refItem.id,
        title: refItem.title,
      },
    });
    addLocalMessage(conversationId, {
      type: "agent_message",
      sender: agent.sender,
      senderId: agent.id,
      content: `${agent.label} 已接收上下文引用「${refItem.title}」，会把它作为后续处理依据。`,
      payload: {
        contextAction: "context-basket-accepted",
        referenceId: refItem.id,
      },
    });
  };

  return (
    <div
      className="min-w-0 rounded-lg px-2.5 py-2"
      style={{
        background: refItem.pinned ? "var(--accent-subtle)" : "var(--surface-white)",
        border: `1px solid ${refItem.pinned ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {refItem.pinned && (
            <span className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
              固定
            </span>
          )}
          <p className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{refItem.title}</p>
        </div>
        <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-disabled)" }}>{formatTime(refItem.createdAt)}</span>
      </div>

      <p className="line-clamp-2 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>
        {refItem.content}
      </p>

      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              title={`交给 ${agent.label}`}
              onClick={() => handoff(agent)}
              className="h-6 rounded-md px-1.5 text-[10px] font-bold transition-colors hover:bg-[var(--accent-subtle)]"
              style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}
            >
              {agent.short}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            title={refItem.pinned ? "取消固定" : "固定"}
            onClick={() => toggleContextReferencePin(conversationId, refItem.id)}
            className="grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-[var(--surface-low)]"
            style={{ color: refItem.pinned ? "var(--accent)" : "var(--fg-tertiary)" }}
          >
            <Icon path="M12 17v5M5 17h14M7 3h10l-2 8 3 4H6l3-4z" size={12} />
          </button>
          <button
            type="button"
            title="移除"
            onClick={() => removeContextReference(conversationId, refItem.id)}
            className="grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-[var(--danger-subtle)]"
            style={{ color: "var(--fg-tertiary)" }}
          >
            <Icon path="M18 6 6 18M6 6l12 12" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ContextBasketProps {
  conversationId: string | null;
  onOpenContextPanel: () => void;
}

export function ContextBasket({ conversationId, onOpenContextPanel }: ContextBasketProps) {
  const [expanded, setExpanded] = useState(false);
  const contextReferences = useChatStore((state) => state.contextReferences);
  const clearContextReferences = useChatStore((state) => state.clearContextReferences);

  const refs = useMemo(() => {
    if (!conversationId) return [];
    return ((contextReferences[conversationId] ?? []) as ContextReference[]).slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.pinnedAt ?? b.createdAt) - (a.pinnedAt ?? a.createdAt);
    });
  }, [contextReferences, conversationId]);

  if (!conversationId || refs.length === 0) return null;

  const visibleRefs = expanded ? refs : refs.slice(0, 2);
  const pinnedCount = refs.filter((ref) => ref.pinned).length;

  const summarize = () => {
    addLocalMessage(conversationId, {
      type: "agent_message",
      sender: "planner",
      senderId: "pmo",
      content: `PMO 已整理上下文篮子：当前包含 ${refs.length} 条消息引用，其中 ${pinnedCount} 条已固定，约 ${estimateTokens(refs).toLocaleString()} tokens。后续任务会优先使用固定引用，再结合最近加入的上下文继续处理。`,
      payload: {
        contextAction: "context-basket-summary",
        referenceIds: refs.map((ref) => ref.id),
      },
    });
  };

  return (
    <div className="px-3 py-2" style={{ background: "var(--surface-white)", borderBottom: "1px solid var(--divider)" }}>
      <div className="rounded-xl px-3 py-2" style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}>
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
              <Icon path="M4 4h16v5H4zM4 15h7v5H4zM15 15h5v5h-5z" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold" style={{ color: "var(--fg-primary)" }}>上下文篮子</p>
              <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                {refs.length} 条引用 · {pinnedCount} 固定 · 约 {estimateTokens(refs).toLocaleString()} tokens
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <TinyButton title="打开完整上下文面板" onClick={onOpenContextPanel}>
              <Icon path="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" size={12} />
              面板
            </TinyButton>
            <TinyButton title="生成上下文摘要" onClick={summarize} tone="accent">
              摘要
            </TinyButton>
            {refs.length > 2 && (
              <TinyButton title={expanded ? "收起引用" : "展开全部引用"} onClick={() => setExpanded((value) => !value)}>
                {expanded ? "收起" : `展开 ${refs.length}`}
              </TinyButton>
            )}
            <TinyButton title="清空上下文篮子" onClick={() => clearContextReferences(conversationId)} tone="danger">
              清空
            </TinyButton>
          </div>
        </div>

        <div className={`grid gap-2 ${expanded ? "max-h-44 overflow-y-auto pr-1 custom-scrollbar" : "md:grid-cols-2"}`}>
          {visibleRefs.map((ref) => (
            <ContextChip key={ref.id} refItem={ref} conversationId={conversationId} />
          ))}
        </div>
      </div>
    </div>
  );
}
