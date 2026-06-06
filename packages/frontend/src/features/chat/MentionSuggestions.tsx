"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MentionSuggestionOption {
  name: string;
  role?: string;
  description?: string;
  color?: string;
  badge?: string;
  enabled?: boolean;
}

interface Props {
  query: string;
  agents: MentionSuggestionOption[];
  onSelect: (name: string) => void;
  onDismiss: () => void;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getBadge(agent: MentionSuggestionOption) {
  const source = agent.badge || agent.name;
  return source.trim().slice(0, 2).toUpperCase() || "AI";
}

export function MentionSuggestions({ query, agents, onSelect, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return agents;
    return agents.filter((agent) => {
      const haystack = [agent.name, agent.role, agent.description]
        .filter(Boolean)
        .map((item) => normalize(String(item)));
      return haystack.some((item) => item.includes(normalizedQuery));
    });
  }, [agents, query]);

  const filteredNames = filtered.map((agent) => agent.name);
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const selectItem = useCallback((name: string) => {
    onSelect(name);
  }, [onSelect]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onDismiss]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const activeName = filteredNames[clampedIndex];
    const el = activeName ? itemRefs.current.get(activeName) : null;
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, filteredNames, filtered.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (filtered.length === 0) return;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex(Math.min(clampedIndex + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex(Math.max(clampedIndex - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (filteredNames[clampedIndex]) selectItem(filteredNames[clampedIndex]);
          break;
        case "Escape":
          event.preventDefault();
          onDismiss();
          break;
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [filtered.length, filteredNames, clampedIndex, selectItem, onDismiss]);

  return (
    <div
      ref={ref}
      className="absolute z-50 overflow-hidden rounded-xl animate-fade-in-up"
      style={{
        bottom: "100%",
        left: 8,
        marginBottom: 8,
        width: "min(360px, calc(100vw - 48px))",
        background: "var(--surface-white)",
        border: "1px solid var(--border)",
        boxShadow: "0 18px 48px rgba(69, 82, 126, 0.18)",
      }}
    >
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--fg-tertiary)", letterSpacing: 0 }}>
          选择群聊智能体
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-xs" style={{ color: "var(--fg-tertiary)" }}>
          {agents.length === 0 ? "正在读取群聊智能体..." : "没有匹配的智能体"}
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto py-1 custom-scrollbar">
          {filtered.map((agent, index) => (
            <button
              key={agent.name}
              type="button"
              onClick={() => selectItem(agent.name)}
              ref={(el) => {
                if (el) itemRefs.current.set(agent.name, el);
                else itemRefs.current.delete(agent.name);
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all"
              style={{
                background: index === clampedIndex ? "var(--accent-subtle)" : "transparent",
                animationDelay: `${index * 40}ms`,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                style={{ background: agent.color ?? "var(--accent)" }}
              >
                {getBadge(agent)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate" style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-primary)" }}>
                    @{agent.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5"
                    style={{
                      fontSize: "var(--text-2xs)",
                      color: agent.enabled === false ? "var(--fg-tertiary)" : "var(--success)",
                      background: agent.enabled === false ? "var(--surface-low)" : "var(--success-subtle)",
                    }}
                  >
                    {agent.enabled === false ? "静音" : "可用"}
                  </span>
                </div>
                <p className="mt-1 truncate" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                  {agent.role || agent.description || "Agent"}
                </p>
              </div>
              <span style={{ fontSize: "var(--text-2xs)", color: index === clampedIndex ? "var(--accent)" : "var(--fg-disabled)" }}>
                Enter
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderTop: "1px solid var(--border)", color: "var(--fg-tertiary)", fontSize: "var(--text-2xs)" }}
      >
        <span>↑↓ 选择</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
