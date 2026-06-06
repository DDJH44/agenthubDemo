"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MentionSuggestions, type MentionSuggestionOption } from "./MentionSuggestions";
import {
  getWorkflowNodeLabels,
  getWorkflowReferencePrompt,
  loadSavedWorkflows,
  SAVED_WORKFLOWS_EVENT,
  SAVED_WORKFLOWS_KEY,
  type SavedWorkflowSnapshot,
} from "@/features/workflows/saved-workflows";

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
  mentionOptions?: MentionSuggestionOption[];
  contextCount?: number;
  workflowReference?: SavedWorkflowSnapshot | null;
  onWorkflowReferenceChange?: (workflow: SavedWorkflowSnapshot | null) => void;
}

interface MentionRange {
  start: number;
  end: number;
  query: string;
}

function normalizeMention(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getCursorMentionRange(value: string, cursorPos: number, options: MentionSuggestionOption[]): MentionRange | null {
  const beforeCursor = value.slice(0, cursorPos);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) return null;
  if (atIndex > 0 && /\S/.test(beforeCursor[atIndex - 1])) return null;

  const query = beforeCursor.slice(atIndex + 1);
  if (query.includes("\n") || query.length > 80) return null;
  if (/[,\uFF0C.\u3002!?\uFF01\uFF1F;\uFF1B:\uFF1A()[\]{}<>]/.test(query)) return null;

  const normalizedQuery = normalizeMention(query);
  if (normalizedQuery.includes(" ")) {
    const stillMatchesAgent = options.some((option) => normalizeMention(option.name).startsWith(normalizedQuery));
    if (!stillMatchesAgent) return null;
  }

  return { start: atIndex, end: cursorPos, query };
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
  mentionOptions = [],
  contextCount = 0,
  workflowReference = null,
  onWorkflowReferenceChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const isGroup = conversationMode === "group";
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowSnapshot[]>([]);
  const [isWorkflowMenuOpen, setIsWorkflowMenuOpen] = useState(false);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);

  const fitTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "38px";
    el.style.height = `${Math.min(132, Math.max(38, el.scrollHeight))}px`;
  }, []);

  const updateMentionRange = useCallback((nextValue: string, cursorPos: number) => {
    setMentionRange(isGroup ? getCursorMentionRange(nextValue, cursorPos, mentionOptions) : null);
  }, [isGroup, mentionOptions]);

  const handleChange = useCallback((nextValue: string, cursorPos: number) => {
    onChange(nextValue);
    window.requestAnimationFrame(fitTextarea);
    updateMentionRange(nextValue, cursorPos);
  }, [fitTextarea, onChange, updateMentionRange]);

  useEffect(() => {
    fitTextarea();
  }, [fitTextarea, value]);

  useEffect(() => {
    if (!value.trim() && workflowReference) onWorkflowReferenceChange?.(null);
  }, [onWorkflowReferenceChange, value, workflowReference]);

  useEffect(() => {
    const refreshSavedWorkflows = () => setSavedWorkflows(loadSavedWorkflows());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SAVED_WORKFLOWS_KEY) refreshSavedWorkflows();
    };
    const handlePointerDown = (event: MouseEvent) => {
      const menu = workflowMenuRef.current;
      if (!menu || !(event.target instanceof Node) || menu.contains(event.target)) return;
      setIsWorkflowMenuOpen(false);
    };

    refreshSavedWorkflows();
    window.addEventListener(SAVED_WORKFLOWS_EVENT, refreshSavedWorkflows);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener(SAVED_WORKFLOWS_EVENT, refreshSavedWorkflows);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;

    setMentionRange(null);
    onSend();
  }, [disabled, isSending, onSend, value]);

  const handleMentionClick = () => {
    const el = textareaRef.current;
    if (!el) {
      onMention();
      return;
    }

    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const insert = before && !/\s$/.test(before) ? " @" : "@";
    const nextValue = `${before}${insert}${after}`;
    const nextCursor = before.length + insert.length;
    onChange(nextValue);
    setIsWorkflowMenuOpen(false);
    setMentionRange({ start: nextCursor - 1, end: nextCursor, query: "" });
    window.requestAnimationFrame(() => {
      fitTextarea();
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertMention = useCallback((name: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const range = mentionRange ?? getCursorMentionRange(value, cursor, mentionOptions);
    if (!range) return;

    const inserted = `@${name} `;
    const nextValue = `${value.slice(0, range.start)}${inserted}${value.slice(range.end)}`;
    const nextCursor = range.start + inserted.length;
    onChange(nextValue);
    setMentionRange(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      fitTextarea();
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  }, [fitTextarea, mentionOptions, mentionRange, onChange, value]);

  const insertWorkflowReference = (workflow: SavedWorkflowSnapshot) => {
    const prompt = getWorkflowReferencePrompt(workflow);
    const nextValue = value.trim()
      ? `${value.trimEnd()}\n\n${prompt}`
      : prompt;
    onChange(nextValue);
    onWorkflowReferenceChange?.(workflow);
    setIsWorkflowMenuOpen(false);
    window.requestAnimationFrame(() => {
      fitTextarea();
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="px-3 py-2" style={{ background: "var(--surface-white)" }}>
      <div ref={workflowMenuRef} className="relative">
        <div className="overflow-hidden rounded-xl" style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
        <div className="flex min-h-9 items-center justify-between gap-3 px-2.5 pt-2">
          <div className="flex min-w-0 items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <span className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-bold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
              回复
            </span>
            {isGroup && (
              <span className="hidden h-6 items-center rounded-md px-2 text-[11px] font-semibold sm:inline-flex" style={{ color: "var(--fg-tertiary)" }}>
                群聊协作
              </span>
            )}
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            {contextCount > 0 && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                上下文 {contextCount}
              </span>
            )}
            {workflowReference && (
              <span className="inline-flex max-w-[180px] items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                <span className="truncate">工作流 {workflowReference.name}</span>
                <button
                  type="button"
                  onClick={() => onWorkflowReferenceChange?.(null)}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-[var(--surface-white)]"
                  aria-label="取消引用工作流"
                >
                  ×
                </button>
              </span>
            )}
            {isGroup && (
              <button
                type="button"
                onClick={handleMentionClick}
                className="hidden rounded-full px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--accent-subtle)] sm:inline-flex"
                style={{ color: "var(--accent)", border: "1px solid var(--accent-border)" }}
              >
                @Agent
              </button>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={handleMentionClick}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)] disabled:opacity-40"
            style={{ color: "var(--fg-tertiary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            title="提及 Agent"
          >
            <Icon path="M16 8a6 6 0 10-2 4.47V14a2 2 0 104 0v-2a6 6 0 10-6 6" />
          </button>

          <button
            type="button"
            onClick={() => setIsWorkflowMenuOpen((open) => !open)}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)] disabled:opacity-40"
            style={{
              color: isWorkflowMenuOpen ? "var(--accent)" : "var(--fg-tertiary)",
              background: isWorkflowMenuOpen ? "var(--accent-subtle)" : "var(--surface-white)",
              border: `1px solid ${isWorkflowMenuOpen ? "var(--accent-border)" : "var(--border)"}`,
            }}
            title="引用工作流"
            aria-expanded={isWorkflowMenuOpen}
          >
            <Icon path="M6 3v5M18 16v5M6 8a3 3 0 100 6 3 3 0 000-6zM18 10a3 3 0 100 6 3 3 0 000-6zM9 11.5h6" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
            onSelect={(event) => updateMentionRange(value, event.currentTarget.selectionStart ?? value.length)}
            onKeyUp={(event) => updateMentionRange(value, event.currentTarget.selectionStart ?? value.length)}
            onKeyDown={(event) => {
              if (mentionRange && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder ?? (isGroup ? "@Codex 处理这段代码，或直接输入任务" : "输入消息")}
            disabled={disabled}
            rows={1}
            className="custom-scrollbar min-h-10 flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:bg-[var(--surface-white)]"
            style={{ color: "var(--fg-primary)", background: "var(--surface-white)", maxHeight: 132, lineHeight: 1.5, border: "1px solid var(--border)" }}
          />

          <button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)] disabled:opacity-40"
            style={{ color: "var(--fg-tertiary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            title="添加附件"
          >
            <Icon path="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={disabled || isSending || !value.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-semibold transition-transform active:scale-95"
            style={{
              background: disabled || isSending || !value.trim() ? "var(--surface-white)" : "var(--accent)",
              color: disabled || isSending || !value.trim() ? "var(--fg-disabled)" : "#fff",
              border: `1px solid ${disabled || isSending || !value.trim() ? "var(--border)" : "var(--accent)"}`,
              boxShadow: disabled || isSending || !value.trim() ? "none" : "var(--accent-glow)",
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

        {(disabled || value.length > 0) && (
          <div className="flex min-h-7 items-center justify-between gap-3 px-3 pb-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {disabled && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: "var(--warning)", background: "var(--warning-subtle)" }}>
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
        )}
        </div>

        {isGroup && mentionRange && (
          <MentionSuggestions
            query={mentionRange.query}
            agents={mentionOptions}
            onSelect={insertMention}
            onDismiss={() => setMentionRange(null)}
          />
        )}

        {isWorkflowMenuOpen && (
          <div
            className="absolute bottom-[calc(100%+8px)] left-2 z-50 w-80 max-w-[calc(100vw-40px)] rounded-xl p-2"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "0 18px 48px rgba(69, 82, 126, 0.18)" }}
          >
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <p className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>引用工作流</p>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                {savedWorkflows.length}
              </span>
            </div>
            {savedWorkflows.length === 0 ? (
              <div className="rounded-lg px-3 py-3 text-xs leading-5" style={{ background: "var(--page-bg)", color: "var(--fg-tertiary)", border: "1px dashed var(--border)" }}>
                暂无可引用工作流。先到工作流页选择模板、命名并保存，就能在这里直接调用。
              </div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto custom-scrollbar pr-0.5">
                {savedWorkflows.slice(0, 8).map((workflow) => {
                  const labels = getWorkflowNodeLabels(workflow, 4);
                  return (
                    <button
                      key={workflow.id}
                      type="button"
                      onClick={() => insertWorkflowReference(workflow)}
                      className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-[var(--accent-subtle)]"
                      style={{ border: "1px solid transparent" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{workflow.name}</span>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                          {workflow.nodes.length} 节点
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                        {labels.length ? labels.join(" -> ") : workflow.task || "未设置默认输入"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
