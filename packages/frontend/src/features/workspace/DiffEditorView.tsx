"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const MonacoDiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false });

interface Props {
  original: string;
  modified: string;
  language?: string;
  fileName?: string;
  height?: string | number;
  minHeight?: number;
  readOnly?: boolean;
  onModifiedChange?: (value: string) => void;
}

const LANG_MAP: Record<string, string> = {
  html: "html", css: "css", js: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json",
  py: "python", go: "go", rust: "rust", diff: "diff",
};

export function DiffEditorView({
  original,
  modified,
  language,
  fileName,
  height,
  minHeight = 300,
  readOnly = true,
  onModifiedChange: _onModifiedChange,
}: Props) {
  const [copied, setCopied] = useState(false);
  const monacoLang = LANG_MAP[language ?? ""] ?? language ?? "plaintext";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(modified);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [modified]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#1e1e1e", minHeight }}>
      <div className="flex items-center shrink-0 px-3 justify-between" style={{ height: 32, background: "#2d2d2d", borderBottom: "1px solid #3e3e3e" }}>
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M3 12h18" />
          </svg>
          <span style={{ fontSize: 10, color: "#ccc", fontWeight: 500 }}>
            {fileName ?? "diff"}
          </span>
          <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: "#4ec9b0", background: "rgba(78,201,176,0.15)" }}>
            Diff
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy}
            className="rounded px-2 py-0.5 transition-all hover:bg-[#3e3e3e]"
            style={{ fontSize: 9, color: copied ? "#4ec9b0" : "#888" }}>
            {copied ? "已复制" : "复制修改后"}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <MonacoDiffEditor
          height={height ?? "100%"}
          width="100%"
          language={monacoLang}
          original={original}
          modified={modified}
          theme="vs-dark"
          options={{
            readOnly,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            scrollBeyondLastLine: false,
            wordWrap: "off",
            renderLineHighlight: "line",
            smoothScrolling: true,
            automaticLayout: true,
            fixedOverflowWidgets: true,
            overviewRulerLanes: 0,
            scrollbar: {
              horizontal: "visible",
              vertical: "visible",
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              alwaysConsumeMouseWheel: false,
            },
            folding: true,
            lineNumbers: "on",
            glyphMargin: false,
            renderOverviewRuler: true,
            diffAlgorithm: "advanced",
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
          }}
        />
      </div>
    </div>
  );
}
