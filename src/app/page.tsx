"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Conversation, Message } from "@agenthub/shared";
import { useWebSocket } from "../../packages/frontend/src/hooks/useWebSocket";
import { useChatStore } from "../../packages/frontend/src/stores/chat-store";
import { useSettingsStore } from "../../packages/frontend/src/stores/settings-store";
import { useWorkspaceStore } from "../../packages/frontend/src/stores/workspace-store";
import { useNavigationStore } from "../../packages/frontend/src/stores/navigation-store";
import { useUserAgentStore } from "../../packages/frontend/src/stores/user-agent-store";
import { useAuthStore } from "../../packages/frontend/src/stores/auth-store";
import { AgentChatPanel } from "../../packages/frontend/src/features/chat/AgentChatPanel";
import { RightPanel } from "../../packages/frontend/src/features/chat/RightPanel";
import { ConversationListView } from "../../packages/frontend/src/features/chat/ConversationListView";
import { CreateConversationModal } from "../../packages/frontend/src/features/chat/CreateConversationModal";
import {
  DashboardViewNew, AgentsView, TasksView, ProjectsView,
  KnowledgeView, FilesView, AgentMarketView, MyAgentsView,
  McpView, WorkflowsView, SettingsView, HelpView,
  SidebarNav, RightPanelTabs, AIAssistantView, ContactsView,
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

export default function Page() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, hydrate: hydrateAuth } = useAuthStore();
  const chat = useChatStore();
  const { activeNav, setActiveNav, sidebarCollapsed } = useNavigationStore();
  const { pinConversation, unpinConversation, archiveConversation, unarchiveConversation, deleteConversation, setShowArchived, showArchived } = useChatStore();
  const ws = useWebSocket("ws://localhost:3002/api/ws", isAuthenticated && !authLoading);
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

  const handleSend = useCallback((text: string) => {
    const store = useChatStore.getState();
    const convId = store.activeConversationId;

    if (convId) {
      const msgId = crypto.randomUUID();
      const userMsg: Message = {
        id: msgId,
        conversationId: convId,
        type: "user_message",
        sender: "user",
        content: text,
        mentions: [],
        timestamp: Date.now(),
      };
      store.addMessage(convId, userMsg);
      ws.send({ type: "message:send", conversationId: convId, text, clientMsgId: msgId });
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
    <div className="flex h-screen w-full overflow-hidden relative" style={{ background: "var(--bg-root)" }}>
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
                  <div className="shrink-0 overflow-hidden" style={{ width: convListWidth, minWidth: 260, maxWidth: 420 }}>
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
                        setConvListWidth(Math.max(260, Math.min(420, startSize + (ev.clientX - startX))));
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
                  <div className="flex-1 flex items-center justify-center" style={{ background: "var(--page-bg)" }}>
                    <div className="flex flex-col items-center text-center">
                      <div className="w-24 h-24 rounded-3xl mb-6 flex items-center justify-center"
                        style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                          <path d="M8 9h8" />
                          <path d="M8 13h5" />
                        </svg>
                      </div>
                      <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)", marginBottom: 8 }}>
                        开启今天的第一次会话吧
                      </h2>
                      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)", lineHeight: 1.6, maxWidth: 320 }}>
                        从左侧选择一个会话，或创建一个新会话开始协作
                      </p>
                    </div>
                  </div>
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
    </div>
  );
}
