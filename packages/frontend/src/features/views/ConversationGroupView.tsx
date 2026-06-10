"use client";

import { useState, useEffect } from "react";
import { useConversationGroupStore } from "@/stores/conversation-group-store";

interface ConversationGroupViewProps {
  workspaceId?: string;
  onSendMessage?: (type: string, payload: Record<string, unknown>) => void;
  onSelectConversation?: (id: string) => void;
}

export function ConversationGroupView({ workspaceId = "default", onSendMessage, onSelectConversation }: ConversationGroupViewProps) {
  const { groups, removeGroup } = useConversationGroupStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onSendMessage?.("group:list", { workspaceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSendMessage is stable, only re-run on workspaceId change
  }, [workspaceId]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onSendMessage?.("group:create", { workspaceId, name: newName.trim(), description: newDesc.trim() || undefined });
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
  };

  const handleDelete = (groupId: string) => {
    onSendMessage?.("group:delete", { groupId });
    removeGroup(groupId);
  };

  const toggleExpand = (groupId: string) => {
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-root)" }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>会话分组</h2>
        <button onClick={() => setShowCreate(!showCreate)}
          className="text-xs px-2 py-1 rounded-lg font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}>
          + 新建分组
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-4 border-b" style={{ borderColor: "var(--border)", background: "var(--surface-white)" }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="分组名称"
            className="w-full px-3 py-2 rounded-lg text-xs mb-2 outline-none"
            style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="描述（可选）"
            className="w-full px-3 py-2 rounded-lg text-xs mb-2 outline-none"
            style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
          />
          <div className="flex gap-2">
            <button onClick={handleCreate}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: "var(--accent)" }}>
              创建
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: "var(--fg-secondary)" }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg overflow-hidden" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer"
                onClick={() => toggleExpand(group.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                    {expanded[group.id] ? "▼" : "▶"}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "var(--fg-primary)" }}>{group.name}</span>
                  <span className="text-xs px-1 rounded" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)", fontSize: 9 }}>
                    {group.conversationIds.length} 个会话
                  </span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }}
                  className="text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                  style={{ color: "#ba1a1a", fontSize: 9 }}>
                  删除
                </button>
              </div>
              {expanded[group.id] && (
                <div className="px-3 pb-2">
                  {group.description && (
                <p className="text-xs mb-2" style={{ color: "var(--fg-tertiary)" }}>{group.description}</p>
                  )}
                  <div className="flex flex-col gap-1">
                    {group.conversationIds.map((cid) => (
                      <button key={cid} onClick={() => onSelectConversation?.(cid)}
                        className="text-xs px-2 py-1 rounded text-left"
                        style={{ background: "var(--surface-low)", color: "var(--accent)" }}>
                        {cid.slice(0, 8)}...
                      </button>
                    ))}
                    {group.conversationIds.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>暂无会话</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {groups.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--fg-tertiary)" }}>
              暂无分组，点击上方按钮创建
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
