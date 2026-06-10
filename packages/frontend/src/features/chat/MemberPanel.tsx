"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationAgentStore } from "@/stores/conversation-agent-store";
import { useConversationMemberStore } from "@/stores/conversation-member-store";
import { AGENT_COLORS } from "@agenthub/shared";
import type { ConversationAgentStatus, MemberInfo } from "@agenthub/shared";

interface MemberPanelProps {
  conversationId: string;
  onSendMessage?: (type: string, payload: Record<string, unknown>) => void;
}

const EMPTY_AGENTS: ConversationAgentStatus[] = [];
const EMPTY_MEMBERS: MemberInfo[] = [];

export function MemberPanel({ conversationId, onSendMessage }: MemberPanelProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { agentsByConversation, toggleAgent } = useConversationAgentStore();
  const members = useConversationMemberStore((state) => state.membersByConversation[conversationId]) ?? EMPTY_MEMBERS;
  const [inviteInput, setInviteInput] = useState("");
  const agents = agentsByConversation[conversationId] ?? EMPTY_AGENTS;
  const realMembers = useMemo(() => members.filter((member) => member.role !== "agent"), [members]);
  const isMultiUserGroup = realMembers.length >= 2;
  const owner = realMembers.find((member) => member.role === "owner") ?? realMembers[0];
  const isOwner = Boolean(currentUserId && owner?.userId === currentUserId);
  const agentsEnabled = agents.some((agent) => agent.enabled);

  useEffect(() => {
    if (conversationId) {
      onSendMessage?.("member:list", { conversationId });
      onSendMessage?.("agent:list", { conversationId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSendMessage is stable, only re-run on conversationId change
  }, [conversationId]);

  const handleToggleAgent = (agentName: string, currentlyEnabled: boolean) => {
    const action = currentlyEnabled ? "agent:disable" : "agent:enable";
    onSendMessage?.(action, { conversationId, agentName });
    toggleAgent(conversationId, agentName, !currentlyEnabled);
  };

  const handleToggleAllAgents = () => {
    if (!isOwner) return;
    const nextEnabled = !agentsEnabled;
    onSendMessage?.(nextEnabled ? "agent:enable" : "agent:disable", {
      conversationId,
      agentName: "__all__",
    });
    agents.forEach((agent) => toggleAgent(conversationId, agent.agentName, nextEnabled));
  };

  const handleInvite = () => {
    const invitee = inviteInput.trim();
    if (!invitee) return;
    onSendMessage?.("member:invite", { conversationId, invitee, email: invitee, userId: invitee });
    setInviteInput("");
  };

  const handleRemoveMember = (userId: string) => {
    onSendMessage?.("member:remove", { conversationId, userId });
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--surface-white)" }}>
      <section className="border-b p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>智能体控制</h3>

        {isMultiUserGroup ? (
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: agentsEnabled ? "var(--success)" : "var(--fg-disabled)" }} />
                  <p className="truncate text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                    {agentsEnabled ? "Agent 已启用" : "Agent 静音中"}
                  </p>
                </div>
                <p className="mt-1 truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                  {isOwner ? "你是群主，可以切换执行区间。" : "仅群主可以切换执行区间。"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAllAgents}
                disabled={!isOwner}
                className="h-7 shrink-0 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-45"
                style={{ background: agentsEnabled ? "var(--fg-tertiary)" : "var(--accent)" }}
              >
                {agentsEnabled ? "静音" : "启用"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <div
                key={agent.agentName}
                className="flex items-center justify-between rounded-lg px-2 py-1.5"
                style={{ background: "var(--surface-low)" }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: AGENT_COLORS[agent.agentName] ?? "var(--accent)" }}
                  />
                  <span className="truncate text-xs font-medium capitalize" style={{ color: "var(--fg-primary)" }}>
                    {agent.agentName}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={agent.enabled ? `禁用 ${agent.agentName}` : `启用 ${agent.agentName}`}
                  onClick={() => handleToggleAgent(agent.agentName, agent.enabled)}
                  className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                  style={{ background: agent.enabled ? "var(--accent)" : "var(--border)" }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ left: agent.enabled ? "18px" : "2px" }}
                  />
                </button>
              </div>
            ))}
            {agents.length === 0 && (
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>暂无可控制的智能体</p>
            )}
          </div>
        )}
      </section>

      <section className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>成员</h3>
        <div className="flex flex-col gap-1">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between rounded-lg px-2 py-1.5"
              style={{ background: "var(--surface-low)" }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white"
                  style={{ background: member.role === "agent" ? "var(--accent)" : "var(--accent-strong)" }}
                >
                  {member.userName.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-xs" style={{ color: "var(--fg-primary)" }}>{member.userName}</span>
                <span
                  className="rounded px-1 text-[9px]"
                  style={{ background: "var(--accent-container)", color: "var(--accent)" }}
                >
                  {member.role === "agent" ? "Agent" : member.role === "owner" ? "群主" : "成员"}
                </span>
              </div>
              {member.role !== "agent" && member.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.userId)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[9px]"
                  style={{ color: "#ba1a1a" }}
                >
                  移除
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
          <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>暂无成员信息</p>
          )}
        </div>
      </section>

      <section className="border-t p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteInput}
            onChange={(event) => setInviteInput(event.target.value)}
            placeholder="输入邮箱或用户 ID"
            className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none"
            style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
            onKeyDown={(event) => event.key === "Enter" && handleInvite()}
          />
          <button
            type="button"
            onClick={handleInvite}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            邀请
          </button>
        </div>
      </section>
    </div>
  );
}
