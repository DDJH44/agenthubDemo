"use client";

import { useMemo } from "react";
import type { AgentExecutionContextSummary, Message } from "@agenthub/shared";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationAgentStore } from "@/stores/conversation-agent-store";
import { useConversationMemberStore } from "@/stores/conversation-member-store";

interface Props {
  conversationId: string;
  disabled?: boolean;
  isStreaming?: boolean;
  onToggleAgentMode: (enabled: boolean) => void;
}

const MAX_ITEMS = 4;
const AGENT_START_MARKER = "[AGENT_START]";
const AGENT_END_MARKER = "[AGENT_END]";

function compactLine(value: string, max = 90) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isHumanMessage(message: Message) {
  return message.type === "user_message" || message.sender === "user";
}

function isConstraintLine(text: string) {
  return /必须|需要|不要|不能|支持|轻量|简洁|简约|移动端|响应式|部署|导出|权限|本地|数据库/i.test(text);
}

function isQuestionLine(text: string) {
  return /[?？]$/.test(text.trim()) || /是否|还是|要不要|能不能|可以吗|怎么/.test(text);
}

function uniquePush(list: string[], item: string) {
  const value = compactLine(item);
  if (!value || list.includes(value)) return;
  list.push(value);
}

function getScopedMessages(messages: Message[]) {
  let active = false;
  let hasBoundary = false;
  const scoped: Message[] = [];

  for (const message of messages) {
    if (message.content === AGENT_START_MARKER) {
      active = true;
      hasBoundary = true;
      continue;
    }
    if (message.content === AGENT_END_MARKER) {
      active = false;
      hasBoundary = true;
      continue;
    }
    if (active) scoped.push(message);
  }

  return hasBoundary ? scoped : messages;
}

export function buildExecutionContextSummary(messages: Message[], draft: string): AgentExecutionContextSummary {
  const humanMessages = getScopedMessages(messages).filter(isHumanMessage).slice(-16);
  const lines = humanMessages
    .map((message) => compactLine(message.content, 160))
    .filter(Boolean);
  const draftLine = compactLine(draft, 160);
  const allLines = draftLine ? [...lines, draftLine] : lines;

  const goal =
    draftLine ||
    [...allLines].reverse().find((line) => /生成|创建|做|实现|优化|部署|设计|开发|检查|修复/.test(line)) ||
    allLines.at(-1) ||
    "根据群聊讨论继续执行当前任务";

  const confirmed: string[] = [];
  const constraints: string[] = [];
  const openQuestions: string[] = [];
  const references: string[] = [];

  for (const line of allLines) {
    if (line.includes("附件") || line.includes("图片") || line.includes("文件") || line.includes("工作流")) {
      uniquePush(references, line);
    }
    if (isQuestionLine(line)) {
      uniquePush(openQuestions, line);
      continue;
    }
    if (isConstraintLine(line)) uniquePush(constraints, line);
    uniquePush(confirmed, line);
  }

  return {
    goal,
    confirmed: confirmed.slice(-MAX_ITEMS),
    constraints: constraints.slice(-MAX_ITEMS),
    references: references.slice(-MAX_ITEMS),
    openQuestions: openQuestions.slice(-MAX_ITEMS),
    sourceMessageCount: humanMessages.length,
    generatedAt: Date.now(),
  };
}

export function MultiUserExecutionGate({ conversationId, disabled, isStreaming, onToggleAgentMode }: Props) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const agents = useConversationAgentStore((state) => state.agentsByConversation[conversationId] ?? []);
  const members = useConversationMemberStore((state) => state.membersByConversation[conversationId] ?? []);

  const realMembers = useMemo(() => members.filter((member) => member.role !== "agent"), [members]);
  const owner = realMembers.find((member) => member.role === "owner") ?? realMembers[0];
  const isOwner = Boolean(currentUserId && owner?.userId === currentUserId);
  const agentsEnabled = agents.some((agent) => agent.enabled);
  const canToggle = !disabled && !isStreaming && isOwner;
  const statusLabel = agentsEnabled ? "Agent 已启用" : "Agent 静音中";
  const helperText = agentsEnabled
    ? "后续任务会读取启用区间内的讨论。"
    : "当前是自由讨论区，消息不会触发 Agent。";

  return (
    <div className="px-3 pb-2">
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
        style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: agentsEnabled ? "var(--success)" : "var(--fg-disabled)" }}
            />
            <p className="truncate text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
              {statusLabel}
            </p>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              {realMembers.length} 人群聊
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
            {helperText}{isOwner ? "" : " 仅群主可切换。"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleAgentMode(!agentsEnabled)}
          disabled={!canToggle}
          className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-bold text-white transition-opacity disabled:opacity-45"
          style={{ background: agentsEnabled ? "var(--fg-tertiary)" : "var(--accent)", border: "1px solid transparent" }}
          title={isOwner ? undefined : "仅群主可切换智能体状态"}
        >
          {agentsEnabled ? "静音智能体" : "启用智能体"}
        </button>
      </div>
    </div>
  );
}
