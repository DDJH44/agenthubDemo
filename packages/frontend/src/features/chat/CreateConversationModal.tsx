"use client";

import { useState, useRef, useEffect } from "react";
import type { Conversation } from "@agenthub/shared";
import { MAIN_AGENT_ID } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { AgentSelectList } from "./AgentSelectList";
import { ContactList } from "./ContactList";

type MemberTab = "agents" | "contacts";

interface CreateConversationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (conversation: Conversation) => void;
}

export function CreateConversationModal({ open, onClose, onCreate }: CreateConversationModalProps) {
  const [mode, setMode] = useState<"direct" | "group">("group");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [activeTab, setActiveTab] = useState<MemberTab>("agents");
  const modalRef = useRef<HTMLDivElement>(null);
  const setConversationMode = useChatStore((s) => s.setConversationMode);

  useEffect(() => {
    if (open) modalRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const handleModeSwitch = (newMode: "direct" | "group") => {
    setMode(newMode);
    setSelectedAgents([]);
    setSelectedContacts([]);
  };

  const handleCreate = () => {
    const allParticipants = [...selectedAgents, ...selectedContacts];
    const participants = mode === "group" ? [MAIN_AGENT_ID, ...allParticipants] : allParticipants;
    const convTitle = title.trim() || (mode === "direct" ? `与 ${selectedAgents[0] || selectedContacts[0]} 的对话` : `群聊 (${participants.length} 人)`);
    const convId = crypto.randomUUID();
    setConversationMode(convId, mode === "direct" ? "single" : "group");
    onCreate({
      id: convId,
      workspaceId: "default",
      title: convTitle,
      type: mode,
      status: "active",
      pinned: false,
      participants,
      lastMessage: undefined,
      lastMessageAt: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onClose();
  };

  const totalSelected = selectedAgents.length + selectedContacts.length;
  const canCreate = mode === "direct" ? totalSelected === 1 : true;

  // 模式切换按钮样式
  const modeBtnStyle = (m: "direct" | "group") => ({
    fontSize: "var(--text-sm)", fontWeight: m === mode ? 600 as const : 400 as const,
    background: m === mode ? "var(--accent-subtle)" : "var(--surface-low)",
    color: m === mode ? "var(--accent)" : "var(--fg-secondary)",
    border: `1px solid ${m === mode ? "var(--accent-border)" : "var(--border)"}`,
  });

  const TAB_STYLE = (tab: MemberTab) => ({
    fontSize: "var(--text-sm)", fontWeight: tab === activeTab ? 600 as const : 400 as const,
    color: tab === activeTab ? "var(--accent)" : "var(--fg-tertiary)",
    borderBottom: tab === activeTab ? "2px solid var(--accent)" : "2px solid transparent",
    padding: "8px 16px",
    background: "transparent",
    cursor: "pointer" as const,
    transition: "all 0.15s",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="rounded-2xl w-full max-w-md animate-fade-in-up"
        style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)" }}
        tabIndex={-1}
        ref={modalRef}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
            新建会话
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface-low)]"
            style={{ color: "var(--fg-tertiary)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18 M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 会话模式 */}
          <div>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 6 }}>
              会话模式
            </label>
            <div className="flex gap-2">
              <button onClick={() => handleModeSwitch("group")} style={modeBtnStyle("group")}
                className="flex-1 h-9 rounded-lg flex items-center justify-center gap-2 transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />
                </svg>
                群聊
              </button>
              <button onClick={() => handleModeSwitch("direct")} style={modeBtnStyle("direct")}
                className="flex-1 h-9 rounded-lg flex items-center justify-center gap-2 transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                单聊
              </button>
            </div>
          </div>

          {/* 会话标题 */}
          <div>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 6 }}>
              会话名称
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选，留空自动生成"
              className="w-full rounded-lg px-3 py-2 outline-none transition-all"
              style={{
                fontSize: "var(--text-sm)", color: "var(--fg-primary)",
                background: "var(--surface-low)", border: "1px solid var(--border)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-border)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Tab 切换 */}
          <div>
            <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
              <button style={TAB_STYLE("agents")} onClick={() => setActiveTab("agents")}>
                我的智能体
              </button>
              <button style={TAB_STYLE("contacts")} onClick={() => setActiveTab("contacts")}>
                通讯录
              </button>
            </div>

            {/* Tab 内容 */}
            <div className="pt-2">
              {activeTab === "agents" ? (
                <div>
                  <AgentSelectList
                    mode={mode === "direct" ? "single" : "multi"}
                    selected={selectedAgents}
                    onChange={setSelectedAgents}
                  />
                </div>
              ) : (
                <div>
                  <ContactList
                    selected={selectedContacts}
                    onChange={setSelectedContacts}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 已选成员标签 */}
          {totalSelected > 0 && (
            <div>
              <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", display: "block", marginBottom: 4 }}>
                已选成员 ({totalSelected})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {selectedAgents.map((id) => (
                  <span key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ fontSize: "var(--text-2xs)", background: "var(--accent-subtle)", color: "var(--accent)" }}>
                    @{id}
                    <button onClick={() => setSelectedAgents(selectedAgents.filter((s) => s !== id))}
                      style={{ fontSize: 11, opacity: 0.6 }}>×</button>
                  </span>
                ))}
                {selectedContacts.map((id) => (
                  <span key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ fontSize: "var(--text-2xs)", background: "var(--success-subtle)", color: "var(--success)" }}>
                    @{id.slice(0, 8)}
                    <button onClick={() => setSelectedContacts(selectedContacts.filter((s) => s !== id))}
                      style={{ fontSize: 11, opacity: 0.6 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg transition-all hover:bg-[var(--surface-mid)]"
            style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-secondary)", background: "var(--surface-low)" }}
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="h-9 px-5 rounded-lg flex items-center justify-center gap-1.5 transition-all"
            style={{
              fontSize: "var(--text-sm)", fontWeight: 600,
              background: canCreate ? "var(--accent-gradient)" : "var(--surface-mid)",
              color: canCreate ? "#fff" : "var(--fg-disabled)",
              cursor: canCreate ? "pointer" : "not-allowed",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14 M5 12h14" />
            </svg>
            {mode === "direct" ? "开始单聊" : "创建群聊"}
          </button>
        </div>
      </div>
    </div>
  );
}
