"use client";

import { useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { timeAgo } from "@/lib/utils";
import { AGENT_COLORS } from "@agenthub/shared";

export function ActivityFeed() {
  const { messages, conversations } = useChatStore();

  const activities = useMemo(() => {
    const result: Array<{ agent: string; agentColor: string; agentInitial: string; action: string; detail: string; time: string }> = [];
    
    for (const conv of conversations.slice(0, 3)) {
      const convMessages = messages[conv.id] || [];
      for (const msg of convMessages.slice(-3)) {
        if (msg.type === "agent_message" && msg.sender !== "user") {
          const sender = msg.sender;
          const color = AGENT_COLORS[sender] || "#6b7280";
          const initial = sender[0]?.toUpperCase() || "?";
          result.push({
            agent: sender,
            agentColor: color,
            agentInitial: initial,
            action: "生成了内容",
            detail: conv.title,
            time: timeAgo(msg.timestamp),
          });
        }
      }
    }
    
    return result.slice(0, 5);
  }, [messages, conversations]);

  return (
    <div
      className="card-breathe"
      style={{
        background: "var(--surface-white)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--divider)" }}
      >
        <h3 className="text-[14px] font-bold" style={{ color: "var(--fg-primary)" }}>
          活动动态
        </h3>
      </div>

      <div>
        {activities.length === 0 ? (
          <div className="px-5 py-6 text-center" style={{ color: "var(--fg-tertiary)", fontSize: "var(--text-sm)" }}>
            暂无活动
          </div>
        ) : (
          activities.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-5 py-3"
              style={{ borderBottom: i < activities.length - 1 ? "1px solid var(--divider)" : "none" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5"
                style={{ background: item.agentColor }}
              >
                {item.agentInitial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px]" style={{ color: "var(--fg-secondary)" }}>
                  <span className="font-semibold" style={{ color: "var(--fg-primary)" }}>{item.agent}</span>
                  {" "}{item.action}{" "}
                  <span className="font-medium" style={{ color: "var(--fg-secondary)" }}>{item.detail}</span>
                </p>
              </div>
              <span className="text-[11px] shrink-0" style={{ color: "var(--fg-tertiary)" }}>{item.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
