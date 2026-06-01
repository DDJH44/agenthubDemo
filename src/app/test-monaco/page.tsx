"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false, loading: () => <div style={{ padding: 20, color: "#888" }}>Loading Monaco Editor...</div> }
);

const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false, loading: () => <div style={{ padding: 20, color: "#888" }}>Loading Diff Editor...</div> }
);

const sampleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Hello World</title>
  <style>
    body {
      background: #1a56db;
      color: white;
      font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    h1 {
      font-size: 3rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`;

const sampleJs = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Print first 10 Fibonacci numbers
for (let i = 0; i < 10; i++) {
  console.log(\`F(\${i}) = \${fibonacci(i)}\`);
}`;

const originalHtml = `<!DOCTYPE html>
<html>
<head><title>Original</title></head>
<body>
  <h1>Old Title</h1>
  <p>This is the original version.</p>
</body>
</html>`;

const modifiedHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>Hello World</title></head>
<body style="background: #1a56db; color: white;">
  <h1>Hello World</h1>
  <p>This is the modified version with blue background.</p>
</body>
</html>`;

export default function TestMonacoPage() {
  const [tab, setTab] = useState<"editor" | "diff">("editor");
  const [lang, setLang] = useState("html");
  const [content, setContent] = useState(sampleHtml);
  const [readOnly, setReadOnly] = useState(false);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "#d4d4d4" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #333", display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginRight: 20 }}>Monaco Editor Test</h1>
        <button onClick={() => setTab("editor")} style={{ padding: "6px 16px", background: tab === "editor" ? "#0078d4" : "#333", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Code Editor</button>
        <button onClick={() => setTab("diff")} style={{ padding: "6px 16px", background: tab === "diff" ? "#0078d4" : "#333", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Diff Editor</button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        {tab === "editor" && (
          <>
            <select value={lang} onChange={(e) => { setLang(e.target.value); setContent(e.target.value === "html" ? sampleHtml : sampleJs); }} style={{ padding: "4px 8px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4 }}>
              <option value="html">HTML</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              Read Only
            </label>
          </>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "editor" ? (
          <MonacoEditor
            height="100%"
            language={lang}
            theme="vs-dark"
            value={content}
            onChange={(v) => setContent(v ?? "")}
            options={{
              readOnly,
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              bracketPairColorization: { enabled: true },
            }}
          />
        ) : (
          <MonacoDiffEditor
            height="100%"
            language="html"
            theme="vs-dark"
            original={originalHtml}
            modified={modifiedHtml}
            options={{
              readOnly: true,
              renderSideBySide: true,
              diffAlgorithm: "advanced",
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
