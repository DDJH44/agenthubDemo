"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversationFilesStore } from "../../stores/conversation-files-store";
import { renderMarkdown } from "../../lib/markdown-utils";
import { DocumentPreviewPanel } from "./DocumentPreviewPanel";

const API_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3002`
  : "http://localhost:3002";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agenthub-auth-token");
}

function getStorageKey(): string {
  const token = getToken();
  const userId = token ? token.slice(0, 8) : "anonymous";
  return `agenthub-assistant-${userId}`;
}

function loadMessages(): ChatMessage[] {
  try {
    const data = localStorage.getItem(getStorageKey());
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(msgs.slice(-200)));
  } catch { /* ignore quota errors */ }
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function buildHistory(messages: ChatMessage[], maxChars = 4000): Array<{ role: string; content: string }> {
  const history: Array<{ role: string; content: string }> = [];
  let totalChars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (totalChars + msg.content.length > maxChars) break;
    history.unshift({ role: msg.role, content: msg.content });
    totalChars += msg.content.length;
  }
  return history;
}

function detectTopic(content: string, userQuery: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  const headings = lines.filter((l) => l.startsWith("#") && !l.startsWith("##"));
  if (headings.length > 0) {
    return headings[0].replace(/^#+\s*/, "").trim();
  }
  const q = userQuery.trim();
  return q.length > 30 ? q.slice(0, 30) + "..." : q || "主对话";
}

function generateFileName(topic: string, index: number): string {
  const sanitized = topic.replace(/[\\/:*?"<>|]/g, "").trim() || "未命名";
  return `${sanitized}${index > 0 ? `_${index + 1}` : ""}`;
}

function isDocument(content: string): boolean {
  if (content.length < 400) return false;
  const hasHeadings = /^#{1,3}\s/m.test(content);
  const hasStructure = (content.match(/^[-*]\s|^\d+\.\s/gm) || []).length >= 3;
  return hasHeadings || hasStructure;
}

function extractDocTitle(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const h2 = content.match(/^##\s+(.+)$/m);
  if (h2) return h2[1].trim();
  return fallback.length > 40 ? fallback.slice(0, 40) + "..." : fallback;
}

function isDocumentRequest(query: string): boolean {
  const patterns = [
    /生成(一份|一个|一篇)?(文档|报告|手册|方案|指南|PRD|需求|设计文档|技术文档|接口文档|用户手册|白皮书|材料|汇报)/,
    /写(一份|一个|一篇)?(文档|报告|手册|方案|指南|PRD|需求|设计文档|技术文档)/,
    /整理(一份)?(文档|报告|手册|方案)/,
    /创建(一份)?(文档|报告|方案)/,
    /帮我(写|生成|整理|做)(一个|一份|一篇)?(文档|报告|手册|方案|指南|PRD)/,
    /(起草|拟定|编写)(一份)?(文档|报告|手册|方案|指南)/,
  ];
  return patterns.some(p => p.test(query));
}

function FileTreeView({ onFileClick, fileSearch, setFileSearch }: { onFileClick: (id: string) => void; fileSearch: string; setFileSearch: (v: string) => void }) {
  const { files, getAllTopics, toggleStar, removeFile } = useConversationFilesStore();
  const topics = getAllTopics();
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => new Set(topics));

  const filteredTopics = topics.filter((t) => !fileSearch || t.toLowerCase().includes(fileSearch.toLowerCase()));

  const toggleTopic = (topic: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  };

  const getTopicFiles = (topic: string) => files.filter((f) => f.topic === topic);

  const totalBytes = files.reduce((acc, f) => acc + f.content.length, 0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2.5 border-b" style={{ borderBottomColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-primary)" }}>对话文件</span>
          <span className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {files.length} 文件 · {totalMB} MB
          </span>
        </div>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input value={fileSearch} onChange={(e) => { setFileSearch(e.target.value); }}
            placeholder="搜索文件..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {filteredTopics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.5">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            <p style={{ fontSize: "12px", color: "var(--fg-tertiary)", marginTop: 12 }}>AI 生成的文件会按话题自动整理在这里</p>
          </div>
        ) : (
          filteredTopics.map((topic) => {
            const topicFiles = getTopicFiles(topic);
            const expanded = expandedTopics.has(topic);
            return (
              <div key={topic}>
                <button
                  onClick={() => toggleTopic(topic)}
                  className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md transition-colors"
                  style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-secondary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--fg-tertiary)" }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{topic}</span>
                  <span style={{ fontSize: "11px", color: "var(--fg-disabled)" }}>{topicFiles.length}</span>
                </button>
                <AnimatePresence>
                  {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                      {topicFiles.map((file) => (
                        <div key={file.id} className="group flex items-center gap-1 px-2 py-1 rounded-md transition-colors" style={{ paddingLeft: 28 }}>
                          <button
                            onClick={() => onFileClick(file.id)}
                            className="flex-1 flex items-center gap-1.5 min-w-0"
                            style={{ fontSize: "12px", color: "var(--fg-secondary)" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: file.starred ? "#f59e0b" : "var(--fg-tertiary)" }}>
                              {file.starred ? (
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" />
                              ) : (
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              )}
                            </svg>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.title}.md</span>
                          </button>
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); toggleStar(file.id); }}
                              className="p-1 rounded hover:bg-opacity-10 hover:bg-white" style={{ color: file.starred ? "#f59e0b" : "var(--fg-disabled)" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill={file.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                              className="p-1 rounded hover:bg-opacity-10 hover:bg-white" style={{ color: "var(--fg-disabled)" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// DocumentCardTrigger: compact clickable card that opens the document preview panel
function DocumentCardTrigger({ title, onClick }: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full text-left rounded-lg px-3 py-2.5 transition-colors"
      style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="shrink-0">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <span style={{
        fontSize: "13px", fontWeight: 500, color: "var(--fg-primary)",
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        style={{ color: "var(--fg-tertiary)", flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

export function AIAssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const inputRefState = useRef(input);
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(isStreaming);
  const lastUserQueryRef = useRef("");
  const isDocRequestRef = useRef(false);
  const { addFile, files, hydrate: hydrateFiles } = useConversationFilesStore();

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{ title: string; content: string; messageId: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewPanelSize, setPreviewPanelSize] = useState(500);
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => { hydrateFiles(); }, [hydrateFiles]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { inputRefState.current = input; }, [input]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { saveMessages(messages); }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streamBuffer]);

  // Narrow screen detection
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Escape key handler for preview panel
  useEffect(() => {
    if (!previewDoc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else setPreviewDoc(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewDoc, isFullscreen]);

  const handleSend = async () => {
    if (sendingRef.current) return;
    const trimmed = inputRefState.current.trim();
    if (!trimmed || isStreamingRef.current) return;

    sendingRef.current = true;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setInput("");
    setStreamBuffer("");
    lastUserQueryRef.current = trimmed;
    isDocRequestRef.current = isDocumentRequest(trimmed);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.disabled = true;
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: Date.now() };
    const prevMessages = messagesRef.current;
    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: trimmed, history: buildHistory(prevMessages) }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`请求失败 (${res.status})`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "stream" && data.msg) {
            const msg = typeof data.msg === "string" ? data.msg : JSON.stringify(data.msg);
            fullText += msg;
            setStreamBuffer(fullText);
          } else if (data.type === "error") {
            fullText += `\n\n ${data.content || "未知错误"}`;
          }
        } catch { /* skip */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      }
      if (buffer.trim()) processLine(buffer);

      // Save full response as chat message
      if (fullText.trim()) {
        const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: fullText, timestamp: Date.now() };
        setMessages((prev) => [...prev, aiMsg]);

        // Auto-save to files if user requested a document
        if (isDocRequestRef.current && isDocument(fullText)) {
          const topic = detectTopic(fullText, lastUserQueryRef.current);
          const existingCount = files.filter((f) => f.topic === topic).length;
          addFile({
            title: generateFileName(topic, existingCount),
            content: fullText,
            topic,
            messageId: aiMsg.id,
            starred: false,
          });
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `❌ ${(err as Error).message}`, timestamp: Date.now() }]);
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
      setStreamBuffer("");
      abortRef.current = null;
      sendingRef.current = false;
      if (inputRef.current) inputRef.current.disabled = false;
      inputRef.current?.focus();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    if (streamBuffer) {
      const content = streamBuffer + "\n\n*(已停止生成)*";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content, timestamp: Date.now() }]);
      if (isDocRequestRef.current && isDocument(streamBuffer)) {
        const topic = detectTopic(streamBuffer, lastUserQueryRef.current);
        addFile({
          title: generateFileName(topic, files.filter((f) => f.topic === topic).length),
          content: streamBuffer,
          topic,
          messageId: crypto.randomUUID(),
          starred: false,
        });
      }
    }
    setIsStreaming(false);
    setStreamBuffer("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const handleFileClick = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    setPreviewDoc({
      title: file.title,
      content: file.content,
      messageId: id,
    });
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full relative" style={{ background: "var(--page-bg)" }}>
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0" style={{ display: isFullscreen ? "none" : undefined }}>
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-white)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-gradient)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" /><path d="M9 12h6M9 16h6" /></svg>
            </div>
            <div>
              <h1 style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-primary)" }}>AI 智能助手</h1>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                <span style={{ fontSize: "11px", color: "var(--fg-tertiary)" }}>在线</span>
              </div>
            </div>
          </div>
          <button onClick={() => setShowFiles(!showFiles)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: showFiles ? "var(--accent-subtle)" : "transparent", color: showFiles ? "var(--accent)" : "var(--fg-tertiary)" }}
            onMouseEnter={(e) => { if (!showFiles) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (!showFiles) e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>文件</span>
            {files.length > 0 && (
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ background: "var(--accent)", color: "#fff", fontSize: "10px", fontWeight: 600 }}>
                {files.length}
              </span>
            )}
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="flex flex-col items-center text-center" style={{ maxWidth: 480 }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent-gradient)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" /><path d="M9 12h6M9 16h6" /></svg>
                </div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--fg-primary)", marginBottom: 8 }}>你好，有什么可以帮你？</h2>
                <p style={{ fontSize: "14px", color: "var(--fg-tertiary)", lineHeight: 1.6, marginBottom: 32 }}>
                  我可以帮你写代码、分析问题、撰写文档、回答技术问题
                </p>
                <div className="w-full grid gap-2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  {[
                    { icon: "💡", label: "帮我调研最新的 AI Agent 框架" },
                    { icon: "💻", label: "用 TypeScript 写一个 HTTP 服务器" },
                    { icon: "", label: "分析 React 和 Vue 的优缺点" },
                    { icon: "", label: "帮我写一份项目技术方案" },
                  ].map((item, i) => (
                    <motion.button key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => { setInput(item.label); inputRef.current?.focus(); }}
                      className="text-left rounded-xl px-4 py-3 transition-all"
                      style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    >
                      <span className="text-base">{item.icon}</span>
                      <p style={{ fontSize: "13px", color: "var(--fg-secondary)", marginTop: 6, lineHeight: 1.5 }}>{item.label}</p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5" style={{ background: "var(--accent-gradient)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" /></svg>
                      </div>
                    )}
                    <div className={`min-w-0 ${msg.role === "user" ? "max-w-[75%]" : "max-w-[85%]"}`}>
                      {msg.role === "assistant" && (
                        <div className="mb-1.5" style={{ fontSize: "12px", color: "var(--fg-tertiary)" }}>AI 智能助手</div>
                      )}
                      <div className={`rounded-xl px-4 py-3 ${msg.role === "user" ? "text-right" : ""}`}
                        style={{
                          background: msg.role === "user" ? "var(--accent)" : "var(--surface-white)",
                          color: msg.role === "user" ? "#fff" : "var(--fg-primary)",
                          border: msg.role === "user" ? "none" : "1px solid var(--border)",
                        }}>
                        {msg.role === "user" ? (
                          <p style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                        ) : isDocRequestRef.current && isDocument(msg.content) ? (
                          <DocumentCardTrigger
                            title={extractDocTitle(msg.content, "AI 生成文档")}
                            onClick={() => setPreviewDoc({
                              title: extractDocTitle(msg.content, "AI 生成文档"),
                              content: msg.content,
                              messageId: msg.id,
                            })}
                          />
                        ) : (
                          <div className="coze-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                        )}
                      </div>
                      <div className={`flex items-center gap-2 mt-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <span style={{ fontSize: "11px", color: "var(--fg-disabled)" }}>
                          {new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isStreaming && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5" style={{ background: "var(--accent-gradient)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" /></svg>
                  </div>
                  <div className="min-w-0 max-w-[85%]">
                    <div className="mb-1.5" style={{ fontSize: "12px", color: "var(--fg-tertiary)" }}>AI 智能助手</div>
                    <div className="rounded-xl px-4 py-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                      {streamBuffer ? (
                        <div className="coze-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuffer) }} />
                      ) : (
                        <div className="flex items-center gap-1 py-1">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--accent)" }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--accent)", animationDelay: ".2s" }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--accent)", animationDelay: ".4s" }} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-xl px-3 py-2 transition-all" style={{ background: "var(--surface-white)", border: "1px solid var(--border-strong)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-subtle)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                rows={1}
                className="w-full bg-transparent outline-none resize-none"
                style={{ fontSize: "14px", color: "var(--fg-primary)", minHeight: 24, maxHeight: 160, lineHeight: 1.6 }} />
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <button className="p-1 rounded hover:bg-opacity-10 hover:bg-white transition-colors" style={{ color: "var(--fg-tertiary)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                  </button>
                </div>
                {isStreaming ? (
                  <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    停止
                  </button>
                ) : (
                  <button onClick={handleSend} disabled={!input.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{ background: input.trim() ? "var(--accent-gradient)" : "var(--surface-low)", color: input.trim() ? "#fff" : "var(--fg-disabled)" }}>
                    发送
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Split Preview Panel (Mode B: wide screen, preview open, not fullscreen) */}
      <AnimatePresence>
        {previewDoc && !isFullscreen && !isNarrow && (
          <motion.div
            key="split-preview"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: previewPanelSize, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="shrink-0 overflow-hidden flex"
          >
            {/* Resize handle */}
            <div
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startSize = previewPanelSize;
                const handleMove = (ev: MouseEvent) => {
                  setPreviewPanelSize(Math.max(360, Math.min(700, startSize - (ev.clientX - startX))));
                };
                const handleUp = () => {
                  document.removeEventListener("mousemove", handleMove);
                  document.removeEventListener("mouseup", handleUp);
                };
                document.addEventListener("mousemove", handleMove);
                document.addEventListener("mouseup", handleUp);
              }}
              className="shrink-0 relative group cursor-col-resize"
              style={{ width: 5, background: "transparent", zIndex: 10 }}
            >
              <div className="absolute inset-y-0 transition-all" style={{ right: 0, width: 1, background: "var(--border)" }} />
              <div className="absolute inset-y-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: "50%", transform: "translateX(-50%)", width: 3, background: "var(--accent)", borderRadius: 2 }} />
            </div>
            {/* Panel */}
            <div className="flex-1 min-w-0" style={{ borderLeft: "1px solid var(--border)" }}>
              <DocumentPreviewPanel
                key={previewDoc.messageId}
                title={previewDoc.title}
                content={previewDoc.content}
                onClose={() => { setPreviewDoc(null); setIsFullscreen(false); }}
                onToggleFullscreen={() => setIsFullscreen(true)}
                isFullscreen={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Overlay (Mode C) */}
      <AnimatePresence>
        {previewDoc && isFullscreen && (
          <motion.div
            key="fullscreen-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-30 flex flex-col"
            style={{ background: "var(--page-bg)" }}
          >
            <DocumentPreviewPanel
              key={previewDoc.messageId}
              title={previewDoc.title}
              content={previewDoc.content}
              onClose={() => { setPreviewDoc(null); setIsFullscreen(false); }}
              onToggleFullscreen={() => setIsFullscreen(false)}
              isFullscreen={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Narrow Overlay (Mode D) */}
      <AnimatePresence>
        {previewDoc && !isFullscreen && isNarrow && (
          <>
            <motion.div
              key="narrow-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20"
              style={{ background: "rgba(0,0,0,0.3)" }}
              onClick={() => { setPreviewDoc(null); setIsFullscreen(false); }}
            />
            <motion.div
              key="narrow-preview"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute inset-y-0 right-0 z-30 flex flex-col"
              style={{ width: "90%", maxWidth: 420, background: "var(--surface-white)" }}
            >
              <DocumentPreviewPanel
                key={previewDoc.messageId}
                title={previewDoc.title}
                content={previewDoc.content}
                onClose={() => { setPreviewDoc(null); setIsFullscreen(false); }}
                onToggleFullscreen={() => setIsFullscreen(true)}
                isFullscreen={false}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* File Panel */}
      <AnimatePresence>
        {showFiles && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden flex flex-col"
            style={{ background: "var(--surface-white)", borderLeft: "1px solid var(--border)" }}>
            <FileTreeView onFileClick={handleFileClick} fileSearch={fileSearch} setFileSearch={setFileSearch} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
