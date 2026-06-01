"use client";

import { useState } from "react";
import type { UserAgent } from "@agenthub/shared";
import { MAIN_AGENT, MAIN_AGENT_ID, AGENT_ROLE_LABELS } from "@agenthub/shared";
import { useUserAgentStore } from "@/stores/user-agent-store";

interface AgentSelectListProps {
  mode: "single" | "multi";
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function AgentSelectList({ mode, selected, onChange }: AgentSelectListProps) {
  const { agents } = useUserAgentStore();
  const [search, setSearch] = useState("");

  const allAgents: UserAgent[] = [MAIN_AGENT, ...agents];
  const filtered = search
    ? allAgents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : allAgents;

  const handleToggle = (id: string) => {
    if (id === MAIN_AGENT_ID) return;
    if (mode === "single") {
      onChange([id]);
    } else {
      if (selected.includes(id)) {
        onChange(selected.filter((s) => s !== id));
      } else {
        onChange([...selected, id]);
      }
    }
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: 280 }}>
      <div className="px-1 pb-2">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.6" strokeLinecap="round">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索智能体..."
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 px-1">
        {filtered.map((agent) => {
          const isMain = agent.id === MAIN_AGENT_ID;
          const isSelected = isMain || selected.includes(agent.id);

          return (
            <button
              key={agent.id}
              onClick={() => handleToggle(agent.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${!isSelected && !isMain ? "hover:bg-[var(--surface-low)]" : ""}`}
              style={{
                background: isSelected ? "var(--accent-subtle)" : "transparent",
                cursor: isMain ? "default" : "pointer",
              }}
            >
              <div
                className="rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ width: 32, height: 32, background: agent.avatarBg, fontSize: 14 }}
              >
                {agent.avatar ? agent.avatar : agent.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>
                    {agent.name}
                  </span>
                  {isMain ? (
                    <span className="rounded px-1.5 py-px" style={{ fontSize: 9, fontWeight: 600, background: "var(--accent-subtle)", color: "var(--accent)" }}>
                      主
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-px" style={{ fontSize: 9, fontWeight: 500, background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
                      {AGENT_ROLE_LABELS[agent.role]}
                    </span>
                  )}
                </div>
                <p className="truncate" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 1 }}>
                  {agent.systemPrompt.slice(0, 50)}...
                </p>
              </div>
              <div className="shrink-0">
                {isMain ? (
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ fontSize: 9, fontWeight: 600, background: "var(--accent)", color: "#fff" }}
                  >
                    固定
                  </span>
                ) : mode === "multi" ? (
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center transition-all"
                    style={{
                      border: isSelected ? "none" : "2px solid var(--fg-disabled)",
                      background: isSelected ? "var(--accent)" : "transparent",
                    }}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                ) : (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center transition-all"
                    style={{
                      border: isSelected ? "none" : "2px solid var(--fg-disabled)",
                      background: isSelected ? "var(--accent)" : "transparent",
                    }}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#fff" }} />
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8" style={{ color: "var(--fg-tertiary)", fontSize: "var(--text-sm)" }}>
            未找到匹配的智能体
          </div>
        )}
      </div>

      {mode === "multi" && (
        <div className="px-1 pt-2 mt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
            已选 {selected.length + 1} 个智能体（含主智能体）
          </p>
        </div>
      )}
    </div>
  );
}
