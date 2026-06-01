"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTaskTreeStore, type TaskNode } from "@/stores/task-tree-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), { ssr: false });

const LANG_MAP: Record<string, string> = {
  html: "html", css: "css", js: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json",
  md: "markdown", py: "python", go: "go", rust: "rust", diff: "diff",
  yaml: "yaml", yml: "yaml", xml: "xml", sql: "sql", sh: "shell",
};

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  pending: { icon: "○", color: "var(--fg-disabled)", label: "等待中" },
  running: { icon: "◉", color: "var(--accent)", label: "执行中" },
  done: { icon: "●", color: "#006c49", label: "已完成" },
  failed: { icon: "✕", color: "#ba1a1a", label: "失败" },
};

const TYPE_ICON: Record<string, string> = {
  project: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6",
  step: "M13 10V3L4 14h7v7l9-11h-7z",
};

function TreeNode({ node, depth = 0 }: { node: TaskNode; depth?: number }) {
  const { expandedNodes, toggleExpand, selectedNodeId, selectNode } = useTaskTreeStore();
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children.length > 0;
  const statusCfg = STATUS_CONFIG[node.status] ?? STATUS_CONFIG.pending;
  const iconPath = TYPE_ICON[node.type] ?? TYPE_ICON.file;

  const handleClick = useCallback(() => {
    if (hasChildren) toggleExpand(node.id);
    selectNode(node.id);
  }, [hasChildren, node.id, toggleExpand, selectNode]);

  const indent = depth * 16;

  return (
    <>
      <div
        onClick={handleClick}
        className="flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded-md transition-colors"
        style={{
          paddingLeft: 8 + indent,
          background: isSelected ? "var(--accent-subtle)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-low)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {hasChildren ? (
          <svg
            width="10" height="10" viewBox="0 0 16 16" fill="var(--fg-tertiary)"
            style={{ transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
          >
            <path d="M6 4l4 4-4 4z" />
          </svg>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}

        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={statusCfg.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d={iconPath} />
        </svg>

        <span
          className="truncate"
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: node.type === "project" ? 700 : node.type === "task" ? 600 : 400,
            color: node.type === "project" ? "var(--fg-primary)" : node.type === "task" ? "var(--fg-secondary)" : "var(--fg-tertiary)",
            flex: 1,
          }}
        >
          {node.title}
        </span>

        <span style={{ fontSize: 9, color: statusCfg.color, flexShrink: 0 }}>{statusCfg.icon}</span>

        {node.agentRole && (
          <span
            className="px-1 rounded"
            style={{ fontSize: 8, background: "var(--accent-subtle)", color: "var(--accent)", flexShrink: 0 }}
          >
            {node.agentRole}
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function NodeDetail({ node }: { node: TaskNode }) {
  const [showFullCode, setShowFullCode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [currentContent, setCurrentContent] = useState("");
  const workspaceArtifacts = useWorkspaceStore((s) => s.artifacts);
  const stepResults = useWorkspaceStore((s) => s.stepResults);
  const updateNodeContent = useTaskTreeStore((s) => s.updateNodeContent);

  const fullContent = useMemo(() => {
    if (node.artifactId) {
      const artifact = workspaceArtifacts.find((a) => a.id === node.artifactId);
      if (artifact?.content) return artifact.content;
    }
    if (node.content) return node.content;
    const parentId = node.id.replace(/-file-\d+$/, "");
    const parentResult = stepResults.find((sr) => sr.id === parentId);
    if (parentResult?.result) {
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      let match: RegExpExecArray | null;
      let idx = 0;
      while ((match = codeBlockRegex.exec(parentResult.result)) !== null) {
        const code = match[2];
        if (code.trim().length < 10) continue;
        if (node.id.endsWith(`-file-${idx}`)) return code;
        idx++;
      }
    }
    return "";
  }, [node.artifactId, node.content, node.id, workspaceArtifacts, stepResults]);

  const handleEdit = useCallback(() => {
    setCurrentContent(fullContent);
    setEditing(true);
  }, [fullContent]);

  const handleSave = useCallback(() => {
    updateNodeContent(node.id, currentContent);
    setEditing(false);
  }, [node.id, currentContent, updateNodeContent]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setCurrentContent("");
  }, []);

  if (!node) return null;

  if (node.type === "file" && fullContent) {
    const lang = LANG_MAP[node.lang ?? ""] ?? "plaintext";
    return (
      <div className="flex flex-col" style={{ height: "100%" }}>
        <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ background: "var(--surface-low)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--fg-secondary)" }}>{node.filename || node.title}</span>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 9, color: "var(--fg-disabled)" }}>{lang}</span>
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  style={{ fontSize: 9, color: "#006c49", cursor: "pointer", background: "none", border: "none", fontWeight: 600 }}
                >
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  style={{ fontSize: 9, color: "var(--fg-tertiary)", cursor: "pointer", background: "none", border: "none" }}
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleEdit}
                  style={{ fontSize: 9, color: "var(--accent)", cursor: "pointer", background: "none", border: "none" }}
                >
                  编辑
                </button>
                <button
                  onClick={() => setShowFullCode(!showFullCode)}
                  style={{ fontSize: 9, color: "var(--fg-tertiary)", cursor: "pointer", background: "none", border: "none" }}
                >
                  {showFullCode ? "收起" : "展开全部"}
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: showFullCode ? 500 : 280 }}>
          <MonacoEditor
            height={showFullCode ? 500 : 280}
            language={lang}
            theme="vs-dark"
            value={editing ? currentContent : fullContent}
            onChange={(val) => setCurrentContent(val ?? "")}
            options={{
              readOnly: !editing,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    );
  }

  if (node.type === "task") {
    const statusCfg = STATUS_CONFIG[node.status] ?? STATUS_CONFIG.pending;
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 10, color: statusCfg.color, fontWeight: 700 }}>{statusCfg.icon}</span>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-primary)" }}>{node.title}</span>
          <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 9, background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {statusCfg.label}
          </span>
        </div>
        {node.agentRole && (
          <p style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>负责角色：{node.agentRole}</p>
        )}
        {node.children.length > 0 && (
          <div className="mt-2">
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--fg-secondary)", marginBottom: 4 }}>产出文件：</p>
            {node.children.map((child) => (
              <div key={child.id} className="flex items-center gap-1.5 py-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={TYPE_ICON.file} />
                </svg>
                <span style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{child.filename || child.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.type === "project") {
    const totalTasks = node.children.length;
    const doneTasks = node.children.filter(c => c.status === "done").length;
    const totalFiles = node.children.reduce((sum, c) => sum + c.children.filter(cc => cc.type === "file").length, 0);
    return (
      <div className="p-3">
        <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-primary)", marginBottom: 8 }}>{node.title}</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="rounded-lg p-2 text-center" style={{ background: "var(--surface-low)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{totalTasks}</p>
            <p style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>任务</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: "var(--surface-low)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#006c49" }}>{doneTasks}</p>
            <p style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>已完成</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: "var(--surface-low)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-secondary)" }}>{totalFiles}</p>
            <p style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>文件</p>
          </div>
        </div>
        {totalTasks > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>进度</span>
              <span style={{ fontSize: 9, color: "var(--accent)" }}>{Math.round((doneTasks / totalTasks) * 100)}%</span>
            </div>
            <div className="rounded-full h-1.5" style={{ background: "var(--surface-low)" }}>
              <div className="rounded-full h-1.5 transition-all" style={{ background: "var(--accent)", width: `${(doneTasks / totalTasks) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export function TaskTreeView() {
  const { activeConvId, trees, selectedNodeId } = useTaskTreeStore();
  const [viewMode, setViewMode] = useState<"tree" | "detail">("tree");

  const tree = activeConvId ? trees[activeConvId] : null;
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !tree) return null;
    function find(node: TaskNode): TaskNode | null {
      if (node.id === selectedNodeId) return node;
      for (const child of node.children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    }
    return find(tree);
  }, [selectedNodeId, tree]);

  if (!tree) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", marginTop: 8 }}>开始对话以创建项目结构</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode("tree")}
            style={{
              fontSize: 10, fontWeight: viewMode === "tree" ? 600 : 400,
              color: viewMode === "tree" ? "var(--accent)" : "var(--fg-tertiary)",
              background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
            }}
          >
            树形
          </button>
          <button
            onClick={() => setViewMode("detail")}
            style={{
              fontSize: 10, fontWeight: viewMode === "detail" ? 600 : 400,
              color: viewMode === "detail" ? "var(--accent)" : "var(--fg-tertiary)",
              background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
            }}
          >
            详情
          </button>
        </div>
        <span style={{ fontSize: 9, color: "var(--fg-disabled)" }}>
          {tree.children.length} 任务 · {tree.children.reduce((s, c) => s + c.children.filter(cc => cc.type === "file").length, 0)} 文件
        </span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {viewMode === "tree" ? (
          <div className="py-1">
            <TreeNode node={tree} />
          </div>
        ) : selectedNode ? (
          <NodeDetail node={selectedNode} />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)" }}>选择节点查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
