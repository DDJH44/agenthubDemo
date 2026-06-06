"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigationStore } from "@/stores/navigation-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { createId } from "@/lib/id";
import { timeAgo } from "@/lib/utils";
import { addPendingTeamInvite } from "@/features/team/team-invites";
import { OPEN_ARTIFACT_EVENT, panelTabForArtifact } from "@/features/chat/open-artifact";

type TabKey = "context" | "files" | "activity";

interface MemoryEntry {
  id: string;
  text: string;
  createdAt: number;
}

const ACCENT = "#5B6CFF";
const ACCENT_GRADIENT = "linear-gradient(135deg, #5B6CFF, #8B7FFF)";
const MEMORY_STORAGE_KEY = "agenthub-project-memory";

const AGENT_CONFIG = [
  { id: "Planner", name: "Planner", role: "规划者", gradient: "linear-gradient(135deg, #5B6CFF, #6C7AFF)", initial: "P" },
  { id: "UI Designer", name: "UI Designer", role: "UI 设计", gradient: "linear-gradient(135deg, #8B5CF6, #A78BFA)", initial: "U" },
  { id: "Frontend Dev", name: "Frontend Dev", role: "前端开发", gradient: "linear-gradient(135deg, #22C55E, #4ADE80)", initial: "F" },
  { id: "Tester", name: "Tester", role: "测试", gradient: "linear-gradient(135deg, #F59E0B, #FBBF24)", initial: "T" },
  { id: "planner", name: "Planner", role: "规划者", gradient: "linear-gradient(135deg, #5B6CFF, #6C7AFF)", initial: "P" },
  { id: "worker", name: "Worker", role: "执行者", gradient: "linear-gradient(135deg, #22C55E, #4ADE80)", initial: "W" },
  { id: "critic", name: "Critic", role: "审查者", gradient: "linear-gradient(135deg, #F59E0B, #FBBF24)", initial: "C" },
  { id: "researcher", name: "Researcher", role: "研究员", gradient: "linear-gradient(135deg, #3B82F6, #60A5FA)", initial: "R" },
  { id: "refiner", name: "Refiner", role: "润色师", gradient: "linear-gradient(135deg, #EF4444, #F87171)", initial: "Re" },
] as const;

function loadMemory(): MemoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMemory(entries: MemoryEntry[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

export function RightPanelTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>("context");
  const [memoryInput, setMemoryInput] = useState("");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoryHydrated, setMemoryHydrated] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);

  const {
    conversations, messages, sessionAgentStatuses, taskProgress,
    conversationDetail, agentTyping, activeConversationId, agentStates,
  } = useChatStore();
  const { artifacts } = useWorkspaceStore();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMemories(loadMemory());
      setMemoryHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const projectTitle = useMemo(() => {
    if (conversationDetail?.title) return conversationDetail.title;
    const active = conversations.find((c) => c.status === "active");
    return active?.title || "AgentHub 项目";
  }, [conversationDetail, conversations]);

  const projectDescription = useMemo(() => {
    if (conversationDetail?.description) return conversationDetail.description;
    const active = conversations.find((c) => c.status === "active");
    return active?.lastMessage || "暂无描述";
  }, [conversationDetail, conversations]);

  const projectProgress = useMemo(() => {
    if (taskProgress) {
      const { completed, total } = taskProgress;
      return total > 0 ? Math.round((completed / total) * 100) : 0;
    }
    const active = conversations.filter((c) => c.status === "active").length;
    const done = conversations.filter((c) => c.status !== "active").length;
    const total = active + done;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [conversations, taskProgress]);

  const projectFiles = useMemo(() => {
    return artifacts.slice(0, 8).map((art) => ({
      id: art.id,
      name: art.filename || "untitled",
      time: timeAgo(art.createdAt),
      type: art.type,
    }));
  }, [artifacts]);

  const handleFileClick = useCallback((artifactId: string, filename: string, type: string, content: string) => {
    const tab = panelTabForArtifact(type);
    useNavigationStore.getState().setActiveNav("chat");
    useChatStore.getState().setCurrentPreview({ artifactId, type, content, filename });
    window.dispatchEvent(new CustomEvent(OPEN_ARTIFACT_EVENT, {
      detail: { artifactId, type, content, filename, conversationId: activeConversationId, tab },
    }));
    if (activeConversationId) {
      useChatStore.getState().setActiveConversation(activeConversationId);
      try {
        useWorkspaceStore.getState().switchConversation(activeConversationId);
      } catch {
        // Keep navigation and preview opening intact even if local workspace persistence fails.
      }
      window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId: activeConversationId } }));
    }
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 0);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 80);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 500);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
      window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
    }, 1200);
  }, [activeConversationId]);

  const agents = useMemo(() => {
    const typingIds = agentTyping[activeConversationId ?? ""] ?? [];

    if (sessionAgentStatuses.length > 0) {
      return sessionAgentStatuses.slice(0, 5).map((s) => {
        const cfg = AGENT_CONFIG.find((a) => a.id === s.agentName || a.name === s.agentName) ?? AGENT_CONFIG[0];
        const isTyping = typingIds.includes(s.agentId) || typingIds.includes(s.agentName);
        const stateStatus = agentStates[s.agentId]?.status ?? agentStates[s.agentName]?.status;
        let displayStatus: string;
        if (isTyping || s.status === "running") displayStatus = "running";
        else if (stateStatus === "offline") displayStatus = "offline";
        else if (stateStatus === "error") displayStatus = "error";
        else displayStatus = "idle";
        return {
          id: s.agentId || s.agentName,
          name: s.agentName,
          role: cfg.role,
          gradient: cfg.gradient,
          initial: cfg.initial,
          status: displayStatus,
        };
      });
    }

    const uniqueAgents: Array<{ name: string; role: string; gradient: string; initial: string }> = [];
    const seen = new Set<string>();
    for (const cfg of AGENT_CONFIG) {
      if (!seen.has(cfg.name) && uniqueAgents.length < 5) {
        seen.add(cfg.name);
        uniqueAgents.push({ name: cfg.name, role: cfg.role, gradient: cfg.gradient, initial: cfg.initial });
      }
    }

    return uniqueAgents.map((cfg) => {
      const isTyping = typingIds.includes(cfg.name);
      const stateStatus = agentStates[cfg.name]?.status;
      let displayStatus: string;
      if (isTyping) displayStatus = "running";
      else if (stateStatus === "offline") displayStatus = "offline";
      else if (stateStatus === "error") displayStatus = "error";
      else displayStatus = "idle";
      return { ...cfg, id: cfg.name, status: displayStatus };
    });
  }, [sessionAgentStatuses, agentTyping, activeConversationId, agentStates]);

  const handleAddMemory = useCallback(() => {
    const text = memoryInput.trim();
    if (!text) return;
    const entry: MemoryEntry = { id: createId(), text, createdAt: Date.now() };
    const next = [entry, ...memories];
    setMemories(next);
    saveMemory(next);
    setMemoryInput("");
  }, [memoryInput, memories]);

  const handleDeleteMemory = useCallback((id: string) => {
    const next = memories.filter((m) => m.id !== id);
    setMemories(next);
    saveMemory(next);
  }, [memories]);

  const recentActivity = useMemo(() => {
    const items: Array<{ color: string; text: string; time: string }> = [];
    for (const conv of conversations.slice(0, 3)) {
      const msgs = messages[conv.id] || [];
      const last = msgs[msgs.length - 1];
      if (last) {
        items.push({
          color: ACCENT,
          text: `${conv.title} 收到新消息`,
          time: timeAgo(last.timestamp),
        });
      }
    }
    if (items.length === 0) {
      items.push(
        { color: "#22C55E", text: "前端开发完成了页面布局", time: "10分钟前" },
        { color: "#8B5CF6", text: "UI 设计提交了设计稿", time: "30分钟前" },
        { color: ACCENT, text: "Planner 更新了任务计划", time: "1小时前" },
        { color: "#F59E0B", text: "Tester 发现了 2 个问题", time: "2小时前" },
      );
    }
    return items.slice(0, 5);
  }, [conversations, messages]);

  const activityCount = useMemo(() => {
    let count = 0;
    for (const conv of conversations) {
      count += (messages[conv.id] || []).length;
    }
    return Math.min(count, 99);
  }, [conversations, messages]);

  const files = useMemo(() => {
    return artifacts.slice(0, 5).map((art) => ({
      name: art.filename,
      id: art.id,
      time: timeAgo(art.createdAt),
      size: `${Math.round(art.content.length / 1024)} KB`,
      type: art.type,
      content: art.content,
      iconColor: art.type === "html" ? "#3b82f6" : art.type === "code" ? "#006c49" : "#825100",
    }));
  }, [artifacts]);

  const handleInviteMember = useCallback(() => {
    const email = prompt("请输入要邀请的成员邮箱：");
    const result = addPendingTeamInvite(email, "right-panel", {
      fromEmail: user?.email,
      fromName: user?.name,
    });
    if (!result.ok) {
      setInviteStatus("请输入有效邮箱。");
      return;
    }
    setInviteStatus(result.duplicate ? `${result.invite.email} 已在待确认列表。` : `已添加 ${result.invite.email}，等待成员确认。`);
  }, [user?.email, user?.name]);

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "context", label: "上下文" },
    { key: "files", label: "文件" },
    { key: "activity", label: "动态", badge: activityCount > 0 ? activityCount : undefined },
  ];

  return (
    <aside
      className="flex flex-col h-full shrink-0 overflow-hidden"
      style={{
        background: "var(--surface-white)",
        borderLeft: "1px solid var(--border)",
        width: 280,
      }}
    >
      <div
        className="flex items-center gap-0 px-4"
        style={{ borderBottom: "1px solid var(--divider)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-3 py-3 text-[13px] font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === tab.key ? ACCENT : "transparent",
              color: activeTab === tab.key ? ACCENT : "var(--fg-tertiary)",
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(91,108,255,0.1)", color: ACCENT }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "context" && (
          <div className="px-4 py-3 space-y-5">
            <div>
              <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                当前项目
              </p>
              <div
                className="rounded-xl p-3"
                style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                    style={{ background: ACCENT_GRADIENT }}
                  >
                    {projectTitle.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg-primary)" }}>
                      {projectTitle}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>
                      {projectDescription}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold" style={{ color: ACCENT }}>
                    {projectProgress}%
                  </span>
                </div>
                <div className="h-[5px] rounded-full" style={{ background: "var(--bg-hover)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${projectProgress}%`, background: ACCENT_GRADIENT }}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                项目文件
              </p>
              {projectFiles.length > 0 ? (
                <div className="space-y-0.5">
                  {projectFiles.map((f) => {
                    const art = artifacts.find((a) => a.id === f.id);
                    return (
                      <button
                        type="button"
                        data-artifact-file-id={f.id}
                        data-artifact-conversation-id={activeConversationId ?? ""}
                        key={f.id}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        onClick={() => art && handleFileClick(art.id, art.filename || "untitled", art.type, art.content)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          style={{ color: f.type === "html" ? "#3b82f6" : f.type === "code" ? "#006c49" : "#825100", flexShrink: 0 }}
                        >
                          <path
                            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <p className="text-[12px] flex-1 truncate" style={{ color: "var(--fg-primary)" }}>
                          {f.name}
                        </p>
                        <span className="text-[10px] shrink-0" style={{ color: "var(--fg-disabled)" }}>
                          {f.time}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] px-2" style={{ color: "var(--fg-disabled)" }}>
                  暂无文件，执行任务后将自动生成
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                Agent 团队
              </p>
              <div className="space-y-1.5">
                {agents.map((agent) => {
                  const statusLabel = agent.status === "running" ? "工作中" : agent.status === "offline" ? "离线" : agent.status === "error" ? "异常" : "空闲";
                  const statusColor = agent.status === "running" ? "#22C55E" : agent.status === "offline" ? "#94A3B8" : agent.status === "error" ? "#EF4444" : "#F59E0B";
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                      onClick={() => useNavigationStore.getState().setActiveNav("agents")}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                          style={{ background: agent.gradient }}
                        >
                          {agent.initial}
                        </div>
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                          style={{
                            background: statusColor,
                            borderColor: "var(--surface-white)",
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--fg-primary)" }}>
                          {agent.name}
                        </p>
                        <p className="text-[10px]" style={{ color: statusColor }}>
                          {statusLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                项目记忆
              </p>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  value={memoryInput}
                  onChange={(e) => setMemoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddMemory(); }}
                  placeholder="添加一条记忆..."
                  className="flex-1 px-2.5 py-1.5 text-[12px] rounded-lg border outline-none transition-colors"
                  style={{
                    background: "var(--surface-low)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-primary)",
                  }}
                />
                <button
                  onClick={handleAddMemory}
                  disabled={!memoryInput.trim()}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: ACCENT }}
                >
                  保存
                </button>
              </div>
              {!memoryHydrated ? (
                <p className="text-[11px] px-2" style={{ color: "var(--fg-disabled)" }}>加载中...</p>
              ) : memories.length > 0 ? (
                <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-2 px-2 py-1.5 rounded-lg group transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <span className="text-[11px] shrink-0 mt-px" style={{ color: ACCENT }}>•</span>
                      <p className="text-[12px] flex-1 leading-[1.4]" style={{ color: "var(--fg-secondary)" }}>
                        {m.text}
                      </p>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1 py-0.5 rounded"
                        style={{ color: "var(--fg-disabled)" }}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] px-2" style={{ color: "var(--fg-disabled)" }}>
                  暂无项目记忆，添加一些关键信息吧
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                最近活动
              </p>
              <div className="space-y-0">
                {recentActivity.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 py-2"
                    style={{ borderBottom: i < recentActivity.length - 1 ? "1px solid var(--divider)" : "none" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-[1.4]" style={{ color: "var(--fg-secondary)" }}>
                        {item.text}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-disabled)" }}>
                        {item.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "files" && (
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
              文件中心
            </p>
            {files.length > 0 ? (
              <div className="space-y-1">
                {files.map((f) => (
                  <button
                    type="button"
                    data-artifact-file-id={f.id}
                    data-artifact-conversation-id={activeConversationId ?? ""}
                    key={f.id}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={() => handleFileClick(f.id, f.name || "untitled", f.type, f.content)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ color: f.iconColor, flexShrink: 0 }}
                    >
                      <path
                        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--fg-primary)" }}>
                        {f.name}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>{f.time}</p>
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                      {f.size}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] px-2" style={{ color: "var(--fg-disabled)" }}>
                暂无文件
              </p>
            )}
            <button
              className="w-full text-[12px] font-medium mt-3 text-center"
              style={{ color: ACCENT }}
              onClick={() => useNavigationStore.getState().setActiveNav("files")}
            >
              查看全部 →
            </button>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
              最新动态
            </p>
            {recentActivity.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 py-2"
                style={{ borderBottom: i < recentActivity.length - 1 ? "1px solid var(--divider)" : "none" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: item.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                    {item.text}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-disabled)" }}>
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className="mx-4 mb-4 rounded-xl p-4"
          style={{ background: ACCENT_GRADIENT }}
        >
          <p className="text-[12px] font-bold text-white mb-1">邀请团队成员</p>
          <p className="text-[10px] text-white/80 mb-3">与团队成员协作，提升工作效率</p>
          <button
            className="px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-white"
            style={{ color: ACCENT }}
            onClick={handleInviteMember}
          >
            立即邀请
          </button>
          {inviteStatus && (
            <p className="mt-2 text-[10px] leading-relaxed text-white/80">
              {inviteStatus}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
