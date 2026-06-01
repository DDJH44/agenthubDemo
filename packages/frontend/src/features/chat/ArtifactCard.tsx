"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { renderMarkdown } from "@/lib/markdown-utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.default), { ssr: false });
const MonacoDiffEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.DiffEditor), { ssr: false });

export type ArtifactCardType = "code" | "html" | "json" | "markdown" | "preview_url" | "deploy_url" | "diff";

interface Props {
  type: ArtifactCardType;
  content: string;
  filename?: string;
  language?: string;
  deployUrl?: string;
  deployStatus?: string;
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
              style={{ color: "#174ea6" }}
            >
              预览
            </button>
          )}
          {onEdit && !editing && (
            <button
              type="button"
              onClick={() => { setEditContent(content); setEditing(true); }}
              className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
              style={{ color: "#174ea6" }}
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
      <div style={{ height: expanded || editing ? 420 : 220 }}>
        {expanded || editing ? (
          <MonacoEditor
            height="100%"
            language={lang}
            value={editing ? editContent : content}
            onChange={editing ? (value) => setEditContent(value ?? "") : undefined}
            theme="vs-dark"
            options={{
              readOnly: !editing,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 18,
              wordWrap: "on",
              tabSize: 2,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
              folding: true,
              glyphMargin: false,
              overviewRulerBorder: false,
              padding: { top: 8 },
            }}
          />
        ) : (
          <pre
            className="m-0 overflow-auto p-3"
            style={{
              maxHeight: 220,
              color: "var(--fg-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
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
          <button
            type="button"
            onClick={() => setSourceMode((value) => !value)}
            className="h-6 rounded px-2 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-mid)]"
            style={{ color: "#174ea6" }}
          >
            {sourceMode ? "预览" : "源码"}
          </button>
        </>
      }
    >
      <div className="max-h-[420px] overflow-auto p-3">
        {sourceMode ? (
          <pre className="m-0 whitespace-pre-wrap" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6 }}>
            {content}
          </pre>
        ) : (
          <div className="prose-chat" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
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
        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="h-6 rounded px-2 text-[10px] font-semibold no-underline" style={{ color: "#174ea6" }}>
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
          <button type="button" onClick={() => setSideBySide(false)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "#174ea6" }}>
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
              scrollBeyondLastLine: false,
              automaticLayout: true,
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
            <button type="button" onClick={() => setSideBySide(true)} className="h-6 rounded px-2 text-[10px] font-semibold" style={{ color: "#174ea6" }}>
              并排
            </button>
          )}
        </>
      }
    >
      <pre className="m-0 max-h-[340px] overflow-auto p-2" style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.6 }}>
        {lines.map((line, index) => {
          const removed = line.startsWith("-") && !line.startsWith("---");
          const added = line.startsWith("+") && !line.startsWith("+++");
          const header = line.startsWith("@@");
          return (
            <div
              key={`${index}-${line}`}
              style={{
                background: removed ? "rgba(165, 14, 14, 0.07)" : added ? "rgba(24, 128, 56, 0.08)" : header ? "rgba(23, 78, 166, 0.07)" : "transparent",
                color: removed ? "#a50e0e" : added ? "#188038" : header ? "#174ea6" : "var(--fg-secondary)",
                padding: "0 6px",
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

function DeployView({ url, status }: { url?: string; status?: string }) {
  const done = status === "done" || status === "completed";
  const failed = status === "failed" || status === "error";
  const label = done ? "部署完成" : failed ? "部署失败" : "部署中";
  const color = done ? "var(--success)" : failed ? "var(--danger)" : "#174ea6";

  return (
    <CardShell
      title="部署状态"
      meta={label}
      actions={url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="h-6 rounded px-2 text-[10px] font-semibold no-underline" style={{ color: "#174ea6" }}>
          访问
        </a>
      ) : undefined}
    >
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold" style={{ color }}>{label}</span>
        </div>
        {url && (
          <p className="mt-2 break-all text-xs" style={{ color: "var(--fg-tertiary)" }}>
            {url}
          </p>
        )}
        {!done && !failed && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
            <div className="h-full w-2/3 animate-pulse" style={{ background: color }} />
          </div>
        )}
      </div>
    </CardShell>
  );
}

export function ArtifactCard({
  type,
  content,
  filename,
  language,
  deployUrl,
  deployStatus,
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
    case "preview_url":
      return <PreviewView url={deployUrl || content} content={content} />;
    case "deploy_url":
      return <DeployView url={deployUrl || content} status={deployStatus} />;
    case "diff":
      return <DiffView content={content} />;
    default:
      return <CodeView type="code" content={content} language={language} filename={filename} />;
  }
}
