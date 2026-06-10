"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Artifact } from "@agenthub/shared";
import { createId } from "@/lib/id";
import { renderMarkdown } from "@/lib/markdown-utils";
import { downloadDOCX, downloadMarkdown, downloadPDF } from "@/lib/download-utils";
import { useChatStore } from "@/stores/chat-store";
import { downloadSlidesAsPptx, getPptxFilename } from "./pptx-export";
import { parseSlidesArtifact } from "./slide-parser";
import { getDeployProviderLabel } from "./deploy-platforms";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.default), { ssr: false });
const MonacoDiffEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.DiffEditor), { ssr: false });

export type ArtifactCardType = "code" | "html" | "json" | "markdown" | "document" | "slides" | "preview_url" | "deploy_url" | "diff";

interface Props {
  type: ArtifactCardType;
  content: string;
  artifactId?: string;
  conversationId?: string;
  filename?: string;
  language?: string;
  deployUrl?: string;
  deployDescription?: string;
  deployStatus?: string;
  deployProvider?: string;
  deployError?: string;
  deployVerified?: boolean;
  deployVerificationStatus?: number;
  deployProgress?: number;
  onEdit?: (content: string) => void;
  onDeploy?: () => void;
  onPreview?: () => void;
}

const LANG_MAP: Record<string, string> = {
  html: "html",
  css: "css",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  go: "go",
  rust: "rust",
  diff: "diff",
  document: "markdown",
  slides: "markdown",
};

const LANG_LABEL: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JS",
  typescript: "TS",
  json: "JSON",
  markdown: "MD",
  python: "Python",
  diff: "Diff",
};

const HANDOFF_AGENTS = [
  { id: "pmo", label: "PMO", sender: "planner" },
  { id: "codex", label: "Codex", sender: "coder" },
  { id: "ux-reviewer", label: "UX", sender: "refiner" },
];

const CODE_CARD_COLLAPSED_HEIGHT = 360;
const CODE_CARD_EXPANDED_HEIGHT = "min(68vh, 680px)";

function currentTime() {
  return Date.now();
}

function getLanguage(type: ArtifactCardType, language?: string, filename?: string) {
  if (type === "html") return "html";
  if (type === "json") return "json";
  if (type === "diff") return "diff";
  const ext = filename?.split(".").pop()?.toLowerCase();
  return LANG_MAP[language ?? ""] ?? LANG_MAP[ext ?? ""] ?? language ?? "plaintext";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
      style={{ color: copied ? "var(--success)" : "var(--fg-tertiary)" }}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function safeDownloadTitle(filename?: string) {
  return (filename || "document")
    .replace(/\.(md|markdown|docx?|pdf)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim() || "document";
}

function DocumentDownloadMenu({
  content,
  filename,
}: {
  content: string;
  filename?: string;
}) {
  const [open, setOpen] = useState(false);
  const safeTitle = safeDownloadTitle(filename);

  const handleDownload = (format: "md" | "docx" | "pdf") => {
    if (format === "md") downloadMarkdown(content, safeTitle);
    else if (format === "docx") downloadDOCX(content, safeTitle);
    else downloadPDF(content, safeTitle);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
        style={{ color: "var(--accent)" }}
      >
        下载
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="关闭下载菜单"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-20 mt-1 min-w-[132px] overflow-hidden rounded-lg py-1"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
          >
            {[
              { format: "md" as const, label: "Markdown", badge: "MD" },
              { format: "docx" as const, label: "Word 文档", badge: "DOC" },
              { format: "pdf" as const, label: "PDF 打印", badge: "PDF" },
            ].map((item) => (
              <button
                key={item.format}
                type="button"
                onClick={() => handleDownload(item.format)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--surface-low)]"
                style={{ color: "var(--fg-secondary)" }}
              >
                <span className="grid h-5 min-w-7 place-items-center rounded text-[9px] font-black" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                  {item.badge}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardShell({
  title,
  meta,
  children,
  actions,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="my-1.5 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
      <div className="flex min-h-9 items-center justify-between gap-2 px-3" style={{ background: "var(--surface-low)", borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <span className="block truncate text-[11px] font-bold" style={{ color: "var(--fg-primary)" }}>
            {title}
          </span>
          {meta && <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{meta}</span>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function CodeView({
  type,
  content,
  language,
  filename,
  onEdit,
  onPreview,
}: {
  type: ArtifactCardType;
  content: string;
  language?: string;
  filename?: string;
  onEdit?: (content: string) => void;
  onPreview?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const lang = getLanguage(type, language, filename);
  const langLabel = LANG_LABEL[lang] ?? lang.toUpperCase();
  const codeHeight = expanded || editing ? CODE_CARD_EXPANDED_HEIGHT : CODE_CARD_COLLAPSED_HEIGHT;

  const handleSave = () => {
    onEdit?.(editContent);
    setEditing(false);
  };

  return (
    <CardShell
      title={filename || "untitled"}
      meta={langLabel}
      actions={
        <>
          <CopyButton text={content} />
          {onPreview && type === "html" && (
            <button
              type="button"
              onClick={onPreview}
              className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
              style={{ color: "var(--accent)" }}
            >
              预览
            </button>
          )}
          {onEdit && !editing && (
            <button
              type="button"
              onClick={() => { setEditContent(content); setEditing(true); }}
              className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
              style={{ color: "var(--accent)" }}
            >
              编辑
            </button>
          )}
          {editing && (
            <>
              <button type="button" onClick={handleSave} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "var(--success)", background: "var(--success-subtle)" }}>
                保存
              </button>
              <button type="button" onClick={() => setEditing(false)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                取消
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
            style={{ color: "var(--fg-tertiary)" }}
          >
            {expanded ? "收起" : "展开"}
          </button>
        </>
      }
    >
      <div
        className="min-w-0 overflow-hidden"
        style={{ height: codeHeight, width: "100%", minWidth: 0 }}
      >
        {expanded || editing ? (
          <MonacoEditor
            height="100%"
            width="100%"
            language={lang}
            value={editing ? editContent : content}
            onChange={editing ? (value) => setEditContent(value ?? "") : undefined}
            theme="vs-dark"
            options={{
              readOnly: !editing,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 18,
              wordWrap: "off",
              tabSize: 2,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
              folding: true,
              glyphMargin: false,
              fixedOverflowWidgets: true,
              overviewRulerLanes: 0,
              overviewRulerBorder: false,
              scrollbar: {
                horizontal: "visible",
                vertical: "visible",
                horizontalScrollbarSize: 10,
                verticalScrollbarSize: 10,
                alwaysConsumeMouseWheel: false,
              },
              padding: { top: 8 },
            }}
          />
        ) : (
          <pre
            className="m-0 overflow-auto p-3 custom-scrollbar"
            style={{
              height: CODE_CARD_COLLAPSED_HEIGHT,
              maxHeight: CODE_CARD_COLLAPSED_HEIGHT,
              color: "var(--fg-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.6,
              minWidth: "100%",
              overscrollBehavior: "contain",
              tabSize: 2,
              whiteSpace: "pre",
              wordBreak: "normal",
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </CardShell>
  );
}

function MarkdownView({ content, filename }: { content: string; filename?: string }) {
  const [sourceMode, setSourceMode] = useState(false);
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <CardShell
      title={filename || "document.md"}
      meta="Markdown"
      actions={
        <>
          <CopyButton text={content} />
          <DocumentDownloadMenu content={content} filename={filename} />
          <button
            type="button"
            onClick={() => setSourceMode((value) => !value)}
            className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
            style={{ color: "var(--accent)" }}
          >
            {sourceMode ? "预览" : "源码"}
          </button>
        </>
      }
    >
      <div className="max-h-[420px] overflow-auto p-3 custom-scrollbar">
        {sourceMode ? (
          <pre className="m-0 min-w-max whitespace-pre" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, tabSize: 2 }}>
            {content}
          </pre>
        ) : (
          <div className="prose-chat" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </CardShell>
  );
}

function extractDocumentParagraphs(content: string) {
  return content
    .split(/\n\s*\n/g)
    .map((block) => block.replace(/^#+\s+/gm, "").replace(/^>\s?/gm, "").replace(/^- /gm, "").trim())
    .filter((block) => block.length >= 18)
    .slice(0, 8);
}

function DocumentView({
  content,
  filename,
  artifactId,
  conversationId,
  onPreview,
}: {
  content: string;
  filename?: string;
  artifactId?: string;
  conversationId?: string;
  onPreview?: () => void;
}) {
  const [sourceMode, setSourceMode] = useState(false);
  const [expandedQuotes, setExpandedQuotes] = useState(false);
  const [referencedId, setReferencedId] = useState<string | null>(null);
  const addContextReference = useChatStore((state) => state.addContextReference);
  const addMessage = useChatStore((state) => state.addMessage);
  const html = useMemo(() => renderMarkdown(content), [content]);
  const paragraphs = useMemo(() => extractDocumentParagraphs(content), [content]);
  const visibleParagraphs = expandedQuotes ? paragraphs : paragraphs.slice(0, 3);
  const title = filename || "document.md";

  const referenceParagraph = (text: string, index: number) => {
    if (!conversationId) return;
    const refId = `${artifactId || title}-paragraph-${index + 1}`;
    addContextReference(conversationId, {
      id: refId,
      sourceType: "artifact",
      sender: title,
      senderId: artifactId,
      title: `${title} · 第 ${index + 1} 段`,
      content: text,
    });
    setReferencedId(refId);
    window.setTimeout(() => setReferencedId(null), 1400);
  };

  const handoffParagraph = (text: string, index: number, agent: (typeof HANDOFF_AGENTS)[number]) => {
    if (!conversationId) return;
    referenceParagraph(text, index);
    addMessage(conversationId, {
      id: createId(),
      conversationId,
      type: "user_message",
      sender: "user",
      content: `@${agent.id} 请处理 ${title} 第 ${index + 1} 段引用：\n\n> ${text}`,
      mentions: [agent.id],
      payload: {
        contextAction: "document-paragraph-handoff",
        artifactId,
        filename: title,
        paragraphIndex: index + 1,
        quote: text,
      },
      timestamp: currentTime(),
    });
    addMessage(conversationId, {
      id: createId(),
      conversationId,
      type: "agent_message",
      sender: agent.sender,
      senderId: agent.id,
      content: `${agent.label} 已接收 ${title} 第 ${index + 1} 段引用，会基于这段内容继续处理。`,
      payload: {
        contextAction: "document-paragraph-accepted",
        artifactId,
        filename: title,
        paragraphIndex: index + 1,
      },
      timestamp: currentTime(),
    });
  };

  return (
    <CardShell
      title={title}
      meta="文档"
      actions={
        <>
          <CopyButton text={content} />
          <DocumentDownloadMenu content={content} filename={title} />
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
              style={{ color: "var(--accent)" }}
            >
              打开预览
            </button>
          )}
          <button
            type="button"
            onClick={() => setSourceMode((value) => !value)}
            className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
            style={{ color: "var(--accent)" }}
          >
            {sourceMode ? "预览" : "源码"}
          </button>
        </>
      }
    >
      <div className="max-h-[420px] overflow-auto p-3 custom-scrollbar">
        {sourceMode ? (
          <pre className="m-0 min-w-max whitespace-pre" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, tabSize: 2 }}>
            {content}
          </pre>
        ) : (
          <div className="prose-chat" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>

      {paragraphs.length > 0 && (
        <div className="space-y-2 p-3" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-low)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold" style={{ color: "var(--fg-tertiary)" }}>段落引用</span>
            {paragraphs.length > 3 && (
              <button type="button" onClick={() => setExpandedQuotes((value) => !value)} className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
                {expandedQuotes ? "收起" : `全部 ${paragraphs.length} 段`}
              </button>
            )}
          </div>
          {visibleParagraphs.map((paragraph, index) => {
            const refId = `${artifactId || title}-paragraph-${index + 1}`;
            return (
              <div key={refId} className="rounded-md p-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <p className="line-clamp-3 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.6 }}>{paragraph}</p>
                {conversationId && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => referenceParagraph(paragraph, index)} className="rounded px-2 py-1 text-[10px] font-semibold" style={{ color: referencedId === refId ? "var(--success)" : "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                      {referencedId === refId ? "已引用" : "引用"}
                    </button>
                    {HANDOFF_AGENTS.map((agent) => (
                      <button key={agent.id} type="button" onClick={() => handoffParagraph(paragraph, index, agent)} className="rounded px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                        交 {agent.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

function SlidesView({
  content,
  filename,
  artifactId,
  onPreview,
}: {
  content: string;
  filename?: string;
  artifactId?: string;
  onPreview?: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const artifact = useMemo<Artifact>(() => ({
    id: artifactId || filename || "inline-slides",
    jobId: "inline-message",
    type: "slides",
    content,
    filename,
    createdAt: 0,
  }), [artifactId, content, filename]);
  const slides = useMemo(() => parseSlidesArtifact(artifact), [artifact]);
  const pptxFilename = getPptxFilename(filename);
  const slideTitles = slides.slice(0, 3).map((slide) => slide.title);

  const handleDownload = async () => {
    if (slides.length === 0 || exporting) return;
    setExporting(true);
    try {
      await downloadSlidesAsPptx(slides, pptxFilename);
    } finally {
      setExporting(false);
    }
  };

  return (
    <CardShell
      title={pptxFilename}
      meta={`PPTX · ${slides.length || 1} 页`}
      actions={
        <>
          <CopyButton text={content} />
          {onPreview && (
            <button type="button" onClick={onPreview} className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]" style={{ color: "var(--accent)" }}>
              预览
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={slides.length === 0 || exporting}
            className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)] disabled:opacity-45"
            style={{ color: "var(--accent)" }}
          >
            {exporting ? "生成中" : "下载 PPTX"}
          </button>
        </>
      }
    >
      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--surface-low)]"
        style={{ color: "inherit" }}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[11px] font-black"
          style={{ color: "#fff", background: "linear-gradient(135deg, var(--accent), #7C3AED)", boxShadow: "0 10px 22px var(--accent-border)" }}
        >
          PPTX
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{pptxFilename}</span>
          <span className="mt-1 block text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.5 }}>
            {slideTitles.length > 0 ? slideTitles.join(" / ") : "点击预览后在右侧工作台浏览"}
          </span>
        </span>
        <span className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
          点击预览
        </span>
      </button>
    </CardShell>
  );
}

function PreviewView({ url, content }: { url?: string; content?: string }) {
  const openUrl = url && /^https?:\/\//.test(url) ? url : undefined;

  return (
    <CardShell
      title="产物预览"
      meta={openUrl || "inline preview"}
      actions={openUrl ? (
        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="h-6 rounded px-2 text-[10px] font-semibold no-underline" style={{ color: "var(--accent)" }}>
          打开
        </a>
      ) : undefined}
    >
      <iframe
        src={openUrl}
        srcDoc={!openUrl ? content : undefined}
        className="w-full border-0"
        style={{ height: 360, background: "#fff" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="artifact-preview"
      />
    </CardShell>
  );
}

function DiffView({ content, original }: { content: string; original?: string }) {
  const [sideBySide, setSideBySide] = useState(false);

  if (sideBySide && original) {
    return (
      <CardShell
        title="代码 Diff"
        meta="并排对比"
        actions={
          <button type="button" onClick={() => setSideBySide(false)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
            文本视图
          </button>
        }
      >
        <div style={{ height: 360 }}>
          <MonacoDiffEditor
            height="100%"
            language="diff"
            original={original}
            modified={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 18,
              wordWrap: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fixedOverflowWidgets: true,
              overviewRulerLanes: 0,
              scrollbar: {
                horizontal: "visible",
                vertical: "visible",
                horizontalScrollbarSize: 10,
                verticalScrollbarSize: 10,
                alwaysConsumeMouseWheel: false,
              },
            }}
          />
        </div>
      </CardShell>
    );
  }

  const lines = content.split("\n");

  return (
    <CardShell
      title="代码 Diff"
      meta={`${lines.length} 行变更`}
      actions={
        <>
          <CopyButton text={content} />
          {original && (
            <button type="button" onClick={() => setSideBySide(true)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
              并排
            </button>
          )}
        </>
      }
    >
      <pre className="m-0 max-h-[340px] overflow-auto whitespace-pre p-2 custom-scrollbar" style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.6, tabSize: 2 }}>
        {lines.map((line, index) => {
          const removed = line.startsWith("-") && !line.startsWith("---");
          const added = line.startsWith("+") && !line.startsWith("+++");
          const header = line.startsWith("@@");
          return (
            <div
              key={`${index}-${line}`}
              style={{
                background: removed ? "rgba(165, 14, 14, 0.07)" : added ? "rgba(24, 128, 56, 0.08)" : header ? "var(--accent-subtle)" : "transparent",
                color: removed ? "#a50e0e" : added ? "#188038" : header ? "var(--accent)" : "var(--fg-secondary)",
                padding: "0 6px",
                minWidth: "100%",
                width: "max-content",
              }}
            >
              {line || " "}
            </div>
          );
        })}
      </pre>
    </CardShell>
  );
}

function DeployView({
  url,
  description,
  status,
  provider,
  error,
  verified,
  verificationStatus,
  progress,
  conversationId,
}: {
  url?: string;
  description?: string;
  status?: string;
  provider?: string;
  error?: string;
  verified?: boolean;
  verificationStatus?: number;
  progress?: number;
  conversationId?: string;
}) {
  const done = status === "done" || status === "completed" || status === "success";
  const failed = status === "failed" || status === "error";
  const providerLabel = provider ? getDeployProviderLabel(provider) : "";
  const label = done ? "部署完成" : failed ? "部署失败" : "部署中";
  const color = done ? "var(--success)" : failed ? "var(--danger)" : "var(--accent)";
  const displayLabel = done && verified ? "部署完成，已验证" : label;
  const normalizedProgress = failed ? 100 : done ? 100 : Math.max(0, Math.min(progress ?? 35, 100));
  const addMessage = useChatStore((state) => state.addMessage);

  const handoffToCodex = () => {
    if (!conversationId) return;
    const detail = error || "部署失败，请检查构建日志、平台配置和入口文件。";
    addMessage(conversationId, {
      id: createId(),
      conversationId,
      type: "user_message",
      sender: "user",
      content: `@codex 请根据部署状态卡片修复失败问题：\n\n${detail}`,
      mentions: ["codex"],
      payload: {
        contextAction: "deploy-card-repair",
        provider,
        error: detail,
      },
      timestamp: Date.now(),
    });
    addMessage(conversationId, {
      id: createId(),
      conversationId,
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: "Codex 已接收部署失败卡片，会检查产物入口、构建配置和平台凭证。",
      payload: {
        contextAction: "deploy-card-repair-accepted",
        provider,
      },
      timestamp: Date.now(),
    });
  };

  return (
    <CardShell
      title="部署状态"
      meta={providerLabel ? `${providerLabel} · ${label}` : label}
      actions={
        <>
          {failed && conversationId && (
            <button type="button" onClick={handoffToCodex} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
              交给 Codex
            </button>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="h-6 rounded px-2 text-[10px] font-semibold no-underline" style={{ color: "var(--accent)" }}>
              访问
            </a>
          )}
        </>
      }
    >
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold" style={{ color }}>{displayLabel}</span>
        </div>
        {verified && (
          <p className="mt-2 w-fit rounded-md px-2 py-1 text-[11px] font-semibold" style={{ color: "var(--success)", background: "var(--success-subtle)", border: "1px solid var(--success-border)" }}>
            已验证可访问{verificationStatus ? ` · HTTP ${verificationStatus}` : ""}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-md px-2 py-1.5 text-xs" style={{ color: "var(--danger)", background: "var(--danger-subtle)", lineHeight: 1.5 }}>
            {error}
          </p>
        )}
        {description && !error && (
          <p className="mt-2 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.5 }}>
            {description}
          </p>
        )}
        {url && (
          <p className="mt-2 break-all text-xs" style={{ color: "var(--fg-tertiary)" }}>
            {url}
          </p>
        )}
        {!done && !failed && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
            <div className="h-full animate-pulse" style={{ width: `${normalizedProgress}%`, background: color }} />
          </div>
        )}
      </div>
    </CardShell>
  );
}

export function ArtifactCard({
  type,
  content,
  artifactId,
  conversationId,
  filename,
  language,
  deployUrl,
  deployDescription,
  deployStatus,
  deployProvider,
  deployError,
  deployVerified,
  deployVerificationStatus,
  deployProgress,
  onEdit,
  onPreview,
}: Props) {
  switch (type) {
    case "code":
    case "html":
    case "json":
      return <CodeView type={type} content={content} language={language} filename={filename} onEdit={onEdit} onPreview={onPreview} />;
    case "markdown":
      return <MarkdownView content={content} filename={filename} />;
    case "document":
      return <DocumentView content={content} filename={filename} artifactId={artifactId} conversationId={conversationId} onPreview={onPreview} />;
    case "slides":
      return <SlidesView content={content} filename={filename} artifactId={artifactId} onPreview={onPreview} />;
      case "preview_url":
        return <PreviewView url={deployUrl || content} content={content} />;
    case "deploy_url":
      {
        const contentUrl = /^(https?:\/\/|\/api\/|\/artifact-|\/preview\/)/i.test(content.trim()) ? content.trim() : undefined;
        const resolvedUrl = deployUrl || contentUrl;
        return <DeployView url={resolvedUrl} description={deployDescription || (!resolvedUrl ? content : undefined)} status={deployStatus} provider={deployProvider} error={deployError} verified={deployVerified} verificationStatus={deployVerificationStatus} progress={deployProgress} conversationId={conversationId} />;
      }
    case "diff":
      return <DiffView content={content} />;
    default:
      return <CodeView type="code" content={content} language={language} filename={filename} />;
  }
}
