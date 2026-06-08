"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavKey } from "@/stores/navigation-store";
import { useNavigationStore } from "@/stores/navigation-store";

interface CommandItem {
  id: string;
  title: string;
  section: string;
  keywords: string;
  action: () => void;
}

function Icon({ path, size = 15 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);

  const openChatPanel = useCallback((tab: string) => {
    setActiveNav("chat");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 0);
  }, [setActiveNav]);

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const navCommands: Array<{ id: string; title: string; nav: NavKey; keywords: string }> = [
      { id: "nav-dashboard", title: "工作台", nav: "dashboard", keywords: "dashboard 首页 控制台" },
      { id: "nav-chat", title: "会话", nav: "chat", keywords: "chat 对话 群聊 单聊" },
      { id: "nav-agents", title: "Agent 平台", nav: "agents", keywords: "agent codex claude custom" },
      { id: "nav-my-agents", title: "自建 Agent", nav: "my-agents", keywords: "custom agent 自建" },
      { id: "nav-tasks", title: "任务队列", nav: "tasks", keywords: "task 任务 队列" },
      { id: "nav-assistant", title: "AI 助手", nav: "ai-assistant", keywords: "assistant 助手" },
    ];

    return [
      ...navCommands.map((command) => ({
        id: command.id,
        title: command.title,
        section: "页面",
        keywords: command.keywords,
        action: () => setActiveNav(command.nav),
      })),
      {
        id: "open-pmo",
        title: "查看 PMO 调度",
        section: "工作台",
        keywords: "pmo 主 agent 调度 任务",
        action: () => openChatPanel("tasks"),
      },
      {
        id: "open-preview",
        title: "打开产物预览",
        section: "工作台",
        keywords: "preview 预览 网页 文档 ppt",
        action: () => openChatPanel("preview"),
      },
      {
        id: "open-diff",
        title: "查看 Diff 与版本",
        section: "工作台",
        keywords: "diff 版本 冲突 代码",
        action: () => openChatPanel("diff"),
      },
      {
        id: "open-deploy",
        title: "打开部署面板",
        section: "工作台",
        keywords: "deploy 部署 vercel miaoda preview",
        action: () => openChatPanel("deploy"),
      },
      {
        id: "open-context",
        title: "查看上下文管理",
        section: "工作台",
        keywords: "context 上下文 引用 文档",
        action: () => openChatPanel("context"),
      },
    ];
  }, [openChatPanel, setActiveNav]);

  const filtered = useMemo(() => {
    const key = normalize(query);
    if (!key) return commands;
    return commands.filter((command) => normalize(`${command.title} ${command.section} ${command.keywords}`).includes(key));
  }, [commands, query]);

  useEffect(() => {
    const openHandler = () => openPalette();
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("command-palette:open", openHandler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("command-palette:open", openHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [openPalette]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const runCommand = (command: CommandItem) => {
    command.action();
    setOpen(false);
  };

  return (
    <div data-testid="command-palette" className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]" style={{ background: "rgba(15, 23, 42, 0.24)" }} onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-[620px] overflow-hidden rounded-lg" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xl)" }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-12 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--fg-tertiary)" }}><Icon path="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((value) => Math.min(filtered.length - 1, value + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((value) => Math.max(0, value - 1));
              }
              if (event.key === "Enter" && filtered[activeIndex]) {
                event.preventDefault();
                runCommand(filtered[activeIndex]);
              }
            }}
            placeholder="搜索页面或操作"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--fg-primary)" }}
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--fg-tertiary)" }}>没有匹配项</div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
                style={{ background: index === activeIndex ? "rgba(23, 78, 166, 0.07)" : "transparent" }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.08)" }}>
                  <Icon path={command.section === "页面" ? "M4 5h16M4 12h16M4 19h16" : "M5 3l14 9-14 9V3z"} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{command.title}</span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{command.section}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
