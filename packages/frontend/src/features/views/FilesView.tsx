"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "@/lib/api-client";

interface FileNode {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
  mimeType: string;
  parentId: string | null;
  path?: string | null;
  createdAt: string;
  updatedAt?: string;
  content?: string | null;
  canPreview?: boolean;
}

interface KnowledgeBase {
  id: string;
  name: string;
  _count?: { documents: number };
}

const TEXT_FILE_RE = /\.(txt|md|markdown|json|csv|html|css|js|jsx|ts|tsx|xml|yml|yaml|log)$/i;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function getFileType(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext && ext !== name.toUpperCase() ? ext.slice(0, 4) : "TXT";
}

function getMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    jsx: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    xml: "application/xml",
    yml: "text/yaml",
    yaml: "text/yaml",
    log: "text/plain",
  };
  return map[ext ?? ""] ?? "text/plain";
}

async function decodeTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    try {
      return new TextDecoder("gb18030").decode(buffer).replace(/^\uFEFF/, "");
    } catch {
      return new TextDecoder().decode(buffer).replace(/^\uFEFF/, "");
    }
  }
}

function FileTreeNode({
  node,
  allFiles,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: FileNode;
  allFiles: FileNode[];
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const children = allFiles.filter((file) => file.parentId === node.id);
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] ${isSelected ? "bg-[var(--accent-subtle)]" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          if (node.isFolder) onToggle(node.id);
          onSelect(node.id);
        }}
      >
        {node.isFolder ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isExpanded ? "var(--accent)" : "var(--fg-tertiary)"} strokeWidth="1.5" strokeLinecap="round" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        ) : (
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ fontSize: 8, fontWeight: 700, color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
            {getFileType(node.name)}
          </span>
        )}
        {node.isFolder ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isExpanded ? "var(--accent)" : "var(--fg-tertiary)"} stroke="none" style={{ flexShrink: 0 }}>
            <path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" />
          </svg>
        )}
        <span className="truncate" style={{ fontSize: "var(--text-xs)", color: isSelected ? "var(--accent)" : "var(--fg-primary)", fontWeight: isSelected ? 600 : 400 }}>
          {node.name}
        </span>
        {!node.isFolder && <span style={{ fontSize: 9, color: "var(--fg-disabled)", flexShrink: 0 }}>{formatSize(node.size)}</span>}
      </div>
      {node.isFolder && isExpanded && children.map((child) => (
        <FileTreeNode key={child.id} node={child} allFiles={allFiles} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function FilesView() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [targetBaseId, setTargetBaseId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<FileNode | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await api.get<{ files: FileNode[] }>("/api/workspace-files/tree");
      setFiles(res.files);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKnowledgeBases = useCallback(async () => {
    const res = await api.get<{ bases: KnowledgeBase[] }>("/api/knowledge-bases");
    setKnowledgeBases(res.bases);
    setTargetBaseId((current) => current && res.bases.some((base) => base.id === current) ? current : res.bases[0]?.id ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const [fileRes, kbRes] = await Promise.all([
          api.get<{ files: FileNode[] }>("/api/workspace-files/tree"),
          api.get<{ bases: KnowledgeBase[] }>("/api/knowledge-bases"),
        ]);
        if (cancelled) return;
        setFiles(fileRes.files);
        setKnowledgeBases(kbRes.bases);
        setTargetBaseId(kbRes.bases[0]?.id ?? "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!selectedId) {
        if (!cancelled) {
          setSelectedDetail(null);
          setDraftContent("");
        }
        return;
      }
      const selectedFile = files.find((file) => file.id === selectedId);
      if (!selectedFile) return;
      if (selectedFile.isFolder) {
        if (!cancelled) {
          setSelectedDetail(selectedFile);
          setDraftContent("");
        }
        return;
      }
      try {
        const res = await api.get<{ file: FileNode }>(`/api/workspace-files/${selectedId}`);
        if (!cancelled) {
          setSelectedDetail(res.file);
          setDraftContent(res.file.content ?? "");
        }
      } catch {
        if (!cancelled) {
          setSelectedDetail(selectedFile);
          setDraftContent("");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [files, selectedId]);

  const selected = selectedId ? files.find((file) => file.id === selectedId) ?? null : null;
  const targetParentId = selected?.isFolder ? selected.id : selected?.parentId ?? null;
  const rootFiles = useMemo(() => files.filter((file) => file.parentId === null || (searchQuery && !files.some((item) => item.id === file.parentId))), [files, searchQuery]);
  const displayFiles = searchQuery ? files : rootFiles;
  const folderChildren = selectedDetail?.isFolder ? files.filter((file) => file.parentId === selectedDetail.id) : [];
  const hasUnsavedChanges = !!selectedDetail && !selectedDetail.isFolder && draftContent !== (selectedDetail.content ?? "");

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("文件夹名称：");
    if (!name?.trim()) return;
    await api.post("/api/workspace-files", { name: name.trim(), parentId: targetParentId, isFolder: true });
    if (targetParentId) setExpanded((prev) => new Set(prev).add(targetParentId));
    fetchFiles().catch(() => {});
    setNotice("文件夹已创建。");
  };

  const handleCreateFile = async (name: string, content: string) => {
    const res = await api.post<{ file: FileNode }>("/api/workspace-files", {
      name,
      content,
      parentId: targetParentId,
      isFolder: false,
      mimeType: getMimeType(name),
    });
    if (targetParentId) setExpanded((prev) => new Set(prev).add(targetParentId));
    setSelectedId(res.file.id);
    setShowCreateFile(false);
    setNotice("文件已创建。");
    fetchFiles().catch(() => {});
  };

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("text/") && !TEXT_FILE_RE.test(file.name)) {
      setNotice("文件中心当前支持文本、Markdown、JSON、CSV、HTML、CSS、JS、TS 等可编辑资料。");
      return;
    }
    setUploading(true);
    try {
      const content = await decodeTextFile(file);
      const res = await api.post<{ file: FileNode }>("/api/workspace-files", {
        name: file.name,
        content,
        parentId: targetParentId,
        isFolder: false,
        mimeType: file.type || getMimeType(file.name),
      });
      if (targetParentId) setExpanded((prev) => new Set(prev).add(targetParentId));
      setSelectedId(res.file.id);
      setNotice(`${file.name} 已上传到文件中心。`);
      fetchFiles().catch(() => {});
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "上传失败。");
    } finally {
      setUploading(false);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      fetchFiles().catch(() => {});
      return;
    }
    const res = await api.get<{ files: FileNode[] }>(`/api/workspace-files/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setFiles(res.files);
  }, [searchQuery, fetchFiles]);

  const handleRename = async () => {
    if (!selectedDetail) return;
    const name = window.prompt("重命名：", selectedDetail.name);
    if (!name?.trim()) return;
    const res = await api.patch<{ file: FileNode }>(`/api/workspace-files/${selectedDetail.id}`, { name: name.trim() });
    setSelectedDetail((prev) => prev ? { ...prev, name: res.file.name } : prev);
    fetchFiles().catch(() => {});
    setNotice("名称已更新。");
  };

  const handleDelete = async () => {
    if (!selectedDetail) return;
    if (!window.confirm("确定删除此文件/文件夹？文件夹内所有内容也会被删除。")) return;
    await api.delete(`/api/workspace-files/${selectedDetail.id}`);
    setSelectedId(null);
    setSelectedDetail(null);
    fetchFiles().catch(() => {});
    setNotice("已删除。");
  };

  const handleSaveContent = async () => {
    if (!selectedDetail || selectedDetail.isFolder) return;
    setSaving(true);
    try {
      const res = await api.patch<{ file: FileNode }>(`/api/workspace-files/${selectedDetail.id}`, { content: draftContent });
      setSelectedDetail((prev) => prev ? { ...prev, ...res.file, content: draftContent } : prev);
      setFiles((prev) => prev.map((file) => file.id === res.file.id ? { ...file, ...res.file } : file));
      setNotice("文件内容已保存。");
    } finally {
      setSaving(false);
    }
  };

  const handleSendToKnowledge = async () => {
    if (!selectedDetail || selectedDetail.isFolder || !targetBaseId) return;
    try {
      await api.post(`/api/workspace-files/${selectedDetail.id}/knowledge`, { knowledgeBaseId: targetBaseId });
      const target = knowledgeBases.find((base) => base.id === targetBaseId);
      setNotice(`已发送到知识库${target ? `「${target.name}」` : ""}，后台正在解析。`);
      fetchKnowledgeBases().catch(() => {});
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "加入知识库失败。");
    }
  };

  return (
    <div className="flex h-full" style={{ background: "var(--surface-white)" }}>
      <input ref={uploadInputRef} type="file" accept=".txt,.md,.markdown,.json,.csv,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yml,.yaml,.log,text/*" className="hidden" onChange={handleUploadFile} />

      <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: 300, borderRight: "1px solid var(--border)" }}>
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="mb-2 flex items-center gap-1">
            <div className="relative flex-1">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                placeholder="搜索文件内容..."
                className="w-full rounded pl-7 pr-2 outline-none"
                style={{ height: 28, fontSize: "var(--text-2xs)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
              />
            </div>
            <button onClick={handleSearch} className="rounded font-medium" style={{ height: 28, fontSize: 10, padding: "0 8px", background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
              搜索
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setShowCreateFile(true)} className="rounded font-medium transition-all" style={{ height: 26, fontSize: 10, padding: "0 8px", background: "var(--accent)", color: "#fff" }}>
              + 文件
            </button>
            <button onClick={handleCreateFolder} className="rounded font-medium transition-all" style={{ height: 26, fontSize: 10, padding: "0 8px", background: "var(--accent-subtle)", color: "var(--accent)" }}>
              + 文件夹
            </button>
            <button onClick={() => uploadInputRef.current?.click()} disabled={uploading} className="rounded font-medium transition-all" style={{ height: 26, fontSize: 10, padding: "0 8px", background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
              {uploading ? "上传中" : "上传"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
          {loading ? (
            <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-disabled)", textAlign: "center", padding: 20 }}>加载中...</p>
          ) : displayFiles.length === 0 ? (
            <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-disabled)", textAlign: "center", padding: 20 }}>暂无文件</p>
          ) : (
            displayFiles.map((file) => (
              <FileTreeNode key={file.id} node={file} allFiles={files} depth={0} expanded={expanded} selectedId={selectedId} onToggle={toggleExpand} onSelect={setSelectedId} />
            ))
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {notice && (
          <div className="mx-5 mt-4 rounded-lg px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            {notice}
          </div>
        )}

        {selectedDetail ? (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  {selectedDetail.isFolder ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{getFileType(selectedDetail.name)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate" style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--fg-primary)" }}>{selectedDetail.name}</h3>
                  <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
                    {selectedDetail.isFolder ? `${folderChildren.length} 个子项` : `${selectedDetail.mimeType} · ${formatSize(selectedDetail.size)}`} · {new Date(selectedDetail.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!selectedDetail.isFolder && knowledgeBases.length > 0 && (
                  <select value={targetBaseId} onChange={(event) => setTargetBaseId(event.target.value)} className="rounded-lg outline-none" style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 8px", background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
                    {knowledgeBases.map((base) => (
                      <option key={base.id} value={base.id}>{base.name}</option>
                    ))}
                  </select>
                )}
                {!selectedDetail.isFolder && (
                  <button onClick={handleSendToKnowledge} disabled={!targetBaseId} className="rounded-lg font-medium" style={{ height: 30, fontSize: 10, padding: "0 10px", background: "var(--accent-subtle)", color: "var(--accent)" }}>
                    加入知识库
                  </button>
                )}
                <button onClick={handleRename} className="rounded-lg font-medium" style={{ height: 30, fontSize: 10, padding: "0 10px", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                  重命名
                </button>
                <button onClick={handleDelete} className="rounded-lg font-medium" style={{ height: 30, fontSize: 10, padding: "0 10px", color: "var(--danger)", background: "var(--danger-subtle)", border: "1px solid transparent" }}>
                  删除
                </button>
              </div>
            </div>

            {selectedDetail.isFolder ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {folderChildren.length === 0 ? (
                  <div className="rounded-lg p-4" style={{ border: "1px dashed var(--border)", color: "var(--fg-disabled)", fontSize: "var(--text-xs)" }}>
                    这个文件夹还是空的，可以在左侧创建文件或上传资料。
                  </div>
                ) : folderChildren.map((child) => (
                  <button key={child.id} onClick={() => setSelectedId(child.id)} className="rounded-lg p-3 text-left transition-colors hover:bg-[var(--bg-hover)]" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
                    <p className="truncate" style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{child.name}</p>
                    <p style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 4 }}>{child.isFolder ? "文件夹" : formatSize(child.size)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div>
                    <p style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>内容预览与编辑</p>
                    <p style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 2 }}>{selectedDetail.canPreview === false ? "当前文件不可预览" : "保存后可继续加入知识库或交给 Agent 引用。"}</p>
                  </div>
                  <button onClick={handleSaveContent} disabled={!hasUnsavedChanges || saving || selectedDetail.canPreview === false} className="rounded-lg font-medium text-white" style={{ height: 30, fontSize: 10, padding: "0 12px", background: hasUnsavedChanges ? "var(--accent)" : "var(--fg-disabled)" }}>
                    {saving ? "保存中" : hasUnsavedChanges ? "保存修改" : "已保存"}
                  </button>
                </div>
                {selectedDetail.canPreview === false ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)" }}>该文件格式暂不支持在线编辑。</p>
                  </div>
                ) : (
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono outline-none custom-scrollbar"
                    style={{ fontSize: 12, lineHeight: 1.7, color: "var(--fg-primary)" }}
                    spellCheck={false}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              </div>
              <p style={{ fontSize: "var(--text-md)", fontWeight: 650, color: "var(--fg-secondary)" }}>选择一个文件查看详情</p>
              <p style={{ maxWidth: 420, fontSize: "var(--text-xs)", color: "var(--fg-disabled)", lineHeight: 1.7, marginTop: 8 }}>
                文件中心用于保存项目资料、代码片段和 Agent 产物草稿，必要时可以一键沉淀到知识库。
              </p>
            </div>
          </div>
        )}
      </div>

      {showCreateFile && <CreateFileModal onSave={handleCreateFile} onClose={() => setShowCreateFile(false)} />}
    </div>
  );
}

function CreateFileModal({ onSave, onClose }: { onSave: (name: string, content: string) => void; onClose: () => void }) {
  const [name, setName] = useState("notes.md");
  const [content, setContent] = useState("# 新文件\n\n");
  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15, 23, 42, 0.28)" }} onClick={onClose}>
      <div className="animate-fade-in-up rounded-xl p-5" style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-lg)", width: 560, maxHeight: "82vh" }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, marginBottom: 16 }}>新建文件</h3>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="文件名，例如 notes.md" className="mb-3 w-full rounded-lg px-3 outline-none" style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={12} className="mb-4 w-full resize-none rounded-lg px-3 py-2 font-mono outline-none" style={{ fontSize: 12, background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.7 }} spellCheck={false} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 font-medium" style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>取消</button>
          <button onClick={() => { if (canSave) onSave(name.trim(), content); }} className="rounded-lg px-5 font-medium text-white" style={{ height: 32, fontSize: "var(--text-xs)", background: canSave ? "var(--accent)" : "var(--fg-disabled)" }}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
