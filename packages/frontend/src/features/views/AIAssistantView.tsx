"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversationFilesStore } from "../../stores/conversation-files-store";
import { useAuthStore } from "../../stores/auth-store";
import { createId } from "../../lib/id";
import { buildApiUrl } from "../../lib/runtime-config";
import { renderMarkdown } from "../../lib/markdown-utils";
import { downloadDOCX, downloadMarkdown, downloadPDF } from "../../lib/download-utils";
import { isDocument, isDocumentRequest, shouldRenderDocumentCompletion } from "./assistant-intent";
import { DocumentPreviewPanel } from "./DocumentPreviewPanel";

const ASSISTANT_AVATAR_URL = "/brand/assistant-avatar-simple.png";
const ASSISTANT_STORAGE_PREFIX = "agenthub-assistant-";
const ASSISTANT_USER_STORAGE_PREFIX = `${ASSISTANT_STORAGE_PREFIX}user-`;
const ASSISTANT_ANONYMOUS_STORAGE_KEY = `${ASSISTANT_STORAGE_PREFIX}anonymous`;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agenthub-auth-token");
}

function getStorageKey(userId?: string | null): string {
  return userId ? `${ASSISTANT_USER_STORAGE_PREFIX}${userId}` : ASSISTANT_ANONYMOUS_STORAGE_KEY;
}

function getLegacyTokenStorageKey(): string | null {
  const token = getToken();
  return token ? `${ASSISTANT_STORAGE_PREFIX}${token.slice(0, 8)}` : null;
}

function isChatMessage(value: unknown): value is ChatMessage {
  const message = value as Partial<ChatMessage> | null;
  return Boolean(
    message &&
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.timestamp === "number"
  );
}

function loadMessagesFromKey(key: string): ChatMessage[] {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter(isChatMessage) : [];
  } catch { return []; }
}

function getMigrationStorageKeys(userId?: string | null): string[] {
  if (typeof window === "undefined") return [getStorageKey(userId)];

  const keys = new Set<string>([getStorageKey(userId), ASSISTANT_ANONYMOUS_STORAGE_KEY]);
  const tokenKey = getLegacyTokenStorageKey();
  if (tokenKey) keys.add(tokenKey);

  if (userId) {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(ASSISTANT_STORAGE_PREFIX)) continue;
      if (key.startsWith(ASSISTANT_USER_STORAGE_PREFIX) && key !== getStorageKey(userId)) continue;
      keys.add(key);
    }
  }

  return [...keys];
}

function mergeMessages(...sources: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  sources.flat().forEach((message) => byId.set(message.id, message));
  return [...byId.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-200);
}

function loadMessages(userId?: string | null): ChatMessage[] {
  return mergeMessages(...getMigrationStorageKeys(userId).map(loadMessagesFromKey));
}

function saveMessages(key: string, msgs: ChatMessage[]) {
  try {
    localStorage.setItem(key, JSON.stringify(msgs.slice(-200)));
  } catch { /* ignore quota errors */ }
}

function removeMigratedStorageKeys(keys: string[], targetKey: string) {
  keys.forEach((key) => {
    if (key !== targetKey) localStorage.removeItem(key);
  });
}

function clearStoredMessages(userId?: string | null) {
  getMigrationStorageKeys(userId).forEach((key) => localStorage.removeItem(key));
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent?: string;
  attachments?: AssistantAttachment[];
  timestamp: number;
}

type AttachmentReadState = "image" | "text" | "metadata";

interface AssistantAttachment {
  id: string;
  name: string;
  kind: "file" | "image";
  mime: string;
  size: number;
  readState: AttachmentReadState;
  note?: string;
  textPreview?: string;
  dataUrl?: string;
  previewUrl?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const WORKFLOW_HINTS = [
  "会话会自动保留最近上下文",
  "文档型回复会进入文件面板",
  "支持流式输出和中途停止",
];
const MAX_ATTACHMENTS = 8;
const MAX_UPLOAD_BATCH = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEXT_PREVIEW_LIMIT = 12000;
const TEXT_FILE_READ_LIMIT = 512 * 1024;
const TEXT_FILE_EXTENSIONS = ["md", "txt", "json", "csv", "ts", "tsx", "js", "jsx", "html", "css", "xml", "yaml", "yml", "log"];
const FILE_ACCEPT = ".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.html,.css,.xml,.yaml,.yml,.log,.pdf,.doc,.docx,.ppt,.pptx";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function estimateTokens(messages: ChatMessage[], streamBuffer: string): number {
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0) + streamBuffer.length;
  return Math.ceil(chars / 1.5);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isTextLikeFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(
    file.type.startsWith("text/") ||
    TEXT_FILE_EXTENSIONS.includes(ext ?? "")
  );
}

function attachmentStatusLabel(attachment: AssistantAttachment): string {
  if (attachment.readState === "image") return "图片已发送";
  if (attachment.readState === "text") return "已读入片段";
  return "仅元信息";
}

function attachmentStatusTone(attachment: AssistantAttachment): { color: string; background: string } {
  if (attachment.readState === "metadata") return { color: "var(--warning)", background: "var(--warning-subtle)" };
  return { color: "var(--accent)", background: "var(--accent-subtle)" };
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function createImagePreview(file: File, dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(dataUrl);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      const maxSide = 320;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.76));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function createAssistantAttachment(file: File, kind: AssistantAttachment["kind"]): Promise<AssistantAttachment> {
  const base = {
    id: createId(),
    name: file.name,
    kind,
    mime: file.type || "unknown",
    size: file.size,
  };

  if (kind === "image") {
    if (!file.type.startsWith("image/")) {
      throw new Error(`${file.name} 不是可识别的图片文件`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name} 超过 8 MB，图片会被模型拒收`);
    }
    const dataUrl = await fileToDataUrl(file);
    return {
      ...base,
      readState: "image",
      dataUrl,
      previewUrl: await createImagePreview(file, dataUrl),
    };
  }

  if (isTextLikeFile(file)) {
    const text = await file.slice(0, TEXT_FILE_READ_LIMIT).text();
    const truncated = file.size > TEXT_FILE_READ_LIMIT || text.length > TEXT_PREVIEW_LIMIT;
    return {
      ...base,
      readState: "text",
      textPreview: text.slice(0, TEXT_PREVIEW_LIMIT),
      note: truncated ? "已读取文件开头片段，超出部分未进入本轮上下文" : undefined,
    };
  }

  return {
    ...base,
    readState: "metadata",
    note: "当前格式暂不解析正文，只会把文件名、类型和大小发送给助手",
  };
}

function toMessageAttachment(attachment: AssistantAttachment): AssistantAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    kind: attachment.kind,
    mime: attachment.mime,
    size: attachment.size,
    readState: attachment.readState,
    note: attachment.note,
    previewUrl: attachment.previewUrl,
  };
}

function buildAttachmentContext(attachments: AssistantAttachment[]): string {
  if (attachments.length === 0) return "";
  const parts = attachments.map((attachment, index) => {
    const header = `${index + 1}. ${attachment.kind === "image" ? "照片" : "文件"}：${attachment.name}（${attachment.mime}，${formatBytes(attachment.size)}）`;
    if (attachment.textPreview) return `${header}\n已读取内容片段：\n${attachment.textPreview}${attachment.note ? `\n说明：${attachment.note}` : ""}`;
    if (attachment.kind === "image") return `${header}\n说明：图片内容已随本次请求发送给模型，请直接结合图片画面回答用户问题。`;
    return `${header}\n说明：${attachment.note ?? "该文件不是可直接读取的文本格式，当前请求携带文件元信息。"}`;
  });
  return `附件上下文：\n${parts.join("\n\n")}`;
}

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function AssistantAvatar({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded-full bg-center bg-no-repeat ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${ASSISTANT_AVATAR_URL})`,
        backgroundColor: "rgba(246, 242, 255, 0.98)",
        backgroundSize: "130%",
        border: "1px solid rgba(99, 102, 241, 0.14)",
      }}
    />
  );
}

function AssistantMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hidden min-w-0 rounded-lg px-2.5 py-1.5 sm:block" style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}>
      <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-0.5 truncate text-xs font-bold" style={{ color: "var(--fg-primary)" }}>{value}</p>
    </div>
  );
}

function MessageToolButton({
  title,
  onClick,
  children,
  active,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isEmphasized = active || isHovered;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-all duration-150 active:scale-95 focus-visible:outline-none"
      style={{
        color: active ? "var(--success)" : isHovered ? "var(--accent)" : "var(--fg-tertiary)",
        background: active ? "var(--success-subtle)" : isHovered ? "var(--accent-subtle)" : "transparent",
        borderColor: active ? "var(--success-border)" : isHovered ? "rgba(68,86,223,0.32)" : "transparent",
        boxShadow: isHovered ? "0 0 0 2px rgba(68,86,223,0.16), 0 3px 10px rgba(68,86,223,0.14)" : "none",
        opacity: isEmphasized ? 1 : 0.75,
      }}
    >
      {children}
    </button>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
  compact = false,
}: {
  attachment: AssistantAttachment;
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  const tone = attachmentStatusTone(attachment);
  const previewUrl = attachment.previewUrl || attachment.dataUrl;

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-lg border ${compact ? "px-2 py-1" : "px-2.5 py-2"}`}
      style={{ color: "var(--fg-secondary)", background: "var(--surface-tinted)", borderColor: "var(--border)" }}
    >
      {previewUrl ? (
        <span
          aria-hidden="true"
          className={`${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 rounded-md bg-cover bg-center`}
          style={{ backgroundImage: `url(${previewUrl})` }}
        />
      ) : (
        <span className={`${compact ? "h-7 w-7" : "h-9 w-9"} grid shrink-0 place-items-center rounded-md`} style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
          <Icon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" size={compact ? 12 : 14} />
        </span>
      )}

      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>{attachment.name}</span>
          <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-disabled)" }}>{formatBytes(attachment.size)}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={tone}>
            {attachmentStatusLabel(attachment)}
          </span>
          {attachment.note && !compact && (
            <span className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{attachment.note}</span>
          )}
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--surface-low)]"
          style={{ color: "var(--fg-tertiary)" }}
          title="移除附件"
        >
          <Icon path="M18 6 6 18M6 6l12 12" size={11} />
        </button>
      )}
    </div>
  );
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

function extractDocTitle(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const h2 = content.match(/^##\s+(.+)$/m);
  if (h2) return h2[1].trim();
  return fallback.length > 40 ? fallback.slice(0, 40) + "..." : fallback;
}

function safeDownloadTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "").replace(/\.(md|markdown|docx?|pdf)$/i, "").trim() || "文档";
}

function downloadDocumentContent(content: string, title: string, format: "md" | "docx" | "pdf" = "md") {
  const safeTitle = safeDownloadTitle(title);
  if (format === "md") downloadMarkdown(content, safeTitle);
  else if (format === "docx") downloadDOCX(content, safeTitle);
  else downloadPDF(content, safeTitle);
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[：:]\s*$/, "")
    .trim();
}

function shortenHighlight(text: string, maxLength = 42): string {
  const cleaned = stripMarkdownInline(text).replace(/\s+/g, " ");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

function extractDocumentHighlights(content: string, maxItems = 5): string[] {
  const genericHeadings = new Set(["目录", "摘要", "概述", "背景", "引言", "结论", "总结", "参考资料", "附录"]);
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^#{2,4}\s+/.test(line)) continue;

    const heading = stripMarkdownInline(line);
    if (!heading || genericHeadings.has(heading)) continue;

    const details: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (/^#{1,6}\s+/.test(nextLine)) break;
      const detail = stripMarkdownInline(nextLine);
      if (detail) details.push(detail);
      if (details.join("、").length > 64 || details.length >= 2) break;
    }

    sections.push(shortenHighlight(details.length > 0 ? `${heading}：${details.join("、")}` : heading, 72));
    if (sections.length >= maxItems) break;
  }

  const bullets = lines
    .filter((line) => /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map(shortenHighlight)
    .filter(Boolean);

  const seen = new Set<string>();
  return [...sections, ...bullets]
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, maxItems);
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
                            <button
                              type="button"
                              title="下载 Markdown"
                              onClick={(e) => { e.stopPropagation(); downloadDocumentContent(file.content, file.title, "md"); }}
                              className="p-1 rounded hover:bg-opacity-10 hover:bg-white"
                              style={{ color: "var(--fg-disabled)" }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                              </svg>
                            </button>
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      data-testid="assistant-document-card"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className="flex w-full max-w-[320px] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.99] focus-visible:outline-none"
      style={{
        background: isHovered ? "var(--accent-subtle)" : "var(--surface-tinted)",
        borderColor: isHovered ? "rgba(68,86,223,0.32)" : "var(--border-strong)",
        boxShadow: isHovered ? "0 0 0 2px rgba(68,86,223,0.14), 0 8px 20px rgba(68,86,223,0.12)" : "none",
      }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-150"
        style={{
          color: "var(--accent)",
          background: isHovered ? "var(--surface-white)" : "var(--accent-subtle)",
          boxShadow: isHovered ? "0 4px 10px rgba(68,86,223,0.16)" : "none",
        }}
      >
        <Icon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4" size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold transition-colors" style={{ color: isHovered ? "var(--accent)" : "var(--fg-primary)" }}>{title}</span>
        <span className="mt-1 block text-[10px] transition-colors" style={{ color: isHovered ? "var(--accent)" : "var(--fg-tertiary)" }}>点击预览 · 可导出 Word / PDF</span>
      </span>
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-all duration-150"
        style={{
          color: isHovered ? "var(--accent)" : "var(--fg-disabled)",
          background: "var(--surface-white)",
          borderColor: isHovered ? "rgba(68,86,223,0.32)" : "var(--border)",
          transform: isHovered ? "translateX(2px)" : "translateX(0)",
        }}
      >
        <Icon path="M9 18l6-6-6-6" size={12} />
      </span>
    </button>
  );
}

function DocumentCompletionView({
  title,
  content,
  fileTitle,
  onPreview,
}: {
  title: string;
  content: string;
  fileTitle: string;
  onPreview: () => void;
}) {
  const highlights = extractDocumentHighlights(content);

  return (
    <div className="space-y-3" data-testid="assistant-document-summary">
      <div>
        <p className="text-sm font-bold" style={{ color: "var(--fg-primary)", lineHeight: 1.65 }}>
          {title}已生成，涵盖：
        </p>
        {highlights.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {highlights.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm" style={{ color: "var(--fg-primary)", lineHeight: 1.65 }}>
                <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--fg-disabled)" }} />
                <p className="min-w-0 flex-1 break-words">{item}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm" style={{ color: "var(--fg-primary)" }}>文件在这里：</p>
        <DocumentCardTrigger title={fileTitle} onClick={onPreview} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { format: "md" as const, label: "下载 MD" },
            { format: "docx" as const, label: "Word" },
            { format: "pdf" as const, label: "PDF" },
          ].map((item) => (
            <button
              key={item.format}
              type="button"
              onClick={() => downloadDocumentContent(content, fileTitle, item.format)}
              className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-low)]"
              style={{ color: item.format === "md" ? "#174ea6" : "var(--fg-tertiary)", background: item.format === "md" ? "rgba(23,78,166,0.07)" : "var(--surface-tinted)", border: "1px solid var(--border)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)", lineHeight: 1.65 }}>
        需要转成 Word/PDF，或补充某个方向的内容，随时说。
      </p>
    </div>
  );
}

export function AIAssistantView() {
  const authUserId = useAuthStore((state) => state.user?.id ?? null);
  const assistantStorageKey = useMemo(() => getStorageKey(authUserId), [authUserId]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(null));
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const inputRefState = useRef(input);
  const messagesRef = useRef(messages);
  const storageHydratedRef = useRef(false);
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

  useEffect(() => {
    const migrationKeys = getMigrationStorageKeys(authUserId);
    const storedMessages = mergeMessages(...migrationKeys.map(loadMessagesFromKey));

    setMessages((current) => {
      const merged = mergeMessages(storedMessages, current);
      saveMessages(assistantStorageKey, merged);
      if (authUserId && merged.length > 0) removeMigratedStorageKeys(migrationKeys, assistantStorageKey);
      return merged;
    });

    storageHydratedRef.current = true;
  }, [authUserId, assistantStorageKey]);

  useEffect(() => {
    if (!storageHydratedRef.current) return;
    saveMessages(assistantStorageKey, messages);
  }, [messages, assistantStorageKey]);

  useEffect(() => {
    if (messages.length === 0 && !streamBuffer) return;
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

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const handleSend = async () => {
    if (sendingRef.current) return;
    const trimmed = inputRefState.current.trim();
    const currentAttachments = attachments;
    if ((!trimmed && currentAttachments.length === 0) || isStreamingRef.current) return;
    const attachmentContext = buildAttachmentContext(currentAttachments);
    const displayText = trimmed || "请处理这些附件。";
    const outgoingText = [displayText, attachmentContext].filter(Boolean).join("\n\n");

    sendingRef.current = true;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setInput("");
    setAttachments([]);
    setInputNotice(null);
    setStreamBuffer("");
    lastUserQueryRef.current = displayText;
    isDocRequestRef.current = isDocumentRequest(displayText);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.disabled = true;
    }

    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      content: outgoingText,
      displayContent: displayText,
      attachments: currentAttachments.map(toMessageAttachment),
      timestamp: Date.now(),
    };
    const prevMessages = messagesRef.current;
    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getToken();
      const res = await fetch(buildApiUrl("/api/assistant"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          text: outgoingText,
          history: buildHistory(prevMessages),
          attachments: currentAttachments.map((attachment) => ({
            name: attachment.name,
            kind: attachment.kind,
            mime: attachment.mime,
            size: attachment.size,
            dataUrl: attachment.kind === "image" ? attachment.dataUrl : undefined,
          })),
        }),
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
        const aiMsg: ChatMessage = { id: createId(), role: "assistant", content: fullText, timestamp: Date.now() };
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
      setMessages((prev) => [...prev, { id: createId(), role: "assistant", content: `请求失败：${(err as Error).message}`, timestamp: Date.now() }]);
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
      setMessages((prev) => [...prev, { id: createId(), role: "assistant", content, timestamp: Date.now() }]);
      if (isDocRequestRef.current && isDocument(streamBuffer)) {
        const topic = detectTopic(streamBuffer, lastUserQueryRef.current);
        addFile({
          title: generateFileName(topic, files.filter((f) => f.topic === topic).length),
          content: streamBuffer,
          topic,
          messageId: createId(),
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

  const handleUpload = async (fileList: FileList | null, kind: AssistantAttachment["kind"]) => {
    const selectedFiles = Array.from(fileList ?? []);
    if (selectedFiles.length === 0) return;
    setInputNotice(null);
    try {
      const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      if (availableSlots === 0) {
        setInputNotice(`最多同时携带 ${MAX_ATTACHMENTS} 个附件。`);
        return;
      }

      const uploadBatch = selectedFiles.slice(0, Math.min(MAX_UPLOAD_BATCH, availableSlots));
      const results = await Promise.allSettled(uploadBatch.map((file) => createAssistantAttachment(file, kind)));
      const nextAttachments = results
        .filter((result): result is PromiseFulfilledResult<AssistantAttachment> => result.status === "fulfilled")
        .map((result) => result.value);
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : "附件读取失败");

      if (nextAttachments.length > 0) {
        setAttachments((current) => [...current, ...nextAttachments].slice(0, MAX_ATTACHMENTS));
      }

      const notices = [
        selectedFiles.length > uploadBatch.length ? `已限制本次选择 ${uploadBatch.length} 个附件` : "",
        ...errors.slice(0, 2),
      ].filter(Boolean);
      setInputNotice(notices[0] ?? null);
      inputRef.current?.focus();
    } catch (error) {
      setInputNotice(error instanceof Error ? error.message : "附件读取失败");
    } finally {
      if (kind === "image" && imageInputRef.current) imageInputRef.current.value = "";
      if (kind === "file" && fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setInputNotice("当前浏览器不支持语音识别。");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      if (!transcript) return;
      setInput((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      });
    };
    recognition.onerror = (event) => {
      setInputNotice(event.error ? `语音识别失败：${event.error}` : "语音识别失败");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
      setInputNotice(null);
      setIsListening(true);
    } catch (error) {
      setInputNotice(error instanceof Error ? error.message : "语音识别启动失败");
      setIsListening(false);
    }
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
  const assistantCount = useMemo(() => messages.filter((message) => message.role === "assistant").length, [messages]);
  const savedDocIds = useMemo(() => new Set(files.map((file) => file.messageId)), [files]);
  const tokenEstimate = useMemo(() => estimateTokens(messages, streamBuffer), [messages, streamBuffer]);
  const latestUserMessage = useMemo(() => [...messages].reverse().find((message) => message.role === "user"), [messages]);
  const latestAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant"), [messages]);
  const canSend = input.trim().length > 0 || attachments.length > 0;

  const applyPreset = (prompt: string) => {
    setInput(prompt);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    });
  };

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.role === "user" ? message.displayContent ?? message.content : message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setCopiedId(null);
    }
  };

  const reuseMessage = (message: ChatMessage) => {
    applyPreset(message.role === "user"
      ? message.displayContent ?? message.content
      : `请基于这段回复继续展开，给出更具体的下一步：\n\n${message.content.slice(0, 1200)}`);
  };

  const previewDocument = (message: ChatMessage, titleOverride?: string) => {
    setPreviewDoc({
      title: titleOverride ?? extractDocTitle(message.content, "AI 生成文档"),
      content: message.content,
      messageId: message.id,
    });
  };

  const saveDocumentFromMessage = (message: ChatMessage) => {
    if (savedDocIds.has(message.id)) {
      setShowFiles(true);
      return;
    }
    const title = extractDocTitle(message.content, latestUserMessage?.content ?? "AI 生成文档");
    const topic = detectTopic(message.content, latestUserMessage?.content ?? title);
    const existingCount = files.filter((file) => file.topic === topic).length;
    addFile({
      title: generateFileName(title, existingCount),
      content: message.content,
      topic,
      messageId: message.id,
      starred: false,
    });
    setShowFiles(true);
  };

  const clearConversation = () => {
    if (messages.length === 0 || !window.confirm("清空当前 AI 助手会话记录？")) return;
    clearStoredMessages(authUserId);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setInputNotice(null);
    setStreamBuffer("");
    setPreviewDoc(null);
  };

  return (
    <div className="flex h-full relative" style={{ background: "var(--page-bg)" }}>
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0" style={{ display: isFullscreen ? "none" : undefined }}>
        {/* Header */}
        <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-glass-strong)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <AssistantAvatar size={38} />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>AI 智能助手</h1>
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: isStreaming ? "var(--accent)" : "var(--success)" }} />
                  <span className="truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                    {isStreaming ? "正在生成回复" : latestAssistantMessage ? `上次回复 ${formatMessageTime(latestAssistantMessage.timestamp)}` : "就绪"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <AssistantMetric label="回复" value={assistantCount} />
              <AssistantMetric label="文档" value={files.length} />
              <AssistantMetric label="上下文" value={`${tokenEstimate.toLocaleString()} tokens`} />
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearConversation}
                  className="hidden h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors hover:bg-[var(--danger-subtle)] md:inline-flex"
                  style={{ color: "var(--danger)", border: "1px solid rgba(220, 53, 69, 0.16)" }}
                >
                  <Icon path="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" size={13} />
                  清空
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowFiles(!showFiles)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors"
                style={{ background: showFiles ? "var(--accent-subtle)" : "var(--surface-tinted)", color: showFiles ? "var(--accent)" : "var(--fg-secondary)", border: "1px solid var(--border)" }}
              >
                <Icon path="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                文件
                {files.length > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px]" style={{ background: "var(--accent)", color: "#fff" }}>
                    {files.length}
                  </span>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {!hasMessages ? (
            <div className="flex min-h-full items-center justify-center px-5 py-8">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1.15fr_0.85fr]"
              >
                <section className="rounded-xl p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>工作助理</p>
                      <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--fg-primary)" }}>从一个清晰任务开始</h2>
                      <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--fg-secondary)", lineHeight: 1.7 }}>
                        适合临时问答、文档草稿、代码计划和产品体验审查。文档型回复会自动保存到右侧文件面板。
                      </p>
                    </div>
                    <AssistantAvatar size={44} />
                  </div>
                </section>

                <aside className="rounded-xl p-4" style={{ background: "var(--surface-glass)", border: "1px solid var(--border)" }}>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>助手能力</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>围绕当前项目工作流设计</p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--success)", background: "var(--success-subtle)" }}>
                      在线
                    </span>
                  </div>

                  <div className="space-y-2">
                    {WORKFLOW_HINTS.map((hint, index) => (
                      <div key={hint} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                          {index + 1}
                        </span>
                        <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>{hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg px-3 py-2" style={{ background: "rgba(23, 78, 166, 0.055)", border: "1px solid rgba(23, 78, 166, 0.14)" }}>
                    <p className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>建议输入方式</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.65 }}>
                      直接说目标、交付物和限制条件。例如：帮我把某个功能拆成可执行计划，并指出需要验证的页面状态。
                    </p>
                  </div>
                </aside>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              <AnimatePresence>
                {messages.map((msg, index) => {
                  const messageIsDocument = shouldRenderDocumentCompletion(messages, index);
                  const savedDocument = savedDocIds.has(msg.id);
                  const savedFile = messageIsDocument ? files.find((file) => file.messageId === msg.id) : undefined;
                  const documentTitle = messageIsDocument ? extractDocTitle(msg.content, "AI 生成文档") : "";
                  const documentFileTitle = savedFile?.title ?? documentTitle;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`group flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {msg.role === "assistant" && (
                        <AssistantAvatar size={30} className="mt-0.5" />
                      )}
                      <div className={`min-w-0 ${msg.role === "user" ? "max-w-[75%]" : "max-w-[85%]"}`}>
                        <div className={`mb-1.5 flex items-center gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <span className="text-[11px] font-semibold" style={{ color: msg.role === "user" ? "var(--accent)" : "var(--fg-tertiary)" }}>
                            {msg.role === "user" ? "我" : "AI 智能助手"}
                          </span>
                          {messageIsDocument && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                              文档
                            </span>
                          )}
                          <span style={{ fontSize: "11px", color: "var(--fg-disabled)" }}>{formatMessageTime(msg.timestamp)}</span>
                          <span className="flex items-center gap-0.5">
                            <MessageToolButton title={copiedId === msg.id ? "已复制" : "复制"} onClick={() => copyMessage(msg)} active={copiedId === msg.id}>
                              <Icon path="M8 8h11v11H8zM5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" size={12} />
                            </MessageToolButton>
                            <MessageToolButton title={msg.role === "user" ? "重新使用这条输入" : "基于这条回复继续"} onClick={() => reuseMessage(msg)}>
                              <Icon path="M3 12a9 9 0 1 0 3-6.7M3 4v6h6" size={12} />
                            </MessageToolButton>
                            {messageIsDocument && (
                              <>
                                <MessageToolButton title="预览文档" onClick={() => previewDocument(msg, documentFileTitle)}>
                                  <Icon path="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" size={12} />
                                </MessageToolButton>
                                <MessageToolButton title={savedDocument ? "已保存到文件面板" : "保存到文件面板"} onClick={() => saveDocumentFromMessage(msg)} active={savedDocument}>
                                  <Icon path="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" size={12} />
                                </MessageToolButton>
                              </>
                            )}
                          </span>
                        </div>
                        <div
                          className={`rounded-xl py-3.5 ${msg.role === "user" ? "px-4 text-right" : "px-5"}`}
                          style={{
                            background: msg.role === "user" ? "var(--accent-subtle)" : "var(--surface-white)",
                            color: msg.role === "user" ? "var(--fg-primary)" : "var(--fg-primary)",
                            border: `1px solid ${msg.role === "user" ? "var(--accent-border)" : "var(--border)"}`,
                          }}
                        >
                          {msg.role === "user" ? (
                            <div className="space-y-2">
                              <p style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.displayContent ?? msg.content}</p>
                              {(msg.attachments?.length ?? 0) > 0 && (
                                <div className="grid gap-1.5 text-left">
                                  {msg.attachments?.map((attachment) => (
                                    <AttachmentChip key={attachment.id} attachment={attachment} compact />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : messageIsDocument ? (
                            <DocumentCompletionView
                              title={documentTitle}
                              content={msg.content}
                              fileTitle={documentFileTitle}
                              onPreview={() => previewDocument(msg, documentFileTitle)}
                            />
                          ) : (
                            <div className="coze-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {isStreaming && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <AssistantAvatar size={30} className="mt-0.5" />
                  <div className="min-w-0 max-w-[85%]">
                    <div className="mb-1.5" style={{ fontSize: "12px", color: "var(--fg-tertiary)" }}>AI 智能助手</div>
                    <div className="rounded-xl px-5 py-3.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
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
        <div className="shrink-0 px-4 pb-4 pt-2" style={{ background: "linear-gradient(to top, var(--surface-white), var(--surface-glass))" }}>
          <div className="mx-auto max-w-3xl">
            <div
              className="rounded-xl px-3 py-2 transition-all"
              style={{ background: "var(--surface-white)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-xs)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-subtle)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={FILE_ACCEPT}
                onChange={(event) => void handleUpload(event.target.files, "file")}
              />
              <input
                ref={imageInputRef}
                type="file"
                multiple
                className="hidden"
                accept={IMAGE_ACCEPT}
                onChange={(event) => void handleUpload(event.target.files, "image")}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={latestUserMessage ? "继续追问、要求改写，或让助手生成文档..." : "描述目标、交付物和限制条件..."}
                rows={1}
                className="w-full resize-none bg-transparent outline-none"
                style={{ fontSize: "14px", color: "var(--fg-primary)", minHeight: 28, maxHeight: 160, lineHeight: 1.6 }}
              />
              {(attachments.length > 0 || inputNotice) && (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {attachments.map((attachment) => (
                    <AttachmentChip key={attachment.id} attachment={attachment} onRemove={removeAttachment} compact />
                  ))}
                  {inputNotice && (
                    <span className="rounded-lg px-2 py-1 text-[10px] font-semibold sm:col-span-2" style={{ color: "var(--warning)", background: "var(--warning-subtle)" }}>
                      {inputNotice}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
                    style={{ color: isListening ? "var(--accent)" : "var(--fg-tertiary)", background: isListening ? "var(--accent-subtle)" : "transparent", border: "1px solid var(--border)" }}
                    title={isListening ? "停止语音识别" : "语音识别"}
                  >
                    <Icon path="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
                    style={{ color: "var(--fg-tertiary)", border: "1px solid var(--border)" }}
                    title="上传文件"
                  >
                    <Icon path="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
                    style={{ color: "var(--fg-tertiary)", border: "1px solid var(--border)" }}
                    title="上传照片"
                  >
                    <Icon path="M4 5h16v14H4zM8 13l2.5-3 3 4 2-2.5L20 16M8 8h.01" size={14} />
                  </button>
                  <span className="hidden truncate text-[10px] sm:inline" style={{ color: "var(--fg-tertiary)" }}>
                    最近上下文 {messages.length} 条 · 附件 {attachments.length}
                  </span>
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
                    style={{ background: "var(--danger-subtle)", color: "var(--danger)", border: "1px solid rgba(220, 53, 69, 0.16)" }}
                  >
                    <Icon path="M6 6h12v12H6z" size={12} />
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all active:scale-95"
                    style={{
                      background: canSend ? "var(--accent)" : "var(--surface-low)",
                      color: canSend ? "#fff" : "var(--fg-disabled)",
                      border: `1px solid ${canSend ? "var(--accent)" : "var(--border)"}`,
                      boxShadow: canSend ? "var(--accent-glow)" : "none",
                    }}
                  >
                    发送
                    <Icon path="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" size={12} />
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
