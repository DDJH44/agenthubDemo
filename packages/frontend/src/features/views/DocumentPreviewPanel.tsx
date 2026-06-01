"use client";

import { useState, useCallback } from "react";
import { downloadMarkdown, downloadPDF, downloadDOCX } from "../../lib/download-utils";
import { renderMarkdown } from "../../lib/markdown-utils";

interface DocumentPreviewPanelProps {
  title: string;
  content: string;
  onClose: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export function DocumentPreviewPanel({
  title,
  content,
  onClose,
  onToggleFullscreen,
  isFullscreen,
}: DocumentPreviewPanelProps) {
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").trim() || "文档";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API failed - ignore
    }
  }, [content]);

  const handleDownload = useCallback((format: "md" | "pdf" | "docx") => {
    if (format === "md") downloadMarkdown(content, safeTitle);
    else if (format === "pdf") downloadPDF(content, safeTitle);
    else downloadDOCX(content, safeTitle);
    setShowDownloadMenu(false);
  }, [content, safeTitle]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="shrink-0">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--fg-primary)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {safeTitle}
        </span>

        {/* Copy */}
        <button
          onClick={handleCopy}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0"
          style={{ color: copied ? "var(--success)" : "var(--fg-tertiary)" }}
          title="复制内容"
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>

        {/* Download dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--fg-tertiary)" }}
            title="下载"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          {showDownloadMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDownloadMenu(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg py-1"
                style={{
                  background: "var(--surface-white)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                  minWidth: 130,
                }}
              >
                {[
                  { format: "md" as const, label: "Markdown", ext: ".md", color: "#3b82f6" },
                  { format: "pdf" as const, label: "PDF 文件", ext: ".pdf", color: "#ef4444" },
                  { format: "docx" as const, label: "Word 文档", ext: ".doc", color: "#2563eb" },
                ].map((item) => (
                  <button
                    key={item.format}
                    onClick={() => handleDownload(item.format)}
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs transition-colors"
                    style={{ color: "var(--fg-primary)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span
                      className="w-7 h-4 rounded flex items-center justify-center text-white shrink-0"
                      style={{ fontSize: "9px", fontWeight: 700, background: item.color }}
                    >
                      {item.ext}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={onToggleFullscreen}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0"
          style={{ color: "var(--fg-tertiary)" }}
          title={isFullscreen ? "退出全屏" : "全屏"}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {isFullscreen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0"
          style={{ color: "var(--fg-tertiary)" }}
          title="关闭"
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: isFullscreen ? "24px 32px" : "16px 20px" }}
      >
        <div className={isFullscreen ? "max-w-4xl mx-auto" : ""}>
          <div
            className="coze-prose"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 flex items-center px-4 py-2"
        style={{ borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--fg-tertiary)" }}
      >
        <span>{(content.length / 1000).toFixed(1)}k 字符</span>
        <span style={{ margin: "0 4px", color: "var(--fg-disabled)" }}>·</span>
        <span>{content.split("\n").filter((l) => l.trim()).length} 行</span>
      </div>
    </div>
  );
}
