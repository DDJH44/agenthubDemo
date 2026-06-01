"use client";

import { useMemo, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { ContextWindowIndicator } from "./ContextWindowIndicator";

const COLORS = ["#174ea6", "#0f766e", "#9a6700", "#a50e0e", "#7c3aed", "#0e7490", "#5f6368"];

function colorAt(index: number) {
  return COLORS[index % COLORS.length];
}

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
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

  const activeConv = conversations.find((conversation) => conversation.id === activeConversationId);
  const title = conversationDetail?.title ?? activeConv?.title ?? "未选择会话";
  const isGroup = activeConversationId ? (conversationMode[activeConversationId] ?? (activeConv?.type !== "direct")) : false;
  const participants = conversationDetail?.participants ?? (activeConv?.participants ?? []).map((name, index) => ({ id: String(index), name, role: "editor" as const }));
  const memberAvatars = participants.slice(0, 5);
  const extraMembers = Math.max(0, participants.length - memberAvatars.length);

  const contextData = useMemo(() => {
    const convMessages = activeConversationId ? (messages[activeConversationId] ?? []) : [];
    return {
      messageCount: convMessages.length,
      totalChars: convMessages.reduce((sum, message) => sum + message.content.length, 0),
    };
  }, [activeConversationId, messages]);

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

  return (
    <div className="relative flex h-14 shrink-0 items-center px-4" style={{ background: "var(--surface-white)", borderBottom: "1px solid var(--divider)" }}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ background: isGroup ? "#174ea6" : "#0f766e" }}>
          {isGroup ? "群" : title.charAt(0).toUpperCase()}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: "var(--success)", border: "2px solid var(--surface-white)" }} />
        </div>

        <div className="min-w-0">
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
                className="rounded-md px-2 py-1 text-sm font-bold outline-none"
                style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid rgba(23, 78, 166, 0.18)", width: 220 }}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                className="group flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--surface-low)]"
                title="修改会话名称"
              >
                <h2 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)", maxWidth: 240 }}>{title}</h2>
                <span className="opacity-0 transition-opacity group-hover:opacity-70" style={{ color: "var(--fg-tertiary)" }}>
                  <Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z" size={12} />
                </span>
              </button>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: isGroup ? "#174ea6" : "#0f766e", background: isGroup ? "rgba(23, 78, 166, 0.07)" : "rgba(15, 118, 110, 0.08)" }}>
              {isGroup ? "群聊模式" : "单聊模式"}
            </span>
            {isGroup && (
              <button
                type="button"
                onClick={() => setShowMembers((value) => !value)}
                className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] transition-colors hover:bg-[var(--surface-low)]"
                style={{ color: "var(--fg-tertiary)" }}
              >
                <Icon path="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87" size={10} />
                {participants.length} 成员
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ContextWindowIndicator messageCount={contextData.messageCount} totalChars={contextData.totalChars} />

        {isGroup && memberAvatars.length > 0 && (
          <div className="flex -space-x-2">
            {memberAvatars.map((participant, index) => (
              <div
                key={participant.id}
                className="grid h-8 w-8 place-items-center rounded-full border-2 text-[10px] font-bold text-white"
                style={{ background: colorAt(index), borderColor: "var(--surface-white)", zIndex: memberAvatars.length - index }}
                title={participant.name}
              >
                {participant.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {extraMembers > 0 && (
              <div className="grid h-8 w-8 place-items-center rounded-full border-2 text-[10px] font-bold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", borderColor: "var(--surface-white)" }}>
                +{extraMembers}
              </div>
            )}
          </div>
        )}

        <button type="button" className="grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-[var(--surface-low)]" style={{ color: "var(--fg-tertiary)" }} title="更多操作">
          <Icon path="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" size={16} />
        </button>
      </div>

      {showMembers && isGroup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMembers(false)} />
          <div className="absolute right-4 top-14 z-50 w-72 overflow-hidden rounded-lg" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>群成员</h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>{participants.length} 个参与者</p>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
              {participants.map((participant, index) => (
                <div key={participant.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-[var(--surface-low)]">
                  <div className="grid h-8 w-8 place-items-center rounded-md text-xs font-bold text-white" style={{ background: colorAt(index) }}>
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{participant.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{participant.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
