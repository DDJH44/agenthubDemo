"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, UserAgent } from "@agenthub/shared";
import { BrandMascot } from "@/components/BrandMascot";
import { useChatStore } from "@/stores/chat-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { getConversationAgents, getConversationCapabilityTags, summarizeAgentConnections } from "./agent-directory";

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

const EMPTY_STARTERS = ["多 Agent 任务", "网页产物", "代码 Diff"];

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

function getTags(conv: Conversation, isGroup: boolean, userAgents: UserAgent[], excludeParticipantIds: string[]): string[] {
  const agents = getConversationAgents(conv, userAgents, { excludeParticipantIds });
  const connection = summarizeAgentConnections(agents);
  const connectionTag = connection.meta.shortLabel;
  if (isGroup) {
    return [
      "群聊",
      `${agents.length} Agent`,
      agents.some((agent) => agent.id === "pmo") ? "主 Agent" : "",
      agents.some((agent) => agent.isCustom) ? "自建" : "",
      connectionTag,
    ].filter(Boolean).slice(0, 4);
  }

  const primary = agents[0];
  if (primary) return [primary.provider, primary.capabilities[0], connectionTag].filter(Boolean).slice(0, 3);
  return getConversationCapabilityTags(conv, 2, userAgents, { excludeParticipantIds });
}

function AgentAvatarStack({ conv, isGroup, userAgents, excludeParticipantIds }: { conv: Conversation; isGroup: boolean; userAgents: UserAgent[]; excludeParticipantIds: string[] }) {
  const agents = getConversationAgents(conv, userAgents, { excludeParticipantIds });
  const connection = summarizeAgentConnections(agents);

  if (isGroup) {
    const primary = agents.find((agent) => agent.id === "pmo") ?? agents[0];
    if (primary?.id === "pmo") {
      return (
        <div
          className="relative h-10 w-10 shrink-0"
          title={agents.map((agent) => `${agent.name} - ${agent.capabilities.join(" / ")}`).join("\n")}
        >
          <BrandMascot variant="happy" size={40} />
          <div className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-sm px-1 text-[9px] font-bold" style={{ color: "#174ea6", background: "var(--surface-white)", border: "1px solid rgba(23, 78, 166, 0.18)" }}>
            {agents.length}
          </div>
          <span className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: connection.meta.color, border: "2px solid var(--surface-white)" }} />
        </div>
      );
    }

    return (
      <div
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
        style={{ background: primary?.color ?? "#174ea6" }}
        title={agents.map((agent) => `${agent.name} · ${agent.capabilities.join(" / ")}`).join("\n")}
      >
        群
        <div className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-sm px-1 text-[9px] font-bold" style={{ color: "#174ea6", background: "var(--surface-white)", border: "1px solid rgba(23, 78, 166, 0.18)" }}>
          {agents.length}
        </div>
        <span className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: connection.meta.color, border: "2px solid var(--surface-white)" }} />
      </div>
    );
  }

  const agent = agents[0] ?? getConversationAgents({ ...conv, participants: [conv.title] }, userAgents)[0];
  if (agent.id === "pmo") {
    return (
      <div
        className="relative h-10 w-10 shrink-0"
        title={`${agent.name} - ${agent.capabilities.join(" / ")}`}
      >
        <BrandMascot variant="thinking" size={40} />
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: connection.meta.color, border: "2px solid var(--surface-white)" }} />
      </div>
    );
  }

  return (
    <div
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
      style={{ background: agent.color }}
      title={`${agent.name} · ${agent.capabilities.join(" / ")}`}
    >
      {agent.badge.slice(0, 3)}
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: connection.meta.color, border: "2px solid var(--surface-white)" }} />
    </div>
  );
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  isGroup,
  userAgents,
  excludeParticipantIds,
  onSelect,
  onContextMenu,
}: {
  conv: Conversation;
  isActive: boolean;
  isGroup: boolean;
  userAgents: UserAgent[];
  excludeParticipantIds: string[];
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const tags = getTags(conv, isGroup, userAgents, excludeParticipantIds);
  const agents = getConversationAgents(conv, userAgents, { excludeParticipantIds });
  const connection = summarizeAgentConnections(agents);
  const agentLine = isGroup
    ? agents.map((agent) => agent.name).slice(0, 4).join("、")
    : `${agents[0]?.name ?? conv.title}${agents[0] ? ` · ${agents[0].role}` : ""}`;
  const hiddenAgentCount = isGroup ? Math.max(0, agents.length - 4) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className="group relative mx-2 flex w-[calc(100%-16px)] items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-all"
      style={{
        background: isActive ? "var(--surface-white)" : "transparent",
        border: `1px solid ${isActive ? "var(--accent-border)" : "transparent"}`,
        boxShadow: isActive ? "0 8px 22px rgba(42, 53, 91, 0.08)" : "none",
      }}
    >
      {isActive && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full" style={{ background: "var(--accent)" }} />}
      <AgentAvatarStack conv={conv} isGroup={isGroup} userAgents={userAgents} excludeParticipantIds={excludeParticipantIds} />

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
                {conv.title}
              </span>
              {conv.pinned && (
                <span className="shrink-0 rounded-sm px-1 text-[10px]" style={{ color: "#9a6700", background: "rgba(154, 103, 0, 0.10)" }}>
                  置顶
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              {agentLine}{hiddenAgentCount > 0 ? ` 等 ${agents.length} 个 Agent` : ""}
            </p>
            <div className="mt-1 flex max-w-full flex-nowrap gap-1 overflow-hidden">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]"
                  style={{
                    color: tag === connection.meta.shortLabel ? connection.meta.color : "var(--fg-secondary)",
                    background: tag === connection.meta.shortLabel ? connection.meta.bg : "var(--surface-low)",
                    border: tag === connection.meta.shortLabel ? `1px solid ${connection.meta.border}` : "1px solid transparent",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <span className="shrink-0 self-start pt-0.5 text-[10px]" style={{ color: "var(--fg-disabled)" }}>
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
  const currentUserId = useAuthStore((state) => state.user?.id);
  const userAgents = useUserAgentStore((state) => state.agents);
  const hydrateUserAgents = useUserAgentStore((state) => state.hydrate);
  const excludeParticipantIds = useMemo(() => currentUserId ? [currentUserId] : [], [currentUserId]);

  const getConvMode = useCallback((conv: Conversation): "single" | "group" => {
    return conversationMode[conv.id] ?? (conv.type === "direct" ? "single" : "group");
  }, [conversationMode]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearch(value), 250);
  }, [onSearch]);

  useEffect(() => {
    void hydrateUserAgents();
  }, [hydrateUserAgents]);

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

  const { pinned, normal, archived, groupCount, singleCount, openCount, pinnedCount, archivedCount } = useMemo(() => {
    const active = conversations.filter((conversation) => conversation.status !== "archived");
    const archivedItems = conversations.filter((conversation) => conversation.status === "archived");
    const matchesSearch = (conversation: Conversation) => {
      const keyword = search.trim().toLowerCase();
      if (!keyword) return true;
      const agentText = getConversationAgents(conversation, userAgents, { excludeParticipantIds })
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
      openCount: active.length,
      pinnedCount: active.filter((conversation) => conversation.pinned).length,
      archivedCount: archivedItems.length,
    };
  }, [conversations, excludeParticipantIds, getConvMode, modeFilter, search, userAgents]);

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
    <div className="flex h-full flex-col" style={{ background: "var(--surface-tinted)", borderRight: "1px solid var(--divider)" }}>
      <div className="shrink-0 px-3 py-3" style={{ background: "var(--surface-glass)", borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>会话</h2>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              单聊、群聊与 Agent 联系人
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", boxShadow: "0 8px 18px rgba(68,86,223,0.18)" }}
            title="新建会话"
          >
            <Icon type="plus" size={16} />
          </button>
        </div>

        <div className="mt-3 flex h-9 items-center gap-2 rounded-xl px-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
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

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          {[
            { key: null, label: "全部", value: openCount, icon: "group" as const },
            { key: "single" as const, label: "单聊", value: singleCount, icon: "user" as const },
            { key: "group" as const, label: "群聊", value: groupCount, icon: "group" as const },
          ].map((item) => {
            const active = modeFilter === item.key;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setModeFilter(item.key)}
                className="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--fg-secondary)",
                  background: active ? "var(--surface-white)" : "transparent",
                  boxShadow: active ? "var(--shadow-xs)" : "none",
                }}
              >
                <Icon type={item.icon} size={12} />
                <span className="truncate">{item.label}</span>
                <span style={{ color: active ? "var(--accent)" : "var(--fg-tertiary)" }}>{item.value}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-glass)", border: "1px solid var(--border)" }}>
              置顶 {pinnedCount}
            </span>
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-glass)", border: "1px solid var(--border)" }}>
              打开 {openCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleArchived}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-white)]"
            style={{
              color: showArchived ? "var(--accent)" : "var(--fg-tertiary)",
              background: showArchived ? "var(--surface-white)" : "var(--surface-glass)",
              border: `1px solid ${showArchived ? "var(--accent-border)" : "var(--border)"}`,
            }}
          >
            <Icon type="archive" size={11} />
            归档 {archivedCount}
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
            userAgents={userAgents}
            excludeParticipantIds={excludeParticipantIds}
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
            userAgents={userAgents}
            excludeParticipantIds={excludeParticipantIds}
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
            userAgents={userAgents}
            excludeParticipantIds={excludeParticipantIds}
            onSelect={() => onSelect(conv.id)}
            onContextMenu={(event) => handleContextMenu(event, conv)}
          />
        ))}

        {!hasResults && (
          <div className="px-3 py-8">
            <div
              className="rounded-2xl p-4 text-center shadow-sm"
              style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
            >
              <div
                className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl"
                style={{
                  background: search ? "var(--surface-low)" : "var(--accent-subtle)",
                  color: search ? "var(--fg-tertiary)" : "var(--accent)",
                  border: `1px solid ${search ? "var(--border)" : "var(--accent-border)"}`,
                }}
              >
                <Icon type={search ? "search" : "group"} size={21} />
              </div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
                {search ? "没有匹配的会话" : "还没有会话"}
              </h3>
              <p className="mx-auto mt-1 max-w-[220px] text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
                {search ? "换个关键词试试，例如 Codex、部署、Diff。" : "先创建一个会话，主 Agent 会帮你拆解任务并协调子 Agent。"}
              </p>

              {!search && (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {EMPTY_STARTERS.map((starter) => (
                      <span
                        key={starter}
                        className="rounded-lg px-2 py-1.5 text-[10px] font-semibold"
                        style={{ background: "var(--surface-tinted)", color: "var(--fg-secondary)", border: "1px solid var(--border)" }}
                      >
                        {starter}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onCreate}
                    className="mt-4 h-9 rounded-lg px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent)", boxShadow: "0 8px 18px rgba(68,86,223,0.18)" }}
                  >
                    新建会话
                  </button>
                </>
              )}
            </div>
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
