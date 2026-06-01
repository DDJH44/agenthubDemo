"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

interface FileNode {
  id: string; name: string; isFolder: boolean; size: number;
  mimeType: string; parentId: string | null; createdAt: string;
}

function FileTreeNode({ node, allFiles, depth, expanded, selectedId, onToggle, onSelect, onDelete, onRename }:
  { node: FileNode; allFiles: FileNode[]; depth: number; expanded: Set<string>; selectedId: string | null;
    onToggle: (id: string) => void; onSelect: (id: string) => void;
    onDelete: (id: string) => void; onRename: (id: string, name: string) => void;
  }) {
  const children = allFiles.filter(f => f.parentId === node.id);
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-[var(--bg-hover)] ${isSelected ? "bg-[var(--accent-subtle)]" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => { if (node.isFolder) onToggle(node.id); onSelect(node.id); }}
      >
        {node.isFolder ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isExpanded ? "var(--accent)" : "var(--fg-tertiary)"} strokeWidth="1.5" strokeLinecap="round"
            style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"/>
          </svg>
        )}
        {node.isFolder ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isExpanded ? "var(--accent)" : "var(--fg-tertiary)"} stroke="none" style={{ flexShrink: 0 }}>
            <path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"/>
          </svg>
        )}
        <span className="truncate" style={{ fontSize: "var(--text-xs)", color: isSelected ? "var(--accent)" : "var(--fg-primary)", fontWeight: isSelected ? 500 : 400 }}>
          {node.name}
        </span>
        {!node.isFolder && <span style={{ fontSize: 9, color: "var(--fg-disabled)", flexShrink: 0 }}>{formatSize(node.size)}</span>}
      </div>
      {node.isFolder && isExpanded && children.map(c =>
        <FileTreeNode key={c.id} node={c} allFiles={allFiles} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} onDelete={onDelete} onRename={onRename} />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function FilesView() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(() => {
    api.get<{ files: FileNode[] }>("/api/workspace-files/tree").then(r => {
      setFiles(r.files); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleCreateFolder = async () => {
    const name = prompt("文件夹名称：");
    if (!name?.trim()) return;
    const parentId = selectedId ? files.find(f => f.id === selectedId)?.isFolder ? selectedId : null : null;
    await api.post("/api/workspace-files", { name: name.trim(), parentId, isFolder: true });
    fetchFiles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此文件/文件夹？文件夹内所有内容将被删除。")) return;
    await api.delete(`/api/workspace-files/${id}`);
    if (selectedId === id) setSelectedId(null);
    fetchFiles();
  };

  const handleRename = async (id: string, name: string) => {
    await api.patch(`/api/workspace-files/${id}`, { name });
    fetchFiles();
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { fetchFiles(); return; }
    const r = await api.get<{ files: FileNode[] }>(`/api/workspace-files/search?q=${encodeURIComponent(searchQuery)}`);
    setFiles(r.files);
  }, [searchQuery, fetchFiles]);

  const selected = selectedId ? files.find(f => f.id === selectedId) : null;
  const rootFiles = files.filter(f => f.parentId === null || (searchQuery && !files.some(x => x.id === f.parentId)));
  const displayFiles = searchQuery ? files : rootFiles;

  return (
    <div className="flex h-full" style={{ background: "var(--surface-white)" }}>
      {/* File Tree Panel */}
      <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 260, borderRight: "1px solid var(--border)" }}>
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="flex items-center gap-1 mb-2">
            <div className="relative flex-1">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="搜索文件..." className="w-full outline-none rounded pl-7 pr-2"
                style={{ height: 28, fontSize: "var(--text-2xs)", background: "var(--surface-low)", border: "1px solid transparent" }} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleCreateFolder} className="rounded font-medium transition-all"
              style={{ height: 26, fontSize: 10, padding: "0 8px", background: "var(--accent-subtle)", color: "var(--accent)" }}>
              + 文件夹
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
          {loading ? (
            <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-disabled)", textAlign: "center", padding: 20 }}>加载中...</p>
          ) : displayFiles.length === 0 ? (
            <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-disabled)", textAlign: "center", padding: 20 }}>空文件夹</p>
          ) : (
            displayFiles.map(f => (
              <FileTreeNode key={f.id} node={f} allFiles={files} depth={0} expanded={expanded} selectedId={selectedId}
                onToggle={toggleExpand} onSelect={setSelectedId} onDelete={handleDelete} onRename={handleRename} />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <div className="flex-1 p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                {selected.isFolder ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)" stroke="none"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6"/></svg>
                )}
              </div>
              <div>
                <h3 style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{selected.name}</h3>
                <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                  {selected.isFolder ? "文件夹" : `${selected.mimeType} · ${formatSize(selected.size)}`}
                </p>
              </div>
            </div>
            <div className="space-y-2" style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)" }}>
              <div>创建时间: {new Date(selected.createdAt).toLocaleString("zh-CN")}</div>
              {!selected.isFolder && <div>大小: {formatSize(selected.size)}</div>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { const name = prompt("重命名：", selected.name); if (name?.trim()) handleRename(selected.id, name.trim()); }}
                className="rounded font-medium" style={{ height: 28, fontSize: 10, padding: "0 10px", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                重命名
              </button>
              <button onClick={() => handleDelete(selected.id)}
                className="rounded font-medium" style={{ height: 28, fontSize: 10, padding: "0 10px", color: "var(--danger)", background: "var(--danger-subtle)", border: "1px solid transparent" }}>
                删除
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)" }}>选择一个文件查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
