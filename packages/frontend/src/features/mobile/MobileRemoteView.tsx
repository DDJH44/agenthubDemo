"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentExecutionRequest, Conversation, Message } from "@agenthub/shared";

type MobileRemoteTab = "assistant" | "chat";

interface MobileRemoteViewProps {
  connected: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  taskSummary: string;
  onSelectConversation: (id: string) => void;
  onSend: (text: string, options?: { agentExecution?: AgentExecutionRequest }) => void;
  onCreateConversation: () => void;
}

const QUICK_PROMPTS = [
  "总结当前任务状态",
  "检查是否需要我确认",
  "继续推进当前任务",
];

const ASSISTANT_PROMPTS = [
  "帮我看看当前项目进展",
  "把未完成事项列出来",
  "给我一个下一步建议",
];

function formatTime(timestamp?: number) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
  } catch {
    return "";
  }
}

function plainText(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, "代码内容已生成，请在电脑端查看。")
    .replace(/\s+/g, " ")
    .trim();
}

function messagePreview(message: Message) {
  const payload = message.payload as Record<string, unknown> | undefined;
  const filename = typeof payload?.filename === "string" ? payload.filename : undefined;
  const artifactType = typeof payload?.artifactType === "string" ? payload.artifactType : undefined;
  const status = typeof payload?.status === "string" ? payload.status : undefined;
  const url = typeof payload?.url === "string" ? payload.url : undefined;

  if (payload?.kind === "artifact" || artifactType) {
    return {
      label: artifactType === "html" || artifactType === "code" ? "代码产物" : "产物",
      content: `${filename || "任务产物"} 已生成，请到电脑端预览、编辑或部署。`,
      compact: true,
    };
  }

  if (message.type === "deploy_card") {
    return {
      label: "部署",
      content: url ? `部署完成：${url}` : `部署状态：${status || "更新中"}`,
      compact: true,
    };
  }

  const content = message.content || "";
  if (/```|<!doctype|<html|<script|import\s|export\s|function\s|const\s/i.test(content) && content.length > 220) {
    return {
      label: "代码",
      content: "代码已生成，请在电脑端打开产物工作台查看完整内容。",
      compact: true,
    };
  }

  return {
    label: "",
    content: plainText(content).slice(0, 480) || "状态已更新",
    compact: false,
  };
}

function senderName(message: Message) {
  if (message.sender === "user") return "我";
  if (message.sender === "system") return "系统";
  if (message.senderId === "deploy") return "部署";
  return message.senderId || message.sender || "Agent";
}

function buildExecutionRequest(task: string, messages: Message[]): AgentExecutionRequest {
  const recentUserMessages = messages
    .filter((message) => message.sender === "user" && message.content.trim())
    .slice(-5)
    .map((message) => plainText(message.content).slice(0, 160));

  return {
    mode: "execute",
    task,
    contextSummary: {
      goal: task,
      confirmed: recentUserMessages.length > 0 ? recentUserMessages : [task],
      constraints: ["移动端已确认执行", "复杂产物请在电脑端查看和编辑"],
      references: [],
      openQuestions: [],
      sourceMessageCount: messages.length,
      generatedAt: Date.now(),
    },
  };
}

export function MobileRemoteView({
  connected,
  conversations,
  activeConversationId,
  messages,
  isStreaming,
  taskSummary,
  onSelectConversation,
  onSend,
  onCreateConversation,
}: MobileRemoteViewProps) {
  const [tab, setTab] = useState<MobileRemoteTab>("assistant");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  const orderedConversations = useMemo(
    () =>
      conversations
        .filter((conversation) => conversation.status !== "archived")
        .slice()
        .sort((a, b) => (b.lastMessageAt || b.updatedAt || 0) - (a.lastMessageAt || a.updatedAt || 0)),
    [conversations]
  );

  const recentMessages = useMemo(() => messages.slice(-80), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [recentMessages.length, isStreaming]);

  const sendText = (text?: string) => {
    const value = (text ?? draft).trim();
    if (!value) return;
    onSend(value);
    setDraft("");
    setTab("chat");
  };

  const confirmExecution = () => {
    const task = draft.trim() || taskSummary || activeConversation?.lastMessage || "确认执行当前会话任务";
    onSend(task, { agentExecution: buildExecutionRequest(task, messages) });
    setDraft("");
    setTab("chat");
  };

  return (
    <main
      className="flex min-h-dvh flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #f4f6ff 0%, #eef3fb 54%, #f8fbff 100%)",
        color: "var(--fg-primary)",
      }}
    >
      <header className="shrink-0 px-4 pt-4">
        <div
          className="flex items-center justify-between rounded-2xl border bg-white/88 px-4 py-3 shadow-sm backdrop-blur"
          style={{ borderColor: "rgba(205, 214, 232, 0.85)" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#5B5CF6] text-lg font-black text-white shadow-sm">
              A
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight text-slate-950">AgentHub Remote</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
                {connected ? "在线" : "离线"}
                {isStreaming ? <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700">执行中</span> : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCreateConversation}
            className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-[#4F54E8] active:scale-95"
            style={{ borderColor: "rgba(205, 214, 232, 0.9)" }}
            aria-label="新建会话"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      <div className="shrink-0 px-4 pt-3">
        <div className="grid grid-cols-2 rounded-2xl bg-white/75 p-1 shadow-sm ring-1 ring-slate-200/75">
          {(["assistant", "chat"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === item ? "bg-[#5357F2] text-white shadow-sm" : "text-slate-600"
              }`}
            >
              {item === "assistant" ? "AI 助手" : "会话"}
            </button>
          ))}
        </div>
      </div>

      <section ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "assistant" ? (
          <div className="space-y-3">
            <div className="rounded-3xl border bg-white/90 p-4 shadow-sm" style={{ borderColor: "rgba(205, 214, 232, 0.78)" }}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6167F2]">Remote Control</div>
              <h1 className="mt-2 text-[22px] font-black leading-tight text-slate-950">手机确认，电脑执行。</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                当前会话：{activeConversation?.title || "暂无会话"}
              </p>
              {taskSummary ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  {plainText(taskSummary).slice(0, 180)}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              {ASSISTANT_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendText(prompt)}
                  className="rounded-2xl border bg-white/88 px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm active:scale-[0.99]"
                  style={{ borderColor: "rgba(205, 214, 232, 0.8)" }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {orderedConversations.length > 0 ? (
                orderedConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={`min-w-[168px] rounded-2xl border px-3 py-2 text-left shadow-sm ${
                      conversation.id === activeConversationId ? "bg-[#EEF1FF] text-[#252BC8]" : "bg-white/88 text-slate-700"
                    }`}
                    style={{ borderColor: conversation.id === activeConversationId ? "#B8C3FF" : "rgba(205, 214, 232, 0.8)" }}
                  >
                    <div className="truncate text-sm font-bold">{conversation.title}</div>
                    <div className="mt-1 text-xs opacity-70">{formatTime(conversation.lastMessageAt || conversation.updatedAt)}</div>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={onCreateConversation}
                  className="w-full rounded-2xl border bg-white/88 px-4 py-4 text-left text-sm font-semibold text-slate-700 shadow-sm"
                  style={{ borderColor: "rgba(205, 214, 232, 0.8)" }}
                >
                  新建一个会话
                </button>
              )}
            </div>

            {activeConversation ? (
              <div className="space-y-3">
                {recentMessages.length > 0 ? (
                  recentMessages.map((message) => {
                    const preview = messagePreview(message);
                    const mine = message.sender === "user";
                    return (
                      <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[86%] ${mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                          <div className="px-1 text-[11px] text-slate-400">
                            {senderName(message)} {formatTime(message.timestamp)}
                          </div>
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${
                              mine ? "bg-[#5357F2] text-white" : "border bg-white/92 text-slate-800"
                            }`}
                            style={mine ? undefined : { borderColor: "rgba(205, 214, 232, 0.72)" }}
                          >
                            {preview.label ? (
                              <div className={`mb-1 text-[11px] font-bold ${mine ? "text-white/75" : "text-[#5860E8]"}`}>
                                {preview.label}
                              </div>
                            ) : null}
                            <div className={preview.compact ? "text-slate-700" : ""}>{preview.content}</div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-3xl border bg-white/88 px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                    还没有消息
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border bg-white/88 px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                选择或新建一个会话
              </div>
            )}
          </div>
        )}
      </section>

      <footer
        className="shrink-0 border-t bg-white/92 px-4 pt-3 shadow-[0_-14px_42px_rgba(71,84,129,0.08)] backdrop-blur"
        style={{
          borderColor: "rgba(205, 214, 232, 0.85)",
          paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendText(prompt)}
              className="shrink-0 rounded-full border bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
              style={{ borderColor: "rgba(205, 214, 232, 0.82)" }}
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="rounded-3xl border bg-slate-50 p-2" style={{ borderColor: "rgba(188, 199, 224, 0.85)" }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={tab === "assistant" ? "问 AI 助手，或确认电脑端继续执行..." : "发送消息..."}
            className="max-h-28 w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <button
              type="button"
              onClick={confirmExecution}
              disabled={!activeConversationId}
              className="rounded-2xl border px-3 py-2 text-sm font-semibold text-[#3D46D8] disabled:opacity-45"
              style={{ borderColor: "rgba(83, 87, 242, 0.28)", background: "#F3F5FF" }}
            >
              确认执行
            </button>
            <button
              type="button"
              onClick={() => sendText()}
              disabled={!draft.trim()}
              className="rounded-2xl bg-[#5357F2] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:bg-slate-300"
            >
              发送
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
