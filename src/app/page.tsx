"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Artifact, Conversation, Message, WorkflowReferencePayload } from "@agenthub/shared";
import { useWebSocket } from "../../packages/frontend/src/hooks/useWebSocket";
import { useChatStore } from "../../packages/frontend/src/stores/chat-store";
import { useSettingsStore } from "../../packages/frontend/src/stores/settings-store";
import { useWorkspaceStore } from "../../packages/frontend/src/stores/workspace-store";
import { useNavigationStore, type NavKey } from "../../packages/frontend/src/stores/navigation-store";
import { useUserAgentStore } from "../../packages/frontend/src/stores/user-agent-store";
import { useAuthStore } from "../../packages/frontend/src/stores/auth-store";
import { AgentChatPanel } from "../../packages/frontend/src/features/chat/AgentChatPanel";
import { RightPanel } from "../../packages/frontend/src/features/chat/RightPanel";
import { ConversationListView } from "../../packages/frontend/src/features/chat/ConversationListView";
import { CreateConversationModal } from "../../packages/frontend/src/features/chat/CreateConversationModal";
import { startAcceptanceDemo } from "../../packages/frontend/src/features/demo/acceptance-demo";
import {
  DashboardViewNew, AgentsView, TasksView, ProjectsView,
  KnowledgeView, FilesView, AgentMarketView, MyAgentsView,
  McpView, WorkflowsView, SettingsView, HelpView,
  SidebarNav, RightPanelTabs, AIAssistantView, ContactsView, CommandPalette,
} from "../../packages/frontend/src/features/views";

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="shrink-0 relative group cursor-col-resize"
      style={{ width: 5, background: "transparent", zIndex: 10 }}
    >
      <div className="absolute inset-y-0 transition-all" style={{ right: 0, width: 1, background: "var(--border)" }} />
      <div
        className="absolute inset-y-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: "50%", transform: "translateX(-50%)", width: 3, background: "var(--accent)", borderRadius: 2 }}
      />
    </div>
  );
}

const CHAT_STARTERS = [
  "帮我拆解一个多 Agent 项目计划",
  "生成一个网页产物并打开预览",
  "检查代码冲突并输出 Diff",
  "把当前产物部署到预览环境",
];

type SendMessageOptions = {
  workflowRef?: WorkflowReferencePayload;
};

function ChatEmptyState({
  onCreate,
  onPrompt,
  onStartDemo,
}: {
  onCreate: () => void;
  onPrompt: (text: string) => void;
  onStartDemo: () => void;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center px-6 py-8"
      style={{
        background:
          "linear-gradient(180deg, var(--surface-white) 0%, #fbfcff 62%, #f5f8fd 100%)",
      }}
    >
      <div className="w-full max-w-[720px]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>AgentHub 会话工作台</p>
            <h2 className="mt-2 text-[24px] font-[760] leading-tight" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>
              从一个目标开始，让主 Agent 帮你调度团队。
            </h2>
          </div>
          <div
            className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl sm:grid"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              <path d="M8 9h8" />
              <path d="M8 13h5" />
            </svg>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div
            className="rounded-2xl p-4 shadow-sm"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>快速启动</p>
                <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                  直接选择一个场景，系统会创建会话并把任务交给 PMO。
                </p>
              </div>
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", boxShadow: "0 8px 18px rgba(68,86,223,0.18)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建会话
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {CHAT_STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => onPrompt(starter)}
                  className="min-h-10 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-[var(--surface-low)]"
                  style={{ color: "var(--fg-secondary)", background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>会话链路</p>
            <div className="mt-3 space-y-3">
              {["理解需求", "拆解任务", "并行调度", "产物交付"].map((step, index) => (
                <div key={step} className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold"
                    style={{
                      background: index === 0 ? "var(--accent)" : "var(--surface-white)",
                      color: index === 0 ? "#fff" : "var(--fg-tertiary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>{step}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onStartDemo}
              className="mt-4 h-8 w-full rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--surface-white)]"
              style={{ color: "var(--accent)", border: "1px solid var(--accent-border)" }}
            >
              打开演示会话
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ["PMO", "主 Agent 调度"],
            ["Codex", "代码生成"],
            ["Open Code", "部署接入"],
          ].map(([name, desc]) => (
            <div key={name} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{name}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, hydrate: hydrateAuth } = useAuthStore();
  const chat = useChatStore();
  const { activeNav, setActiveNav, sidebarCollapsed } = useNavigationStore();
  const { pinConversation, unpinConversation, archiveConversation, unarchiveConversation, deleteConversation, setShowArchived, showArchived } = useChatStore();
  const ws = useWebSocket(undefined, isAuthenticated && !authLoading);
  const [rightSize, setRightSize] = useState(300);
  const [convListWidth, setConvListWidth] = useState(320);
  const mountedRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const convResizeCleanupRef = useRef<(() => void) | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMobileConvList, setShowMobileConvList] = useState(false);

  const sidebarVariant: "dashboard" | "chat" | "default" =
    activeNav === "dashboard" ? "dashboard" : "default";

  const leftWidth = isMobile ? 0 : (sidebarCollapsed ? 48 : 232);

  useEffect(() => {
    mountedRef.current = true;
    hydrateAuth();
    useNavigationStore.getState().hydrate();

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [hydrateAuth]);

  // Auth guard - redirect to login if not authenticated (after loading completes)
  useEffect(() => {
    if (mountedRef.current && !authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Hydrate stores after mount
  useEffect(() => {
    if (!mountedRef.current) return;
    const raf = requestAnimationFrame(() => {
      useSettingsStore.getState().hydrate();
      useUserAgentStore.getState().hydrate();
      useNavigationStore.getState().hydrate();
      const activeConvId = useChatStore.getState().activeConversationId;
      if (activeConvId) {
        useWorkspaceStore.getState().switchConversation(activeConvId);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const activeMessages = chat.activeConversationId
    ? (chat.messages[chat.activeConversationId] ?? [])
    : [];

  const handleCreateConversation = useCallback((conv: Conversation) => {
    // 先上屏本地会话（临时 ID），立即获得 UI 响应
    useChatStore.getState().addConversation(conv);
    useChatStore.getState().setActiveConversation(conv.id);
    // 通过 WS 通知后端创建会话，后端会广播 conversation:created 回来
    // 收到服务端返回后会替换掉本地临时会话
    ws.send({
      type: "conversation:create",
      title: conv.title,
      convType: conv.type,
      workspaceId: conv.workspaceId,
      participants: conv.participants,
      // 带上本地临时 ID，让服务端回传时关联
      clientId: conv.id,
    });
    setShowCreateModal(false);
    setActiveNav("chat");
    if (isMobile) setShowMobileConvList(false);
  }, [ws, isMobile, setActiveNav]);

  const handleSelect = useCallback((id: string) => {
    useChatStore.getState().setActiveConversation(id);
    useWorkspaceStore.getState().switchConversation(id);
    const event = new CustomEvent('conversation:select', { detail: { conversationId: id } });
    window.dispatchEvent(event);
  }, []);

  const handleSend = useCallback((text: string, options?: SendMessageOptions) => {
    const store = useChatStore.getState();
    const convId = store.activeConversationId;
    const workflowPayload = options?.workflowRef
      ? {
          id: options.workflowRef.id,
          name: options.workflowRef.name,
          templateTitle: options.workflowRef.templateTitle,
          nodeCount: options.workflowRef.plan.length,
        }
      : undefined;

    if (convId) {
      const msgId = crypto.randomUUID();
      const userMsg: Message = {
        id: msgId,
        conversationId: convId,
        type: "user_message",
        sender: "user",
        content: text,
        mentions: [],
        payload: workflowPayload ? { workflowRef: workflowPayload } : undefined,
        timestamp: Date.now(),
      };
      store.addMessage(convId, userMsg);
      ws.send({ type: "message:send", conversationId: convId, text, clientMsgId: msgId, workflowRef: options?.workflowRef });
    } else {
      store.setPendingMessage(text);
      ws.send({
        type: "conversation:create",
        title: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
        convType: "group",
        workspaceId: "default"
      });
    }
  }, [ws]);

  const handleAssignAgent = useCallback((conversationId: string, agentId: string, content: string) => {
    ws.assignAgent(conversationId, agentId, content);
  }, [ws]);

  const handleStartDemoConversation = useCallback(() => {
    startAcceptanceDemo();
    setActiveNav("chat");
    if (isMobile) setShowMobileConvList(false);
  }, [isMobile, setActiveNav]);

  // 监听会话重命名事件 → 发送 WS 持久化
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { conversationId: string; title: string };
      ws.send({ type: "conversation:rename", conversationId: detail.conversationId, title: detail.title });
    };
    window.addEventListener("conversation:rename", handler);
    return () => window.removeEventListener("conversation:rename", handler);
  }, [ws]);

  // 监听工作台发送事件 → 自动创建会话并发送消息
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string };
      const store = useChatStore.getState();
      if (store.activeConversationId) {
        ws.sendMessage(store.activeConversationId, detail.text);
      } else {
        ws.send({
          type: "conversation:create",
          title: detail.text.slice(0, 30) + (detail.text.length > 30 ? "..." : ""),
          convType: "group",
          workspaceId: "default",
        });
      }
    };
    window.addEventListener("dashboard:send", handler);
    return () => window.removeEventListener("dashboard:send", handler);
  }, [ws]);

  // 监听子视图导航事件 → 由主页面统一切换可见视图
  useEffect(() => {
    const handler = (event: Event) => {
      const target = (event as CustomEvent<{ key?: NavKey }>).detail?.key;
      if (!target) return;
      setActiveNav(target);
      if (target === "chat") setShowCreateModal(false);
      if (isMobile) {
        setShowMobileSidebar(false);
        if (target !== "chat") setShowMobileConvList(false);
      }
    };
    window.addEventListener("agenthub:navigate", handler);
    return () => window.removeEventListener("agenthub:navigate", handler);
  }, [isMobile, setActiveNav]);

  // 监听工作流产物事件 → 统一写入当前会话与 workspace 产物仓库
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        conversationId?: string;
        artifact?: Artifact;
        message?: Message;
        panelTab?: "preview" | "slides";
      }>).detail;
      if (!detail?.conversationId || !detail.artifact || !detail.message) return;

      setActiveNav("chat");
      setShowCreateModal(false);
      if (isMobile) {
        setShowMobileSidebar(false);
        setShowMobileConvList(false);
      }

      try {
        const workspace = useWorkspaceStore.getState();
        if (workspace.activeConvId !== detail.conversationId) {
          workspace.switchConversation(detail.conversationId);
        }
        useWorkspaceStore.getState().addArtifact(detail.artifact);
      } catch {
        // Keep the artifact card message path alive even if workspace persistence fails.
      }

      const chatStore = useChatStore.getState();
      try {
        chatStore.addMessage(detail.conversationId, detail.message);
      } catch {
        // Fall through to the direct state confirmation below.
      }
      const latestMessages = useChatStore.getState().messages[detail.conversationId] ?? [];
      if (!latestMessages.some((message) => message.id === detail.message?.id)) {
        useChatStore.setState((state) => {
          const existing = state.messages[detail.conversationId!] ?? [];
          const updated = existing.some((message) => message.id === detail.message!.id)
            ? existing
            : [...existing, detail.message!].slice(-500);
          const conversations = state.conversations.map((conversation) =>
            conversation.id === detail.conversationId
              ? {
                  ...conversation,
                  lastMessage: detail.message!.content.slice(0, 80),
                  lastMessageAt: detail.message!.timestamp,
                  updatedAt: detail.message!.timestamp,
                }
              : conversation
          );
          return {
            messages: { ...state.messages, [detail.conversationId!]: updated },
            conversations,
          };
        });
      }
      window.setTimeout(() => useChatStore.getState().persistCurrentState(), 0);
      window.setTimeout(() => {
        const tab = detail.panelTab ?? "preview";
        window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
        window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
      }, 0);
    };
    window.addEventListener("workflow:artifact:create", handler);
    return () => window.removeEventListener("workflow:artifact:create", handler);
  }, [isMobile, setActiveNav]);

  const handlePin = useCallback((id: string) => {
    pinConversation(id);
    ws.pinConversation(id);
  }, [pinConversation, ws]);

  const handleUnpin = useCallback((id: string) => {
    unpinConversation(id);
    ws.unpinConversation(id);
  }, [unpinConversation, ws]);

  const handleArchive = useCallback((id: string) => {
    archiveConversation(id);
    ws.archiveConversation(id);
  }, [archiveConversation, ws]);

  const handleUnarchive = useCallback((id: string) => {
    unarchiveConversation(id);
    ws.unarchiveConversation(id);
  }, [unarchiveConversation, ws]);

  const handleDelete = useCallback((id: string) => {
    deleteConversation(id);
    ws.deleteConversation(id);
  }, [deleteConversation, ws]);

  const handleSearch = useCallback((query: string) => {
    ws.searchConversations(query);
  }, [ws]);

  const handleToggleArchived = useCallback(() => {
    setShowArchived(!showArchived);
    if (!showArchived) {
      ws.send({ type: "conversation:list" });
    }
  }, [showArchived, setShowArchived, ws]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-root)" }}>
        <div style={{ color: "var(--fg-secondary)" }}>加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-root)" }}>
        <div style={{ color: "var(--fg-secondary)" }}>跳转中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden p-0 md:p-5" style={{ background: "var(--bg-root)" }}>
    <div
      className="relative flex h-full w-full overflow-hidden md:rounded-[18px]"
      style={{
        background: "var(--surface-white)",
        border: "1px solid rgba(255, 255, 255, 0.72)",
        boxShadow: "0 24px 70px rgba(42, 53, 91, 0.18), 0 1px 0 rgba(255,255,255,0.9) inset",
      }}
    >
      {/* Mobile sidebar overlay */}
      {isMobile && showMobileSidebar && (
        <div 
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowMobileSidebar(false)}
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={`shrink-0 overflow-hidden ${isMobile ? 'fixed left-0 top-0 bottom-0 z-50' : ''}`}
        style={{ 
          width: isMobile ? (showMobileSidebar ? 280 : 0) : leftWidth, 
          transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          background: isMobile ? "var(--bg-surface)" : undefined
        }}
      >
        <SidebarNav
          variant={sidebarVariant}
          activeNav={activeNav}
          setActiveNav={(key) => {
            setActiveNav(key);
            if (key === "chat") setShowCreateModal(false);
            if (isMobile) setShowMobileSidebar(false);
          }}
          onCreateConversation={() => setShowCreateModal(true)}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header */}
        {isMobile && (
          <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--text-primary)" }}>
              AgentHub
            </span>
          </div>
        )}
        
        {/* 所有视图保持挂载，用 display 切换，避免 SSE/WS 中断 */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ minHeight: 0 }}>
          <div style={{ display: activeNav === "dashboard" ? "" : "none", flex: 1, minHeight: 0 }}><DashboardViewNew /></div>
          <div style={{ display: activeNav === "ai-assistant" ? "" : "none", flex: 1, minHeight: 0 }}><AIAssistantView /></div>
          <div style={{ display: activeNav === "chat" ? "" : "none", flex: 1, minHeight: 0 }}>
            <div className="flex h-full" style={{ minHeight: 0 }}>
              {/* 会话列表 */}
              {!isMobile && (
                <>
                    <div className="shrink-0 overflow-hidden" style={{ width: convListWidth, minWidth: 280, maxWidth: 390 }}>
                    <ConversationListView
                      conversations={chat.conversations}
                      activeConversationId={chat.activeConversationId}
                      onSelect={(id) => handleSelect(id)}
                      onCreate={() => setShowCreateModal(true)}
                      onPin={handlePin}
                      onUnpin={handleUnpin}
                      onArchive={handleArchive}
                      onUnarchive={handleUnarchive}
                      onDelete={handleDelete}
                      onSearch={handleSearch}
                      showArchived={showArchived}
                      onToggleArchived={handleToggleArchived}
                    />
                  </div>
                  <ResizeHandle
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const startSize = convListWidth;
                      const handleMove = (ev: MouseEvent) => {
                        setConvListWidth(Math.max(280, Math.min(390, startSize + (ev.clientX - startX))));
                      };
                      const handleUp = () => {
                        document.removeEventListener("mousemove", handleMove);
                        document.removeEventListener("mouseup", handleUp);
                      };
                      document.addEventListener("mousemove", handleMove);
                      document.addEventListener("mouseup", handleUp);
                      convResizeCleanupRef.current = () => {
                        document.removeEventListener("mousemove", handleMove);
                        document.removeEventListener("mouseup", handleUp);
                      };
                    }}
                  />
                </>
              )}

              {/* 移动端会话列表（全屏覆盖） */}
              {isMobile && showMobileConvList && (
                <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "var(--surface-white)" }}>
                  <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>会话</span>
                    <button onClick={() => setShowCreateModal(true)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <ConversationListView
                      conversations={chat.conversations}
                      activeConversationId={chat.activeConversationId}
                      onSelect={(id) => { handleSelect(id); setShowMobileConvList(false); }}
                      onCreate={() => setShowCreateModal(true)}
                      onPin={handlePin}
                      onUnpin={handleUnpin}
                      onArchive={handleArchive}
                      onUnarchive={handleUnarchive}
                      onDelete={handleDelete}
                      onSearch={handleSearch}
                      showArchived={showArchived}
                      onToggleArchived={handleToggleArchived}
                    />
                  </div>
                </div>
              )}

              {/* 聊天区 */}
              <div className="flex-1 min-w-0 overflow-hidden" style={{ display: isMobile && showMobileConvList ? "none" : "flex" }}>
                {chat.activeConversationId ? (
                  <AgentChatPanel
                    connected={chat.connected}
                    activeConversationId={chat.activeConversationId}
                    planSteps={chat.planSteps}
                    steps={chat.steps}
                    streamBuffer={chat.streamBuffer}
                    isStreaming={chat.isStreaming}
                    taskSummary={chat.taskSummary}
                    messages={activeMessages}
                    onSend={handleSend}
                    onAssignAgent={handleAssignAgent}
                    onBackToList={() => setShowMobileConvList(true)}
                    isMobile={isMobile}
                  />
                ) : (
                  <ChatEmptyState
                    onCreate={() => setShowCreateModal(true)}
                    onPrompt={handleSend}
                    onStartDemo={handleStartDemoConversation}
                  />
                )}
              </div>
            </div>
          </div>
          <div style={{ display: activeNav === "agents" ? "" : "none", flex: 1, minHeight: 0 }}><AgentsView /></div>
          <div style={{ display: activeNav === "tasks" ? "" : "none", flex: 1, minHeight: 0 }}><TasksView /></div>
          <div style={{ display: activeNav === "projects" ? "" : "none", flex: 1, minHeight: 0 }}><ProjectsView /></div>
          <div style={{ display: activeNav === "knowledge" ? "" : "none", flex: 1, minHeight: 0 }}><KnowledgeView /></div>
          <div style={{ display: activeNav === "files" ? "" : "none", flex: 1, minHeight: 0 }}><FilesView /></div>
          <div style={{ display: activeNav === "contacts" ? "" : "none", flex: 1, minHeight: 0 }}><ContactsView /></div>
          <div style={{ display: activeNav === "agent-market" ? "" : "none", flex: 1, minHeight: 0 }}><AgentMarketView /></div>
          <div style={{ display: activeNav === "my-agents" ? "" : "none", flex: 1, minHeight: 0 }}><MyAgentsView /></div>
          <div style={{ display: activeNav === "mcp" ? "" : "none", flex: 1, minHeight: 0 }}><McpView /></div>
          <div style={{ display: activeNav === "workflows" ? "" : "none", flex: 1, minHeight: 0 }}><WorkflowsView /></div>
          <div style={{ display: activeNav === "settings" ? "" : "none", flex: 1, minHeight: 0 }}><SettingsView /></div>
          <div style={{ display: activeNav === "help" ? "" : "none", flex: 1, minHeight: 0 }}><HelpView /></div>
        </div>
      </div>

      {/* Right panel */}
      {!isMobile && activeNav === "dashboard" ? (
        <RightPanelTabs />
      ) : !isMobile && activeNav === "chat" && chat.activeConversationId ? (
        <>
          <ResizeHandle
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startSize = rightSize;
              const handleMove = (ev: MouseEvent) => {
                const newSize = Math.max(240, Math.min(500, startSize - (ev.clientX - startX)));
                setRightSize(newSize);
              };
              const handleUp = () => {
                document.removeEventListener("mousemove", handleMove);
                document.removeEventListener("mouseup", handleUp);
              };
              document.addEventListener("mousemove", handleMove);
              document.addEventListener("mouseup", handleUp);
              resizeCleanupRef.current = () => {
                document.removeEventListener("mousemove", handleMove);
                document.removeEventListener("mouseup", handleUp);
              };
            }}
          />
          <div className="shrink-0 overflow-hidden" style={{ width: rightSize, minWidth: 260, maxWidth: 500 }}>
            <RightPanel />
          </div>
        </>
      ) : null}

      {/* 新建会话弹窗 */}
      <CreateConversationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateConversation}
      />
      <CommandPalette />
    </div>
    </div>
  );
}
