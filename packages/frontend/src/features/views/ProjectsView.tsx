"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { getGlobalSend } from "@/lib/ws-client";

export function ProjectsView() {
  const { conversations } = useChatStore();
  const groupConvs = conversations.filter((c) => c.type === "group" || c.type === "task_room");
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleProjectClick = useCallback((convId: string) => {
    useChatStore.getState().setActiveConversation(convId);
    const event = new CustomEvent('conversation:select', { detail: { conversationId: convId } });
    window.dispatchEvent(event);
    useNavigationStore.getState().setActiveNav("chat");
  }, []);

  const handleCreateProject = useCallback(() => {
    if (!newTitle.trim()) return;
    getGlobalSend()({ type: "conversation:create", title: newTitle.trim(), convType: "group", workspaceId: "default" });
    setNewTitle("");
    setShowCreate(false);
  }, [newTitle]);

  const filtered = filter === "all"
    ? groupConvs
    : groupConvs.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      <div className="px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
              项目管理
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
              {groupConvs.length} 个项目 · {groupConvs.filter((c) => c.status === "active").length} 活跃
            </p>
          </div>
          <button className="rounded-lg font-medium text-white transition-all active:scale-[0.98]"
            onClick={() => setShowCreate(!showCreate)}
            style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
            + 新建项目
          </button>
        </div>
        {showCreate && (
          <div className="flex items-center gap-2 mt-3">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              placeholder="输入项目名称..." autoFocus
              className="flex-1 rounded-lg px-3 outline-none"
              style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-primary)", background: "var(--surface-white)" }} />
            <button onClick={handleCreateProject} disabled={!newTitle.trim()}
              className="rounded-lg font-medium text-white transition-all"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: newTitle.trim() ? "var(--accent)" : "var(--fg-disabled)" }}>
              创建
            </button>
            <button onClick={() => { setShowCreate(false); setNewTitle(""); }}
              className="rounded-lg font-medium transition-all"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 12px", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>
              取消
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {["all", "active", "archived"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 font-medium transition-all ${filter === f ? "bg-[var(--accent)] text-white" : "text-[var(--fg-secondary)] hover:bg-[var(--surface-low)]"}`}
              style={{ fontSize: "var(--text-2xs)" }}
            >
              {f === "all" ? "全部" : f === "active" ? "进行中" : "已归档"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ paddingBottom: "8%" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>暂无项目</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {filtered.map((conv) => (
              <div key={conv.id}
                className="rounded-xl p-4 transition-all cursor-pointer hover:border-[var(--accent-border)] hover:shadow-md"
                style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
                onClick={() => handleProjectClick(conv.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {conv.pinned && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round">
                          <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                        </svg>
                      )}
                      <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>{conv.title}</h3>
                    </div>
                    <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                      {conv.participants?.length ?? 0} 位成员
                      {conv.lastMessage && ` · 最后: ${conv.lastMessage.slice(0, 30)}`}
                    </p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 shrink-0" style={{
                    fontSize: 9, fontWeight: 500,
                    color: conv.status === "active" ? "var(--success)" : "var(--fg-disabled)",
                    background: conv.status === "active" ? "var(--success-subtle)" : "var(--surface-low)",
                  }}>
                    {conv.status === "active" ? "活跃" : "已归档"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full" style={{ background: "var(--surface-low)" }}>
                    <div className="h-full rounded-full" style={{ width: conv.status === "active" ? "65%" : "100%", background: conv.status === "active" ? "var(--accent)" : "var(--fg-disabled)" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>
                    {conv.status === "active" ? "进行中" : "已完成"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
