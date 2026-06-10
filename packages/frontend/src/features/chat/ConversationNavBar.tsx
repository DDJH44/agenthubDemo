"use client";

import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { getGlobalSend } from "@/lib/ws-client";
import { getAgentMeta, getConversationAgents } from "./agent-directory";
import { AgentSelectList } from "./AgentSelectList";
import { ContactList } from "./ContactList";
import { ContextWindowIndicator } from "./ContextWindowIndicator";

type AddMemberTab = "agents" | "contacts";

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function normalizeParticipantKey(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function ConversationNavBar() {
  const conversationDetail = useChatStore((state) => state.conversationDetail);
  const updateConversationTitle = useChatStore((state) => state.updateConversationTitle);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const messages = useChatStore((state) => state.messages);
  const conversationMode = useChatStore((state) => state.conversationMode);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberTab, setAddMemberTab] = useState<AddMemberTab>("agents");
  const [selectedAddAgents, setSelectedAddAgents] = useState<string[]>([]);
  const [selectedAddContacts, setSelectedAddContacts] = useState<string[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreStatus, setMoreStatus] = useState<string | null>(null);
  const [addMemberStatus, setAddMemberStatus] = useState<string | null>(null);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const userAgents = useUserAgentStore((state) => state.agents);
  const hydrateUserAgents = useUserAgentStore((state) => state.hydrate);
  const setActiveNav = useNavigationStore((state) => state.setActiveNav);
  const excludeParticipantIds = useMemo(() => currentUserId ? [currentUserId] : [], [currentUserId]);

  useEffect(() => {
    void hydrateUserAgents();
  }, [hydrateUserAgents]);

  const activeConv = conversations.find((conversation) => conversation.id === activeConversationId);
  const title = conversationDetail?.title ?? activeConv?.title ?? "未选择会话";
  const isGroup = activeConversationId ? (conversationMode[activeConversationId] ?? (activeConv?.type !== "direct")) : false;
  const rawParticipants = conversationDetail?.participants ?? (activeConv?.participants ?? []).map((name, index) => ({ id: String(index), name, role: "editor" as const }));
  const participantAgents = activeConv
    ? getConversationAgents(activeConv, userAgents, { excludeParticipantIds }).map((meta, index) => ({
        participant: { id: meta.id, name: meta.name, role: index === 0 ? "owner" as const : "editor" as const },
        meta,
      }))
    : rawParticipants
        .filter((participant) => !excludeParticipantIds.includes(participant.name))
        .map((participant) => ({ participant, meta: getAgentMeta(participant.name, userAgents) }));
  const participants = participantAgents.map(({ participant }) => participant);
  const memberAvatars = participantAgents.slice(0, 5);
  const extraMembers = Math.max(0, participants.length - memberAvatars.length);
  const primaryAgent = participantAgents[0]?.meta ?? getAgentMeta(title, userAgents);
  const participantKeySet = new Set((activeConv?.participants ?? []).map(normalizeParticipantKey));
  const addMemberCount = selectedAddAgents.length + selectedAddContacts.length;

  const contextData = useMemo(() => {
    const convMessages = activeConversationId ? (messages[activeConversationId] ?? []) : [];
    return {
      messageCount: convMessages.length,
      totalChars: convMessages.reduce((sum, message) => sum + message.content.length, 0),
    };
  }, [activeConversationId, messages]);

  const controllerAgent = participantAgents.find(({ meta }) => meta.id === "pmo")?.meta ?? primaryAgent;
  const statusLabel = contextData.messageCount > 0 ? "协作中" : "待启动";
  const statusColor = contextData.messageCount > 0 ? "var(--success)" : "var(--fg-tertiary)";
  const modeLabel = isGroup ? "群聊模式" : "单聊模式";

  const saveTitle = (nextTitle: string) => {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === title) {
      setEditingTitle(false);
      return;
    }
    updateConversationTitle(trimmed);
    setEditingTitle(false);
    window.dispatchEvent(new CustomEvent("conversation:rename", { detail: { conversationId: activeConversationId, title: trimmed } }));
  };

  const openRightPanel = (tab: "tasks" | "context") => {
    setShowMoreMenu(false);
    window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 0);
  };

  const copyConversationSummary = async () => {
    const summary = `${title}\n模式：${modeLabel}\n消息数：${contextData.messageCount}\n上下文字符：${contextData.totalChars}`;
    try {
      await navigator.clipboard.writeText(summary);
      setMoreStatus("摘要已复制");
    } catch {
      setMoreStatus("复制失败，请手动选择");
    }
    window.setTimeout(() => setMoreStatus(null), 1400);
  };

  const resolveAgentName = (agentId: string) => userAgents.find((agent) => agent.id === agentId)?.name ?? agentId;

  const resetAddMembers = () => {
    setSelectedAddAgents([]);
    setSelectedAddContacts([]);
    setAddMemberTab("agents");
    setAddMemberStatus(null);
  };

  const openAddMembers = () => {
    resetAddMembers();
    setShowMembers(false);
    setShowAddMembers(true);
  };

  const closeAddMembers = () => {
    setShowAddMembers(false);
    resetAddMembers();
  };

  const confirmAddMembers = () => {
    if (!activeConversationId) return;
    const agentNames = selectedAddAgents
      .map(resolveAgentName)
      .filter((name) => !participantKeySet.has(normalizeParticipantKey(name)));
    const contactIds = selectedAddContacts
      .filter((id) => !participantKeySet.has(normalizeParticipantKey(id)));

    if (agentNames.length === 0 && contactIds.length === 0) {
      setAddMemberStatus("选择的成员已经在群聊中");
      return;
    }

    const send = getGlobalSend();
    if (agentNames.length > 0) {
      send({ type: "agent:add", conversationId: activeConversationId, agentNames });
    }
    for (const userId of contactIds) {
      send({ type: "member:invite", conversationId: activeConversationId, userId, invitee: userId });
    }

    setAddMemberStatus(`已提交 ${agentNames.length + contactIds.length} 个成员`);
    window.setTimeout(() => {
      closeAddMembers();
      setShowMembers(true);
    }, 650);
  };

  return (
    <div
      className="relative flex min-h-16 shrink-0 items-center px-4 py-2"
      style={{ background: "var(--surface-glass-strong)", borderBottom: "1px solid var(--divider)" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-white"
          style={{ background: isGroup ? "var(--accent)" : primaryAgent.color, boxShadow: "var(--shadow-glow)" }}
        >
          {isGroup ? "群" : primaryAgent.badge.slice(0, 3)}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: statusColor, border: "2px solid var(--surface-white)" }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => saveTitle(titleDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveTitle(titleDraft);
                  if (event.key === "Escape") setEditingTitle(false);
                }}
                className="rounded-lg px-2 py-1 text-sm font-bold outline-none"
                style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--accent-border)", width: 260, maxWidth: "100%" }}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                className="group flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--surface-low)]"
                title="修改会话名称"
              >
                <h2 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)", maxWidth: 360 }}>{title}</h2>
                <span className="opacity-0 transition-opacity group-hover:opacity-70" style={{ color: "var(--fg-tertiary)" }}>
                  <Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z" size={12} />
                </span>
              </button>
            )}
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: isGroup ? "var(--accent)" : "#0f766e", background: isGroup ? "var(--accent-subtle)" : "rgba(15, 118, 110, 0.08)", border: "1px solid var(--border)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: isGroup ? "var(--accent)" : "#0f766e" }} />
              {modeLabel}
            </span>

            {isGroup ? (
              <button
                type="button"
                onClick={() => setShowMembers((value) => !value)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]"
                style={{ color: "var(--fg-tertiary)", border: "1px solid var(--border)" }}
              >
                <Icon path="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87" size={10} />
                {participants.length} 成员
              </button>
            ) : (
              <>
                <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                  {primaryAgent.provider}
                </span>
                {primaryAgent.capabilities.slice(0, 2).map((capability) => (
                  <span key={capability} className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                    {capability}
                  </span>
                ))}
              </>
            )}

            <span className="hidden min-w-0 truncate text-[10px] sm:inline" style={{ color: "var(--fg-tertiary)" }}>
              {contextData.messageCount} 条消息
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden h-9 shrink-0 items-center gap-2 rounded-xl px-2 xl:flex" style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}>
          <span className="grid h-6 w-6 place-items-center rounded-lg text-[9px] font-bold text-white" style={{ background: controllerAgent.color }}>
            {controllerAgent.badge.slice(0, 2)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[9px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>主控</span>
            <span className="block max-w-[120px] truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>{controllerAgent.name}</span>
          </span>
        </div>

        <div className="hidden h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold lg:flex" style={{ color: statusColor, background: "var(--surface-tinted)", border: "1px solid var(--border)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
          {statusLabel}
        </div>

        <div className="hidden 2xl:block">
          <ContextWindowIndicator messageCount={contextData.messageCount} totalChars={contextData.totalChars} />
        </div>

        {isGroup && memberAvatars.length > 0 && (
          <div className="hidden -space-x-2 2xl:flex">
            {memberAvatars.map(({ participant, meta: agent }, index) => {
              return (
                <div
                  key={participant.id}
                  className="grid h-8 w-8 place-items-center rounded-lg border-2 text-[10px] font-bold text-white"
                  style={{ background: agent.color, borderColor: "var(--surface-white)", zIndex: memberAvatars.length - index }}
                  title={`${agent.name} · ${agent.capabilities.join(" / ")}`}
                >
                  {agent.badge.slice(0, 2)}
                </div>
              );
            })}
            {extraMembers > 0 && (
              <div className="grid h-8 w-8 place-items-center rounded-lg border-2 text-[10px] font-bold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", borderColor: "var(--surface-white)" }}>
                +{extraMembers}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMoreMenu((value) => !value)}
          className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
          style={{ color: "var(--fg-tertiary)" }}
          title="更多操作"
          aria-expanded={showMoreMenu}
        >
          <Icon path="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" size={16} />
        </button>
      </div>

      {showMoreMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
          <div className="absolute right-4 top-14 z-50 w-48 overflow-hidden rounded-xl p-1" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
            <button type="button" onClick={() => { setEditingTitle(true); setTitleDraft(title); setShowMoreMenu(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
              重命名会话
            </button>
            {isGroup && (
              <button type="button" onClick={() => { setShowMoreMenu(false); openAddMembers(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
                添加成员
              </button>
            )}
            <button type="button" onClick={() => openRightPanel("tasks")} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
              打开任务面板
            </button>
            <button type="button" onClick={() => openRightPanel("context")} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
              打开上下文
            </button>
            <button type="button" onClick={() => { setActiveNav("tasks"); setShowMoreMenu(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
              查看全部任务
            </button>
            <button type="button" onClick={copyConversationSummary} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-primary)" }}>
              复制会话摘要
            </button>
            {moreStatus && (
              <p className="px-3 pb-2 pt-1 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{moreStatus}</p>
            )}
          </div>
        </>
      )}

      {showMembers && isGroup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMembers(false)} />
          <div className="absolute right-4 top-16 z-50 w-72 overflow-hidden rounded-xl" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="min-w-0">
                <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>群成员</h3>
                <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>{participants.length} 个参与者</p>
              </div>
              <button
                type="button"
                onClick={openAddMembers}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors hover:bg-[var(--accent-subtle)]"
                style={{ color: "var(--accent)", border: "1px solid var(--accent-border)" }}
              >
                <Icon path="M12 5v14M5 12h14" size={12} />
                添加
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
              {participantAgents.map(({ participant, meta }) => (
                <div key={participant.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-[var(--surface-low)]">
                  <div className="grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: meta.color }}>
                    {meta.badge.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{meta.name}</p>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]" style={{ color: meta.isCustom ? "var(--danger)" : "var(--accent)", background: meta.isCustom ? "var(--danger-subtle)" : "var(--accent-subtle)" }}>
                        {meta.isCustom ? "自建" : meta.provider}
                      </span>
                    </div>
                    <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{meta.role} · {meta.capabilities.slice(0, 2).join(" / ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showAddMembers && isGroup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" style={{ background: "rgba(15, 23, 42, 0.22)", backdropFilter: "blur(6px)" }} onClick={closeAddMembers}>
          <div
            className="flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xl)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="min-w-0">
                <h3 className="text-base font-bold" style={{ color: "var(--fg-primary)" }}>添加群成员</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>选择智能体或通讯录用户，提交后会同步到当前群聊。</p>
              </div>
              <button
                type="button"
                onClick={closeAddMembers}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
                style={{ color: "var(--fg-tertiary)" }}
                aria-label="关闭添加成员"
              >
                <Icon path="M18 6L6 18M6 6l12 12" size={15} />
              </button>
            </div>

            <div className="flex gap-1 px-5 pt-4">
              {(["agents", "contacts"] as AddMemberTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAddMemberTab(tab)}
                  className="h-8 rounded-lg px-3 text-xs font-semibold transition-colors"
                  style={{
                    color: addMemberTab === tab ? "var(--accent)" : "var(--fg-tertiary)",
                    background: addMemberTab === tab ? "var(--accent-subtle)" : "transparent",
                    border: `1px solid ${addMemberTab === tab ? "var(--accent-border)" : "transparent"}`,
                  }}
                >
                  {tab === "agents" ? "智能体" : "用户"}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 px-5 py-4">
              {addMemberTab === "agents" ? (
                <AgentSelectList mode="multi" selected={selectedAddAgents} onChange={setSelectedAddAgents} includeMain={false} />
              ) : (
                <ContactList selected={selectedAddContacts} onChange={setSelectedAddContacts} />
              )}
              {addMemberStatus && (
                <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                  {addMemberStatus}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
                已选 {addMemberCount} 个
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeAddMembers}
                  className="h-9 rounded-lg px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-low)]"
                  style={{ color: "var(--fg-secondary)", border: "1px solid var(--border)" }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmAddMembers}
                  disabled={addMemberCount === 0}
                  className="h-9 rounded-lg px-4 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ color: "#fff", background: "var(--accent)" }}
                >
                  添加到群聊
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
