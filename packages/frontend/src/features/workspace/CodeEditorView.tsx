"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), { ssr: false });

const LANG_MAP: Record<string, string> = {
  html: "html", css: "css", js: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json",
  md: "markdown", py: "python", go: "go", rust: "rust", diff: "diff",
  yaml: "yaml", yml: "yaml", xml: "xml", sql: "sql", sh: "shell",
  bash: "shell", java: "java", cpp: "cpp", c: "c", php: "php",
  ruby: "ruby", swift: "swift", kotlin: "kotlin", scala: "scala",
  r: "r", lua: "lua", perl: "perl", dockerfile: "dockerfile",
};

const LANG_TAGS: Record<string, string> = {
  html: "HTML", css: "CSS", js: "JS", javascript: "JS",
  ts: "TS", tsx: "TSX", jsx: "JSX", json: "JSON",
  md: "MD", py: "Python", go: "Go", rust: "Rust", diff: "Diff",
};

interface Props {
  fileName?: string;
  content?: string;
  language?: string;
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
  previewEnabled?: boolean;
  previewContent?: string;
  height?: string | number;
  minHeight?: number;
}

export function CodeEditorView({
  fileName,
  content: initialContent,
  language,
  readOnly = false,
  onContentChange,
  previewEnabled,
  previewContent,
  height,
  minHeight = 300,
}: Props) {
  const [content, setContent] = useState(initialContent ?? "");
  const [showPreview, setShowPreview] = useState(previewEnabled ?? true);
  const [copied, setCopied] = useState(false);

  const monacoLang = LANG_MAP[language ?? ""] ?? language ?? "plaintext";
  const langTag = LANG_TAGS[language ?? ""] ?? (language?.toUpperCase() ?? "TEXT");

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? "";
    setContent(v);
    onContentChange?.(v);
  }, [onContentChange]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  const htmlContent = language === "html" ? content : previewContent ?? content;

  return (
    <div className="flex flex-col h-full" style={{ background: "#1e1e1e", minHeight }}>
      <div className="flex items-center shrink-0 px-3 justify-between" style={{ height: 32, background: "#2d2d2d", borderBottom: "1px solid #3e3e3e" }}>
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          <span style={{ fontSize: 10, color: "#ccc", fontWeight: 500 }}>
            {fileName ?? "untitled"}
          </span>
          <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: "#aaa", background: "#3e3e3e" }}>
            {langTag}
          </span>
          {readOnly && (
            <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: "#d4a017", background: "rgba(212,160,23,0.15)" }}>
              只读
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy}
            className="rounded px-2 py-0.5 transition-all hover:bg-[#3e3e3e]"
            style={{ fontSize: 9, color: copied ? "#4ec9b0" : "#888" }}>
            {copied ? "已复制" : "复制"}
          </button>
          {(language === "html" || previewEnabled) && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="rounded px-2 py-0.5 transition-all hover:bg-[#3e3e3e]"
              style={{ fontSize: 9, color: showPreview ? "#4ec9b0" : "#888" }}>
              {showPreview ? "隐藏预览" : "显示预览"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className={`flex min-w-0 ${showPreview && (language === "html" || previewEnabled) ? "border-r" : ""}`} style={{ flex: showPreview && (language === "html" || previewEnabled) ? 1 : undefined, borderColor: "#3e3e3e" }}>
          <MonacoEditor
            height={height ?? "100%"}
            language={monacoLang}
            value={content}
            onChange={handleChange}
            theme="vs-dark"
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              padding: { top: 10 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              renderLineHighlight: "line",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              bracketPairColorization: { enabled: true },
              automaticLayout: true,
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              renderWhitespace: "none",
              contextmenu: true,
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              parameterHints: { enabled: true },
              folding: true,
              foldingStrategy: "indentation",
              showFoldingControls: "mouseover",
              lineNumbers: "on",
              glyphMargin: false,
            }}
          />
        </div>

        {showPreview && language === "html" && (
          <div className="flex-1 min-w-0" style={{ background: "#fff" }}>
            <iframe
              srcDoc={htmlContent}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="preview"
            />
          </div>
        )}

        {showPreview && previewEnabled && language !== "html" && (
          <div className="flex-1 min-w-0 flex items-center justify-center" style={{ background: "#252525" }}>
            <div className="text-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" style={{ margin: "0 auto 8px" }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <p style={{ fontSize: 11, color: "#666" }}>仅 HTML 支持实时预览</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
