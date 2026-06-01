"use client";

import { useCallback, useEffect, useRef } from "react";
import { parseMentions } from "@agenthub/shared";

interface Props {
  onAttach: () => void;
  onSend: () => void;
  onMention: () => void;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  conversationMode?: "single" | "group";
  onAssignAgent?: (agentId: string, content: string) => void;
  onMentionQueryChange?: (query: string | null) => void;
  contextCount?: number;
}

function getCursorMentionQuery(value: string, cursorPos: number): string | null {
  const beforeCursor = value.slice(0, cursorPos);
  const match = beforeCursor.match(/@([\w-]*)$/);
  return match ? match[1] : null;
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function QuickReplyBar({
  onAttach,
  onSend,
  onMention,
  value,
  onChange,
  placeholder,
  disabled,
  isSending,
  conversationMode,
  onAssignAgent,
  onMentionQueryChange,
  contextCount = 0,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fitTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "36px";
    el.style.height = `${Math.min(132, Math.max(36, el.scrollHeight))}px`;
  }, []);

  const handleChange = useCallback((nextValue: string) => {
    onChange(nextValue);
    window.requestAnimationFrame(fitTextarea);
    if (onMentionQueryChange) {
      const cursorPos = textareaRef.current?.selectionStart ?? nextValue.length;
      onMentionQueryChange(getCursorMentionQuery(nextValue, cursorPos));
    }
  }, [fitTextarea, onChange, onMentionQueryChange]);

  useEffect(() => {
    fitTextarea();
  }, [fitTextarea, value]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;

    if (conversationMode === "group" && onAssignAgent) {
      const parsed = parseMentions(trimmed);
      if (parsed.agents.length > 0) {
        for (const agentId of parsed.agents) {
          onAssignAgent(agentId, parsed.cleanText || trimmed);
        }
        onChange("");
        return;
      }
    }

    onSend();
  }, [conversationMode, disabled, isSending, onAssignAgent, onChange, onSend, value]);

  const handleMentionClick = () => {
    onMention();
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = el.value.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      onMentionQueryChange?.("");
    }, 0);
  };

  return (
    <div className="flex flex-col" style={{ background: "var(--surface-white)" }}>
      {conversationMode === "group" && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
            群聊模式：输入 @Agent 可以直接分配任务
          </span>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-3">
        <button
          type="button"
          onClick={handleMentionClick}
          disabled={disabled}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
          style={{ color: "var(--fg-tertiary)" }}
          title="提及 Agent"
        >
          <Icon path="M16 8a6 6 0 10-2 4.47V14a2 2 0 104 0v-2a6 6 0 10-6 6" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? (conversationMode === "group" ? "@Codex 处理这段代码，或直接输入任务" : "输入消息")}
          disabled={disabled}
          rows={1}
          className="custom-scrollbar min-h-9 flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:bg-[var(--surface-white)]"
          style={{ color: "var(--fg-primary)", background: "#f8faff", maxHeight: 132, lineHeight: 1.5, border: "1px solid var(--border)" }}
        />

        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
          style={{ color: "var(--fg-tertiary)" }}
          title="添加附件"
        >
          <Icon path="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || isSending || !value.trim()}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-semibold transition-transform active:scale-95"
          style={{
            background: disabled || isSending || !value.trim() ? "var(--surface-low)" : "var(--accent)",
            color: disabled || isSending || !value.trim() ? "var(--fg-disabled)" : "#fff",
          }}
          title="发送"
        >
          {isSending ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <Icon path="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          )}
        </button>
      </div>

      <div className="flex min-h-7 items-center justify-between gap-3 px-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {contextCount > 0 && (
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
              上下文 {contextCount}
            </span>
          )}
          {disabled && (
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--warning)", background: "var(--warning-subtle)" }}>
              未连接
            </span>
          )}
        </div>
        {value.length > 0 && (
          <span className="shrink-0 text-[10px]" style={{ color: value.length > 1800 ? "var(--warning)" : "var(--fg-tertiary)" }}>
            {value.length}
          </span>
        )}
      </div>
    </div>
  );
}
