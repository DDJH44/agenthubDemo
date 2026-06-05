"use client";

import { useMemo, useState } from "react";
import type { AgentExecutionContextSummary, Message } from "@agenthub/shared";

interface Props {
  messages: Message[];
  draft: string;
  disabled?: boolean;
  isStreaming?: boolean;
  onConfirm: (summary: AgentExecutionContextSummary) => void;
}

const MAX_ITEMS = 4;

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

export function buildExecutionContextSummary(messages: Message[], draft: string): AgentExecutionContextSummary {
  const humanMessages = messages.filter(isHumanMessage).slice(-16);
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

function SummaryList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold" style={{ color: "var(--fg-secondary)" }}>{title}</p>
      <div className="mt-1 space-y-1">
        {(items.length > 0 ? items : [empty]).map((item, index) => (
          <p key={`${title}-${index}`} className="truncate text-[11px]" style={{ color: items.length > 0 ? "var(--fg-tertiary)" : "var(--fg-disabled)" }}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export function MultiUserExecutionGate({ messages, draft, disabled, isStreaming, onConfirm }: Props) {
  const [summary, setSummary] = useState<AgentExecutionContextSummary | null>(null);
  const previewSummary = useMemo(() => summary ?? buildExecutionContextSummary(messages, draft), [draft, messages, summary]);
  const canConfirm = !disabled && !isStreaming && previewSummary.goal.trim().length > 0;

  const handleBuildSummary = () => {
    setSummary(buildExecutionContextSummary(messages, draft));
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(previewSummary);
    setSummary(null);
  };

  return (
    <div className="px-3 pb-2">
      <div
        className="rounded-xl px-3 py-2"
        style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: summary ? "var(--accent)" : "var(--fg-disabled)" }} />
              <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                {summary ? "上下文已过滤" : "讨论中 · Agent 已静音"}
              </p>
            </div>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              2 人以上群聊会先保留人类讨论，确认执行后 PMO 才读取过滤摘要。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleBuildSummary}
              disabled={disabled}
              className="h-7 rounded-lg px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
              style={{ color: "var(--fg-secondary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            >
              整理上下文
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="h-7 rounded-lg px-3 text-[11px] font-bold text-white transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", border: "1px solid var(--accent)" }}
            >
              确认执行
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-3 grid gap-2 rounded-lg p-2 sm:grid-cols-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold" style={{ color: "var(--fg-secondary)" }}>执行目标</p>
              <p className="mt-1 text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{summary.goal}</p>
            </div>
            <SummaryList title="已确认" items={summary.confirmed} empty="暂无明确确认项" />
            <SummaryList title="约束" items={summary.constraints} empty="暂无额外约束" />
            <SummaryList title="引用" items={summary.references} empty="暂无引用资料" />
            <SummaryList title="待确认" items={summary.openQuestions} empty="暂无冲突问题" />
          </div>
        )}
      </div>
    </div>
  );
}
