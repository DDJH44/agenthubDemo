"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useT } from "@/hooks/useT";

interface AgentInfo { name: string; roleKey: string; descKey: string; color: string; }
interface Props { query: string; onSelect: (name: string) => void; onDismiss: () => void; position: { top: number; left: number }; }

const ALL_AGENTS: AgentInfo[] = [
  { name: "planner", roleKey: "agent.planner", descKey: "agent.planner.desc", color: "var(--accent)" },
  { name: "worker", roleKey: "agent.worker", descKey: "agent.worker.desc", color: "#006c49" },
  { name: "critic", roleKey: "agent.critic", descKey: "agent.critic.desc", color: "#825100" },
  { name: "researcher", roleKey: "agent.researcher", descKey: "agent.researcher.desc", color: "#2b7fff" },
  { name: "refiner", roleKey: "agent.refiner", descKey: "agent.refiner.desc", color: "#ba1a1a" },
  { name: "all", roleKey: "agent.all", descKey: "agent.all.desc", color: "var(--accent)" },
];

export function MentionSuggestions({ query, onSelect, onDismiss, position }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = ALL_AGENTS.filter((a) =>
    a.name.startsWith(query.toLowerCase()) || t(a.roleKey).includes(query)
  );

  const filteredNames = filtered.map((a) => a.name);

  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const selectItem = useCallback((name: string) => {
    onSelect(name);
  }, [onSelect]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onDismiss(); };
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
    const handler = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredNames[clampedIndex]) selectItem(filteredNames[clampedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, filteredNames, clampedIndex, selectItem, onDismiss]);

  if (filtered.length === 0) return null;

  return (
    <div ref={ref} className="absolute z-50 rounded-xl overflow-hidden animate-fade-in-up"
      style={{ bottom: "100%", left: position.left, marginBottom: 8, minWidth: 240, background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", letterSpacing: "0.04em" }}>{t("agent.select")}</span>
      </div>
      {filtered.map((agent, i) => (
        <button key={agent.name} onClick={() => selectItem(agent.name)}
          ref={(el) => { if (el) itemRefs.current.set(agent.name, el); else itemRefs.current.delete(agent.name); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all"
          style={{
            background: i === clampedIndex ? "var(--accent-subtle)" : "transparent",
            animationDelay: `${i * 40}ms`,
          }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0" style={{ background: agent.color, fontSize: 11 }}>
            {agent.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>@{agent.name}</span>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>{t(agent.roleKey)}</span>
            </div>
            <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 1 }}>{t(agent.descKey)}</p>
          </div>
          <span style={{ fontSize: "var(--text-2xs)", color: i === clampedIndex ? "var(--accent)" : "var(--fg-disabled)" }}>⏎</span>
        </button>
      ))}
    </div>
  );
}
