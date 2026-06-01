"use client";

import { useEffect, useState } from "react";
import { useConversationAgentStore } from "@/stores/conversation-agent-store";
import { AGENT_COLORS } from "@agenthub/shared";

interface MemberPanelProps {
  conversationId: string;
  onSendMessage?: (type: string, payload: Record<string, unknown>) => void;
}

export function MemberPanel({ conversationId, onSendMessage }: MemberPanelProps) {
  const { agentsByConversation, toggleAgent } = useConversationAgentStore();
  const [members, _setMembers] = useState<Array<{ userId: string; userName: string; role: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const agents = agentsByConversation[conversationId] ?? [];

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

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    // Send invite via WS - the backend will resolve email to userId
    onSendMessage?.("member:invite", { conversationId, userId: inviteEmail.trim() });
    setInviteEmail("");
  };

  const handleRemoveMember = (userId: string) => {
    onSendMessage?.("member:remove", { conversationId, userId });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* Agent Controls */}
      <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>智能体控制</h3>
        <div className="flex flex-col gap-2">
          {agents.map((agent) => (
            <div key={agent.agentName} className="flex items-center justify-between py-1.5 px-2 rounded-lg"
              style={{ background: "var(--surface-low)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[agent.agentName] ?? "var(--accent)" }} />
                <span className="text-xs font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                  {agent.agentName}
                </span>
              </div>
              <button
                onClick={() => handleToggleAgent(agent.agentName, agent.enabled)}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: agent.enabled ? "var(--accent)" : "var(--border)" }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ left: agent.enabled ? "18px" : "2px" }}
                />
              </button>
            </div>
          ))}
          {agents.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>加载中...</p>
          )}
        </div>
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>成员</h3>
        <div className="flex flex-col gap-1">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between py-1.5 px-2 rounded-lg"
              style={{ background: "var(--surface-low)" }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                  style={{ background: "var(--accent)" }}>
                  {m.userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs" style={{ color: "var(--text-primary)" }}>{m.userName}</span>
                <span className="text-xs px-1 rounded" style={{ background: "var(--accent-container)", color: "var(--accent)", fontSize: 9 }}>
                  {m.role}
                </span>
              </div>
              {m.role !== "agent" && (
                <button onClick={() => handleRemoveMember(m.userId)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: "#ba1a1a", fontSize: 9 }}>
                  移除
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite */}
      <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="输入用户ID邀请..."
            className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--surface-low)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
          <button onClick={handleInvite}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: "var(--accent)" }}>
            邀请
          </button>
        </div>
      </div>
    </div>
  );
}
