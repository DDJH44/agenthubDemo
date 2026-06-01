"use client";

import { useState, useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { api } from "@/lib/api-client";

interface MemoryResult {
  conversationId: string; conversationTitle: string;
  content: string; sender: string; messageId: string;
}

export function MemoryPanel() {
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryResult[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const allTopics = useMemo(() => {
    const topicSet = new Set<string>();
    conversations.forEach(c => {
      try { JSON.parse(c.topics || "[]").forEach((t: string) => topicSet.add(t)); } catch {}
    });
    return [...topicSet];
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    return conversations
      .filter(c => {
        if (selectedTopics.size === 0) return true;
        try { return JSON.parse(c.topics || "[]").some((t: string) => selectedTopics.has(t)); } catch { return false; }
      })
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }, [conversations, selectedTopics]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const res = await api.post<{ results: MemoryResult[] }>("/api/memory/search", { query: searchQuery });
    setSearchResults(res.results);
  };

  const handleRestore = (convId: string) => {
    setActiveConversation(convId);
    useNavigationStore.getState().setActiveNav("chat");
    const event = new CustomEvent('conversation:select', { detail: { conversationId: convId } });
    window.dispatchEvent(event);
  };

  const _handleDelete = async (id: string) => {
    if (!confirm("确定删除此对话？")) return;
    // Use store to delete (WS-based, same as sidebar)
    useChatStore.getState().deleteConversation(id);
    useChatStore.getState().deleteConversation(id);
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => { const next = new Set(prev); if (next.has(topic)) next.delete(topic); else next.add(topic); return next; });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* Search */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="relative mb-2">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="搜索历史对话..." className="w-full outline-none rounded-lg pl-8 pr-3"
            style={{ height: 30, fontSize: "var(--text-xs)", background: "var(--surface-low)", border: "1px solid transparent" }} />
        </div>

        {/* Topic Cloud */}
        {allTopics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTopics.slice(0, 12).map(topic => (
              <button key={topic} onClick={() => toggleTopic(topic)}
                className="rounded-full px-2 py-0.5 font-medium transition-all"
                style={{ fontSize: 9, background: selectedTopics.has(topic) ? "var(--accent)" : "var(--surface-low)", color: selectedTopics.has(topic) ? "#fff" : "var(--fg-tertiary)" }}>
                {topic}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Results or Conversation List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {searchResults.length > 0 ? (
          <div className="px-3 py-2 space-y-1">
            <p style={{ fontSize: 9, color: "var(--fg-disabled)", padding: "4px 8px" }}>搜索结果 ({searchResults.length})</p>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => handleRestore(r.conversationId)}
                className="w-full text-left rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-hover)]">
                <p className="truncate" style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--accent)" }}>{r.conversationTitle}</p>
                <p className="truncate mt-0.5" style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>[{r.sender}] {r.content.slice(0, 80)}</p>
              </button>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", textAlign: "center", padding: 40 }}>暂无对话</p>
        ) : (
          <div className="px-2 py-1 space-y-0.5">
            {filteredConversations.map(conv => (
              <button key={conv.id} onClick={() => handleRestore(conv.id)}
                className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${activeConversationId === conv.id ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--bg-hover)]"}`}>
                <div className="flex items-center justify-between">
                  <p className="truncate flex-1" style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-primary)" }}>
                    {conv.title}
                    {conv.status === "archived" && <span className="ml-1 rounded px-1 py-0.5" style={{ fontSize: 7, background: "var(--surface-low)", color: "var(--fg-disabled)" }}>已归档</span>}
                  </p>
                  <span style={{ fontSize: 9, color: "var(--fg-disabled)", flexShrink: 0 }}>
                    {conv.messageCount ?? 0} 条
                  </span>
                </div>
                {conv.summary && (
                  <p className="truncate mt-0.5" style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{conv.summary}</p>
                )}
                {(() => { try { const t: string[] = JSON.parse(conv.topics || "[]"); return t.length > 0 ? (
                  <div className="flex gap-1 mt-1">{t.slice(0,3).map(topic => <span key={topic} className="rounded px-1 py-0.5" style={{ fontSize: 7, background: "var(--accent-subtle)", color: "var(--accent)" }}>{topic}</span>)}</div>
                ) : null; } catch { return null; } })()}
                <p style={{ fontSize: 9, color: "var(--fg-disabled)", marginTop: 1 }}>
                  {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString("zh-CN") : new Date(conv.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
