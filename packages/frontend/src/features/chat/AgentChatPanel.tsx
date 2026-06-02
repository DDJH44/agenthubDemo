"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@agenthub/shared";
import { AnalyzeAndAssignFlow } from "./AnalyzeAndAssignFlow";
import { AgentStepList } from "./AgentStepList";
import { ConversationNavBar } from "./ConversationNavBar";
import { MentionSuggestions } from "./MentionSuggestions";
import { MessageList } from "./MessageList";
import { QuickReplyBar } from "./QuickReplyBar";
import { RightPanel } from "./RightPanel";
import { TaskSteps } from "./TaskSteps";
import { BrandMascot } from "@/components/BrandMascot";
import { useChatStore } from "@/stores/chat-store";

interface StepProgress {
  index: number;
  total: number;
  step: string;
  status: "pending" | "running" | "done";
  result?: string;
}

interface Props {
  connected: boolean;
  activeConversationId: string | null;
  planSteps: string[];
  steps: StepProgress[];
  streamBuffer: string;
  isStreaming: boolean;
  taskSummary: string;
  messages: Message[];
  onSend: (text: string) => void;
  onAssignAgent?: (conversationId: string, agentId: string, content: string) => void;
  onBackToList?: () => void;
  isMobile?: boolean;
}

const EMPTY_ACTIONS = [
  { title: "PMO 拆解任务", desc: "请把这个课题拆成可验收的多 Agent 协作流程" },
  { title: "生成网页产物", desc: "用 Codex 生成一个可预览和可编辑的 HTML 产物" },
  { title: "处理代码冲突", desc: "让 Claude Code 接管同文件冲突并输出 Diff" },
  { title: "部署到预览环境", desc: "让 Open Code 生成部署状态卡片和访问链接" },
];

function createConversationDetail(convId: string) {
  const store = useChatStore.getState();
  const currentConv = store.conversations.find((conversation) => conversation.id === convId);
  if (!currentConv) return;

  const existing = store.conversationDetail;
  if (existing?.title === currentConv.title) return;

  store.setConversationDetail({
    title: currentConv.title,
    description: currentConv.lastMessage || "",
    priority: "high",
    status: currentConv.status === "archived" ? "terminated" : "active",
    estimatedDuration: 0,
    createdAt: currentConv.createdAt,
    createdBy: "user",
    participants: (currentConv.participants || []).map((name, index) => ({
      id: String(index),
      name,
      role: index === 0 ? "owner" : "editor",
      avatar: "",
    })),
    agentCount: (currentConv.participants || []).length,
  });
}

export function AgentChatPanel({
  connected,
  activeConversationId: activeConversationIdProp,
  planSteps,
  steps,
  streamBuffer,
  isStreaming,
  taskSummary,
  messages,
  onSend,
  onAssignAgent,
  onBackToList,
  isMobile,
}: Props) {
  const {
    activeConversationId,
    conversationMode,
    contextReferences,
    undoMessage,
    setStreaming,
  } = useChatStore();
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convId = activeConversationId ?? activeConversationIdProp;
  const currentMode = convId ? (conversationMode[convId] ?? "single") : "single";
  const contextCount = convId ? (contextReferences[convId]?.length ?? 0) : 0;

  useEffect(() => {
    if (!convId) return;
    const frame = requestAnimationFrame(() => createConversationDetail(convId));
    return () => cancelAnimationFrame(frame);
  }, [convId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [messages.length, streamBuffer, steps.length, taskSummary]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
  }, [isStreaming, onSend, text]);

  const handleAssignAgent = useCallback((agentId: string, content: string) => {
    if (convId && onAssignAgent) onAssignAgent(convId, agentId, content);
  }, [convId, onAssignAgent]);

  const handleUndoMessage = useCallback((messageId: string) => {
    if (convId) undoMessage(convId, messageId);
  }, [convId, undoMessage]);

  const handleStopStreaming = useCallback(() => {
    setStreaming(false);
    const state = useChatStore.getState();
    if (!convId || !state.streamBuffer.trim()) return;
    const finalMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      type: "agent_message",
      sender: "assistant",
      content: state.streamBuffer,
      mentions: [],
      timestamp: Date.now(),
    };
    useChatStore.getState().addMessage(convId, finalMsg);
  }, [convId, setStreaming]);

  const hasContent = messages.length > 0 || steps.length > 0 || streamBuffer || taskSummary;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center">
        {isMobile && onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="ml-2 grid h-8 w-8 place-items-center rounded-md"
            style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}
            title="返回会话列表"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <ConversationNavBar />
        </div>
        <button
          type="button"
          onClick={() => setShowPreviewPanel((value) => !value)}
          className="mr-3 flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors"
          style={{
            color: showPreviewPanel ? "#fff" : "var(--fg-secondary)",
            background: showPreviewPanel ? "var(--accent)" : "var(--surface-tinted)",
            border: "1px solid var(--border)",
            boxShadow: showPreviewPanel ? "var(--accent-glow)" : "none",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          产物
        </button>
      </div>

      <div className="flex min-h-0 flex-1" style={{ background: "var(--surface-white)" }}>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--surface-white)" }}>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar" style={{ background: "var(--surface-white)" }}>
              {!hasContent ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <BrandMascot variant="wave" size={126} className="mb-4" priority />
                  <h2 className="text-lg font-bold" style={{ color: "var(--fg-primary)" }}>从一个任务开始</h2>
                  <p className="mt-2 max-w-md text-sm" style={{ color: "var(--fg-tertiary)", lineHeight: 1.7 }}>
                    描述目标，PMO 主 Agent 会拆解任务并分配给 Codex、Claude Code、Open Code 或自建 Agent。
                  </p>
                  <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {EMPTY_ACTIONS.map((action) => (
                      <button
                        key={action.title}
                        type="button"
                        onClick={() => setText(action.desc)}
                        className="rounded-lg p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-[var(--surface-white)]"
                        style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
                      >
                        <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{action.title}</p>
                        <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.5 }}>{action.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col pb-4">
                  <AnalyzeAndAssignFlow />
                  <MessageList
                    messages={messages}
                    isStreaming={isStreaming}
                    streamBuffer={streamBuffer}
                    taskSummary={taskSummary}
                    onUndo={handleUndoMessage}
                    onStop={handleStopStreaming}
                  />
                  <AgentStepList />
                  <TaskSteps steps={steps} planSteps={planSteps} />
                </div>
              )}
            </div>

            <div className="shrink-0" style={{ borderTop: "1px solid var(--divider)" }}>
              <QuickReplyBar
                value={text}
                onChange={setText}
                onSend={handleSend}
                onMention={() => setText((value) => `${value}${value ? " " : ""}@`)}
                onAttach={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.multiple = true;
                  input.onchange = () => {
                    const names = Array.from(input.files ?? []).map((file) => file.name);
                    if (names.length > 0) setText((value) => `${value} [已附加 ${names.join(", ")}]`);
                  };
                  input.click();
                }}
                isSending={isStreaming}
                disabled={!connected}
                conversationMode={currentMode}
                onAssignAgent={handleAssignAgent}
                onMentionQueryChange={setMentionQuery}
                contextCount={contextCount}
              />
            </div>
          </div>
        </div>
      </div>

      {mentionQuery !== null && (
        <MentionSuggestions
          query={mentionQuery}
          onSelect={(name) => {
            setText((value) => value.replace(/@[\w-]*$/, `@${name} `));
            setMentionQuery(null);
          }}
          onDismiss={() => setMentionQuery(null)}
          position={{ top: 0, left: 0 }}
        />
      )}

      {showPreviewPanel && (
        <>
          <div onClick={() => setShowPreviewPanel(false)} className="fixed inset-0 z-30" style={{ background: "rgba(20, 24, 38, 0.14)", backdropFilter: "blur(1px)" }} />
          <div
            className="fixed z-40 animate-slide-in-right overflow-hidden rounded-2xl"
            style={{
              right: 16,
              top: 16,
              bottom: 16,
              width: "min(760px, calc(100vw - 32px), 48vw)",
              minWidth: "min(420px, calc(100vw - 32px))",
              boxShadow: "0 24px 70px rgba(39, 49, 84, 0.22), 0 0 0 1px rgba(224, 229, 242, 0.95)",
            }}
          >
            <RightPanel />
          </div>
        </>
      )}
    </div>
  );
}
