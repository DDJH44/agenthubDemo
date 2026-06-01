"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { getConversationAgents, getConversationCapabilityTags } from "./agent-directory";

interface Props {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSearch: (query: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}

type ModeFilter = "single" | "group" | null;

function formatTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;

  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function iconPath(type: "search" | "plus" | "user" | "group" | "more" | "archive") {
  const paths = {
    search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
    plus: "M12 5v14M5 12h14",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    group: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    more: "M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z",
    archive: "M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8M23 4H1v4h22V4zM10 12h4",
  };
  return paths[type];
}

function Icon({ type, size = 14 }: { type: Parameters<typeof iconPath>[0]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPath(type)} />
    </svg>
  );
}

function getTags(conv: Conversation, isGroup: boolean): string[] {
  const capabilityTags = getConversationCapabilityTags(conv, isGroup ? 4 : 3);
  if (capabilityTags.length > 0) return capabilityTags;
  return isGroup ? ["群聊", `${conv.participants.length || 0} 成员`] : ["单聊"];
}

function AgentAvatarStack({ conv, isGroup }: { conv: Conversation; isGroup: boolean }) {
  const agents = getConversationAgents(conv);
  const visible = isGroup ? agents.slice(0, 3) : agents.slice(0, 1);
  const extra = Math.max(0, agents.length - visible.length);

  if (isGroup) {
    return (
      <div className="flex h-10 w-12 shrink-0 items-center">
        <div className="flex -space-x-3">
          {visible.map((agent, index) => (
            <div
              key={agent.id}
              className="grid h-8 w-8 place-items-center rounded-md border-2 text-[10px] font-bold text-white"
              style={{ background: agent.color, borderColor: "var(--surface-white)", zIndex: visible.length - index }}
              title={`${agent.name} · ${agent.capabilities.join(" / ")}`}
            >
              {agent.badge.slice(0, 2)}
            </div>
          ))}
          {extra > 0 && (
            <div className="grid h-8 w-8 place-items-center rounded-md border-2 text-[10px] font-bold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", borderColor: "var(--surface-white)" }}>
              +{extra}
            </div>
          )}
        </div>
      </div>
    );
  }

  const agent = visible[0] ?? getConversationAgents({ ...conv, participants: [conv.title] })[0];
  return (
    <div
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
      style={{ background: agent.color }}
      title={`${agent.name} · ${agent.capabilities.join(" / ")}`}
    >
      {agent.badge.slice(0, 3)}
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: "var(--success)", border: "2px solid var(--surface-white)" }} />
    </div>
  );
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  isGroup,
  onSelect,
  onContextMenu,
}: {
  conv: Conversation;
  isActive: boolean;
  isGroup: boolean;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const tags = getTags(conv, isGroup);
  const agents = getConversationAgents(conv);
  const agentLine = agents.map((agent) => agent.name).slice(0, isGroup ? 3 : 1).join("、");

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className="group mx-2 flex w-[calc(100%-16px)] items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors"
      style={{
        background: isActive ? "rgba(23, 78, 166, 0.07)" : "transparent",
        border: `1px solid ${isActive ? "rgba(23, 78, 166, 0.16)" : "transparent"}`,
      }}
    >
      <AgentAvatarStack conv={conv} isGroup={isGroup} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
                {conv.title}
              </span>
              {conv.pinned && (
                <span className="shrink-0 rounded-sm px-1 text-[10px]" style={{ color: "#9a6700", background: "rgba(154, 103, 0, 0.10)" }}>
                  置顶
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={tag} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-1 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
              {agentLine}{agents.length > (isGroup ? 3 : 1) ? ` 等 ${agents.length} 个 Agent` : ""}
            </p>
          </div>
          <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-disabled)" }}>
            {formatTime(conv.lastMessageAt ?? conv.updatedAt)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>
            {conv.lastMessage || "暂无消息"}
          </p>
          <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--fg-tertiary)" }}>
            <Icon type="more" size={16} />
          </span>
        </div>
      </div>
    </button>
  );
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-3">
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
        {children}
      </span>
    </div>
  );
}

function ContextMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-low)]"
      style={{ color: danger ? "var(--danger)" : "var(--fg-primary)" }}
    >
      {label}
    </button>
  );
}

export function ConversationListView({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onDelete,
  onSearch,
  showArchived,
  onToggleArchived,
}: Props) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convId: string; isPinned: boolean; isArchived: boolean } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationMode = useChatStore((state) => state.conversationMode);

  const getConvMode = useCallback((conv: Conversation): "single" | "group" => {
    return conversationMode[conv.id] ?? (conv.type === "direct" ? "single" : "group");
  }, [conversationMode]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearch(value), 250);
  }, [onSearch]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const { pinned, normal, archived, groupCount, singleCount } = useMemo(() => {
    const active = conversations.filter((conversation) => conversation.status !== "archived");
    const archivedItems = conversations.filter((conversation) => conversation.status === "archived");
    const matchesSearch = (conversation: Conversation) => {
      const keyword = search.trim().toLowerCase();
      if (!keyword) return true;
      const agentText = getConversationAgents(conversation)
        .flatMap((agent) => [agent.name, agent.provider, agent.role, ...agent.capabilities])
        .join(" ");
      return `${conversation.title} ${conversation.lastMessage ?? ""} ${conversation.topics ?? ""} ${agentText}`.toLowerCase().includes(keyword);
    };
    const matchesMode = (conversation: Conversation) => !modeFilter || getConvMode(conversation) === modeFilter;
    const apply = (items: Conversation[]) => items.filter((conversation) => matchesSearch(conversation) && matchesMode(conversation));

    return {
      pinned: apply(active.filter((conversation) => conversation.pinned)),
      normal: apply(active.filter((conversation) => !conversation.pinned)),
      archived: apply(archivedItems),
      groupCount: active.filter((conversation) => getConvMode(conversation) === "group").length,
      singleCount: active.filter((conversation) => getConvMode(conversation) === "single").length,
    };
  }, [conversations, getConvMode, modeFilter, search]);

  const handleContextMenu = (event: React.MouseEvent, conv: Conversation) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      convId: conv.id,
      isPinned: conv.pinned,
      isArchived: conv.status === "archived",
    });
  };

  const hasResults = pinned.length > 0 || normal.length > 0 || (showArchived && archived.length > 0);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--surface-white)", borderRight: "1px solid var(--border)" }}>
      <div className="shrink-0 px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>会话</h2>
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>单聊、群聊与 Agent 联系人</p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="grid h-8 w-8 place-items-center rounded-md text-white transition-opacity hover:opacity-90"
            style={{ background: "#174ea6" }}
            title="新建会话"
          >
            <Icon type="plus" size={16} />
          </button>
        </div>

        <div className="mt-3 flex h-9 items-center gap-2 rounded-md px-2.5" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          <span style={{ color: "var(--fg-tertiary)" }}>
            <Icon type="search" size={15} />
          </span>
          <input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索会话、Agent 或能力"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--fg-primary)" }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModeFilter(modeFilter === "single" ? null : "single")}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold"
            style={{
              color: modeFilter === "single" ? "#174ea6" : "var(--fg-secondary)",
              background: modeFilter === "single" ? "rgba(23, 78, 166, 0.07)" : "transparent",
              border: `1px solid ${modeFilter === "single" ? "rgba(23, 78, 166, 0.16)" : "var(--border)"}`,
            }}
          >
            <Icon type="user" size={13} />
            单聊 {singleCount}
          </button>
          <button
            type="button"
            onClick={() => setModeFilter(modeFilter === "group" ? null : "group")}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold"
            style={{
              color: modeFilter === "group" ? "#174ea6" : "var(--fg-secondary)",
              background: modeFilter === "group" ? "rgba(23, 78, 166, 0.07)" : "transparent",
              border: `1px solid ${modeFilter === "group" ? "rgba(23, 78, 166, 0.16)" : "var(--border)"}`,
            }}
          >
            <Icon type="group" size={13} />
            群聊 {groupCount}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2 custom-scrollbar">
        {pinned.length > 0 && <SectionTitle>置顶</SectionTitle>}
        {pinned.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            isGroup={getConvMode(conv) === "group"}
            onSelect={() => onSelect(conv.id)}
            onContextMenu={(event) => handleContextMenu(event, conv)}
          />
        ))}

        {normal.length > 0 && <SectionTitle>{search ? "搜索结果" : "全部会话"}</SectionTitle>}
        {normal.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            isGroup={getConvMode(conv) === "group"}
            onSelect={() => onSelect(conv.id)}
            onContextMenu={(event) => handleContextMenu(event, conv)}
          />
        ))}

        {archived.length > 0 && !search && (
          <button
            type="button"
            onClick={onToggleArchived}
            className="mt-2 flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold transition-colors hover:bg-[var(--surface-low)]"
            style={{ color: "var(--fg-tertiary)", borderTop: "1px solid var(--border)" }}
          >
            <Icon type="archive" size={13} />
            归档会话 ({archived.length})
          </button>
        )}

        {showArchived && archived.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            isGroup={getConvMode(conv) === "group"}
            onSelect={() => onSelect(conv.id)}
            onContextMenu={(event) => handleContextMenu(event, conv)}
          />
        ))}

        {!hasResults && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-md" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
              <Icon type={search ? "search" : "group"} size={22} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
              {search ? "没有匹配的会话" : "暂无会话"}
            </h3>
            <p className="mt-1 max-w-[220px] text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
              {search ? "换个关键词试试，例如 Codex、部署、Diff。" : "创建一个会话，或从首页启动课题验收演示。"}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onCreate}
                className="mt-4 h-8 rounded-md px-3 text-xs font-semibold text-white"
                style={{ background: "#174ea6" }}
              >
                新建会话
              </button>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[148px] rounded-md py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--surface-white)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            border: "1px solid var(--border)",
          }}
        >
          {contextMenu.isPinned ? (
            <ContextMenuItem label="取消置顶" onClick={() => { onUnpin(contextMenu.convId); setContextMenu(null); }} />
          ) : (
            <ContextMenuItem label="置顶会话" onClick={() => { onPin(contextMenu.convId); setContextMenu(null); }} />
          )}
          {contextMenu.isArchived ? (
            <ContextMenuItem label="移出归档" onClick={() => { onUnarchive(contextMenu.convId); setContextMenu(null); }} />
          ) : (
            <ContextMenuItem label="归档会话" onClick={() => { onArchive(contextMenu.convId); setContextMenu(null); }} />
          )}
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <ContextMenuItem label="删除会话" danger onClick={() => { onDelete(contextMenu.convId); setContextMenu(null); }} />
        </div>
      )}
    </div>
  );
}
