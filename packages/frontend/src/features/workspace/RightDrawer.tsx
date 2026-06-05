"use client";

import { useEffect, useState } from "react";
import type { WorkspaceTab } from "./BottomTabBar";
import type { Artifact, PlanNode, StepResult, Message } from "@agenthub/shared";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useT } from "@/hooks/useT";
import { CodeEditorView } from "./CodeEditorView";
import { DiffEditorView } from "./DiffEditorView";
import { MemberPanel } from "@/features/chat/MemberPanel";
import { FilePanel } from "@/features/chat/FilePanel";
import { MemoryTabView } from "@/features/chat/MemoryTabView";

interface StepProgress { index: number; total: number; step: string; status: "pending"|"running"|"done"; result?: string; }

interface Props {
  open: boolean; activeTab: WorkspaceTab | null; onClose: () => void;
  steps: StepProgress[]; plan: PlanNode[]; artifacts: Artifact[];
  dagNodes: Array<{ id: string; task: string; dependsOn: string[]; status: string }>; taskSummary: string;
  stepResults: StepResult[]; messages: Message[];
  conversationId?: string;
  onSendMessage?: (type: string, payload: Record<string, unknown>) => void;
}

export function RightDrawer({ open, activeTab, onClose, steps, artifacts, dagNodes, stepResults, messages, conversationId, onSendMessage }: Props) {
  const t = useT();
  const TITLES: Record<WorkspaceTab, string> = { task: t("tab.task"), files: t("tab.files"), diff: t("tab.diff"), preview: t("tab.preview"), deploy: t("tab.deploy"), members: "成员", "file-manager": "文件管理", memory: "记忆" };
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, onClose]);
  if (!open || !activeTab) return null;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-30" style={{ background: "rgba(0,0,0,.2)" }} />
      <div className="fixed top-0 right-0 h-full z-40 flex flex-col animate-slide-in-right" style={{ width: 400, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
        <div className="flex items-center justify-between px-5 shrink-0" style={{ height: 52, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{TITLES[activeTab]}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--fg-tertiary)" }}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "task" && <TaskView steps={steps} dagNodes={dagNodes} />}
          {activeTab === "files" && <FilesView artifacts={artifacts} />}
          {activeTab === "diff" && <EditorTabView stepResults={stepResults} messages={messages} />}
          {activeTab === "preview" && <PreviewView artifacts={artifacts} />}
          {activeTab === "deploy" && <DeployView />}
          {activeTab === "members" && conversationId && <MemberPanel conversationId={conversationId} onSendMessage={onSendMessage} />}
          {activeTab === "file-manager" && conversationId && <FilePanel conversationId={conversationId} onSendMessage={onSendMessage} />}
          {activeTab === "memory" && conversationId && <MemoryTabView conversationId={conversationId} />}
        </div>
      </div>
    </>
  );
}

/* ── TaskView ── */

function TaskView({ steps, dagNodes }: { steps: StepProgress[]; dagNodes: Array<{ id: string; task: string; dependsOn: string[]; status: string }> }) {
  const items = dagNodes.length > 0 ? dagNodes.map((n) => ({ id: n.id, task: n.task, status: n.status }))
    : steps.map((s) => ({ id: `step-${s.index}`, task: s.step, status: s.status }));
  if (items.length === 0) return <EmptyView icon="⊞" title="暂无任务" subtitle="在聊天中 @planner 拆解任务后查看" />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between" style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>
        <span>{items.filter((i) => i.status === "done").length}/{items.length} done</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl p-3 border" style={{ borderColor: "var(--border)", background: item.status === "done" ? "var(--success-subtle)" : item.status === "running" ? "var(--warning-subtle)" : "var(--bg-surface)" }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: item.status === "done" ? "var(--success)" : item.status === "running" ? "var(--accent)" : "var(--fg-disabled)" }} />
            <span style={{ fontSize: "var(--text-sm)" }}>{item.task}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── FilesView ── */

function FilesView({ artifacts }: { artifacts: Artifact[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

  const files = artifacts.filter((a) => ["code", "markdown", "json", "html"].includes(a.type));
  if (files.length === 0) return <EmptyView icon="📄" title={t("drawer.noFile")} subtitle={t("drawer.noFileHint")} />;

  const TYPE_BADGE: Record<string, string> = { markdown: "MD", code: "CODE", json: "JSON", html: "HTML" };

  return (
    <div className="flex flex-col gap-2">
      {files.map((a) => {
        const isOpen = expanded.has(a.id);
        const content = a.content || "";
        const truncated = !isOpen && content.length > 200;
        return (
          <div key={a.id} className="rounded-xl border animate-fade-in-up" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: isOpen ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.filename || `${a.type}_${a.id.slice(0, 8)}`}
              </span>
              <span className="px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 9, background: "var(--accent-subtle)", color: "var(--accent)", letterSpacing: 0 }}>
                {TYPE_BADGE[a.type] ?? a.type.toUpperCase()}
              </span>
              <button onClick={() => toggle(a.id)} className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ color: "var(--fg-tertiary)", fontSize: 10 }}>
                {isOpen ? "▲" : "▼"}
              </button>
            </div>
            <pre className="whitespace-pre px-3 py-2.5 m-0 overflow-auto custom-scrollbar" style={{
              fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", lineHeight: 1.55,
              color: isOpen ? "var(--fg-secondary)" : "var(--fg-tertiary)",
              maxHeight: isOpen ? 300 : 60, overflowY: isOpen ? "auto" : "hidden",
              minWidth: "100%",
              tabSize: 2,
            }}>
              {truncated ? content.slice(0, 200) + "…" : content}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

/* ── EditorTabView (code editor + diff) ── */

function EditorTabView({ stepResults, messages }: { stepResults: StepResult[]; messages: Message[] }) {
  const t = useT();
  const [activeFile, setActiveFile] = useState<string>("");
  const [mode, setMode] = useState<"code" | "diff">("code");
  const diffCards = messages.filter((m) => m.type === "diff_card");
  const codeArtifacts = stepResults.filter((s) => s.result && (s.result.includes("<html") || s.result.includes("function ") || s.result.includes("import ")));

  const files = [
    ...diffCards.map((d) => ({ id: d.id, name: (d.payload as { fileName?: string })?.fileName ?? `diff-${d.id.slice(0, 6)}`, content: d.content, language: (d.payload as { language?: string })?.language ?? "diff", original: (d.payload as { original?: string })?.original ?? "" })),
    ...codeArtifacts.map((s, i) => ({ id: s.id, name: s.task ?? `code-${i}`, content: s.result ?? "", language: s.result?.includes("<html") ? "html" : "ts", original: "" })),
  ];

  if (files.length === 0) return <EmptyView icon="Δ" title={t("drawer.noDiff")} subtitle={t("drawer.noDiffHint")} />;

  const active = files.find((f) => f.id === activeFile) ?? files[0];
  const hasOriginal = active.original.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="flex items-center gap-1 shrink-0 px-1 pb-2" style={{ flexWrap: "wrap" }}>
        {files.map((f) => (
          <button key={f.id} onClick={() => { setActiveFile(f.id); }}
            className="rounded px-2 py-1 transition-all"
            style={{
              fontSize: 10, fontWeight: active.id === f.id ? 600 : 400,
              color: active.id === f.id ? "#fff" : "#888",
              background: active.id === f.id ? "var(--accent)" : "#2d2d2d",
            }}>
            {f.name.slice(0, 20)}
          </button>
        ))}
        <div className="flex-1" />
        {hasOriginal && (
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid #3e3e3e" }}>
            <button onClick={() => setMode("code")}
              className="px-2 py-0.5"
              style={{ fontSize: 9, color: mode === "code" ? "#4ec9b0" : "#888", background: mode === "code" ? "#3e3e3e" : "transparent" }}>
              代码
            </button>
            <button onClick={() => setMode("diff")}
              className="px-2 py-0.5"
              style={{ fontSize: 9, color: mode === "diff" ? "#4ec9b0" : "#888", background: mode === "diff" ? "#3e3e3e" : "transparent" }}>
              Diff
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 rounded-lg overflow-hidden" style={{ minHeight: 300, border: "1px solid #3e3e3e" }}>
        {mode === "diff" && hasOriginal ? (
          <DiffEditorView original={active.original} modified={active.content} language={active.language} fileName={active.name} />
        ) : (
          <CodeEditorView fileName={active.name} content={active.content} language={active.language} previewEnabled={active.language === "html"} />
        )}
      </div>
    </div>
  );
}

/* ── PreviewView ── */

function PreviewView({ artifacts }: { artifacts: Artifact[] }) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);

  const previews = artifacts.filter((a) => a.type === "preview_url" || a.type === "html");
  if (previews.length === 0) return <EmptyView icon="⊡" title={t("drawer.noPreview")} />;

  if (activeId) {
    const active = previews.find((a) => a.id === activeId);
    if (!active) { setActiveId(null); return null; }
    return (
      <div className="flex flex-col gap-2 h-full">
        <button onClick={() => setActiveId(null)} className="flex items-center gap-1 px-2 py-1 text-xs rounded self-start" style={{ color: "var(--fg-tertiary)" }}>
          ← {active.filename || t("drawer.noPreview")}
        </button>
        <div className="flex-1 rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", minHeight: 300 }}>
          {active.type === "preview_url"
            ? <iframe src={active.content} className="w-full h-full border-0" style={{ minHeight: 400 }} sandbox="allow-scripts allow-same-origin" />
            : <iframe srcDoc={active.content} className="w-full h-full border-0" style={{ minHeight: 400 }} sandbox="allow-scripts" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {previews.map((a) => (
        <button key={a.id} onClick={() => setActiveId(a.id)}
          className="rounded-xl border border-[var(--border)] hover:border-[var(--accent-border)] px-3 py-3 text-left transition-all animate-fade-in-up flex items-center gap-3 bg-[var(--bg-surface)] hover:bg-[var(--accent-subtle)]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>
              {a.filename || (a.type === "preview_url" ? a.content : t("drawer.htmlPreview"))}
            </div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 1 }}>
              {a.type === "preview_url" ? t("drawer.webPreview") : t("drawer.htmlPreview")}
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--fg-disabled)" }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ── DeployView ── */

function DeployView() {
  const t = useT();
  const deployStatus = useWorkspaceStore((s) => s.deployStatus);
  const deployUrl = useWorkspaceStore((s) => s.deployUrl);

  if (!deployStatus) return <EmptyView icon="⇧" title={t("drawer.noDeploy")} subtitle={t("drawer.noDeployHint")} />;

  const isDone = deployStatus === "done" || deployStatus === "completed";
  const isFailed = deployStatus === "failed";
  const isDeploying = !isDone && !isFailed;

  const cfg = isDone
    ? { label: t("drawer.deployed"), color: "var(--success)", bg: "var(--success-subtle)", border: "rgba(0,108,73,.2)", dot: "var(--success)" }
    : isFailed
    ? { label: t("drawer.deployFailed"), color: "var(--danger)", bg: "var(--danger-subtle)", border: "rgba(186,26,26,.2)", dot: "var(--danger)" }
    : { label: t("drawer.deploying"), color: "var(--warning)", bg: "var(--warning-subtle)", border: "rgba(130,81,0,.2)", dot: "var(--warning)" };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border animate-fade-in-up px-4 py-4" style={{ borderColor: cfg.border, background: cfg.bg }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded-full" style={{
            width: 8, height: 8, background: cfg.dot,
            ...(isDeploying ? { animation: "pulse-dot 1.4s ease-in-out infinite" } as React.CSSProperties : {}),
          }} />
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
        </div>
        {isDeploying && (
          <div className="rounded-full mb-3 overflow-hidden" style={{ height: 3, background: "var(--bg-elevated)" }}>
            <div style={{ height: "100%", width: "60%", background: "var(--warning)", borderRadius: "0 2px 2px 0", animation: "pulse-dot 2s ease-in-out infinite" }} />
          </div>
        )}
        {deployUrl && (
          <a href={deployUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all bg-[var(--bg-surface)] border border-solid border-[var(--border)] hover:border-[var(--accent-border)]"
            style={{ textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>
            </svg>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--accent)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {deployUrl}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--fg-disabled)", flexShrink: 0 }}>
              <path d="M7 17L17 7M7 7h10v10"/>
            </svg>
          </a>
        )}
        {!deployUrl && isFailed && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>{t("drawer.deployFailedHint")}</p>
        )}
      </div>
    </div>
  );
}

/* ── EmptyView ── */

function EmptyView({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl mb-4 flex items-center justify-center" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
        <span style={{ fontSize: 20, color: "var(--accent)" }}>{icon}</span>
      </div>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)", fontWeight: 500 }}>{title}</p>
      {subtitle && <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", marginTop: 4 }}>{subtitle}</p>}
    </div>
  );
}
