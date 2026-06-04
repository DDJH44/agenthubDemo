"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "@/lib/api-client";

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  visibility: string;
  createdAt: string;
  _count?: { documents: number };
}

interface DocItem {
  id: string;
  title: string;
  sourceType: string;
  fileType?: string;
  fileSize?: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  _count?: { chunks: number };
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  sectionTitle?: string;
  chunkType: string;
  score: number;
}

interface KnowledgeChunk {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  sectionTitle?: string | null;
  chunkType: string;
}

interface DocDetail extends DocItem {
  chunks: KnowledgeChunk[];
  content: string;
  hasContent: boolean;
}

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  upload: { color: "#2b7fff", label: "上传" },
  manual: { color: "var(--accent)", label: "手动" },
  import: { color: "#f59e0b", label: "导入" },
  "workspace-file": { color: "#16a34a", label: "文件" },
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "已上传",
  parsing: "解析中",
  chunking: "切片中",
  embedding: "向量化中",
  completed: "已完成",
  failed: "失败",
};

const TEXT_FILE_RE = /\.(txt|md|markdown|json|csv|html|css|js|jsx|ts|tsx|xml|yml|yaml|log)$/i;

function fmtDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext || ext === name.toLowerCase()) return "txt";
  return ext === "markdown" ? "md" : ext;
}

function isProcessing(status: string): boolean {
  return ["uploaded", "parsing", "chunking", "embedding"].includes(status);
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

export function KnowledgeView() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [activeBase, setActiveBase] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocDetail, setSelectedDocDetail] = useState<DocDetail | null>(null);
  const [loadingDocDetail, setLoadingDocDetail] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "search">("detail");
  const [copiedDocContent, setCopiedDocContent] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateBase, setShowCreateBase] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const activeBaseInfo = bases.find((base) => base.id === activeBase);
  const totalChunks = docs.reduce((sum, doc) => sum + (doc._count?.chunks ?? 0), 0);
  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((doc) => doc.title.toLowerCase().includes(q));
  }, [docs, searchQuery]);

  const fetchBases = useCallback(async () => {
    try {
      const res = await api.get<{ bases: KnowledgeBase[] }>("/api/knowledge-bases");
      setBases(res.bases);
      setActiveBase((current) => current && res.bases.some((base) => base.id === current) ? current : res.bases[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDocs = useCallback(async (baseId?: string | null) => {
    if (!baseId) {
      setDocs([]);
      return;
    }
    const res = await api.get<{ documents: DocItem[] }>(`/api/knowledge-bases/${baseId}/documents`);
    setDocs(res.documents);
    setSelectedDocId((current) => current && res.documents.some((doc) => doc.id === current) ? current : res.documents[0]?.id ?? null);
  }, []);

  useEffect(() => {
    fetchBases().catch(() => setLoading(false));
  }, [fetchBases]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!activeBase) {
        if (!cancelled) {
          setDocs([]);
          setSearchResults([]);
          setSelectedDocId(null);
          setSelectedDocDetail(null);
        }
        return;
      }
      try {
        const res = await api.get<{ documents: DocItem[] }>(`/api/knowledge-bases/${activeBase}/documents`);
        if (!cancelled) {
          setDocs(res.documents);
          setSelectedDocId((current) => current && res.documents.some((doc) => doc.id === current) ? current : res.documents[0]?.id ?? null);
          setSearchResults([]);
        }
      } catch {
        if (!cancelled) setDocs([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeBase]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!selectedDocId) {
        if (!cancelled) setSelectedDocDetail(null);
        return;
      }

      setLoadingDocDetail(true);
      try {
        const res = await api.get<{ document: DocDetail }>(`/api/documents/${selectedDocId}`);
        if (!cancelled) setSelectedDocDetail(res.document);
      } catch {
        if (!cancelled) setSelectedDocDetail(null);
      } finally {
        if (!cancelled) setLoadingDocDetail(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDocId]);

  useEffect(() => {
    if (!activeBase || !docs.some((doc) => isProcessing(doc.status))) return;
    const timer = window.setInterval(() => {
      fetchDocs(activeBase).catch(() => {});
    }, 1800);
    return () => window.clearInterval(timer);
  }, [activeBase, docs, fetchDocs]);

  const handleCreateBase = async (name: string, desc: string) => {
    const res = await api.post<{ base: KnowledgeBase }>("/api/knowledge-bases", { name, description: desc });
    setBases((prev) => [res.base, ...prev]);
    setActiveBase(res.base.id);
    setShowCreateBase(false);
    setNotice("知识库已创建，可以继续上传资料或新建文档。");
  };

  const handleCreateDoc = async (title: string, content: string) => {
    if (!activeBase) return;
    const res = await api.post<{ document: DocItem }>(`/api/knowledge-bases/${activeBase}/documents`, { title, content, sourceType: "manual" });
    setDocs((prev) => [res.document, ...prev]);
    setShowCreate(false);
    setNotice("文档已进入解析队列。");
  };

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeBase) return;

    if (!file.type.startsWith("text/") && !TEXT_FILE_RE.test(file.name)) {
      setNotice("知识库当前优先支持 txt、md、json、csv、html、代码等文本类资料。");
      return;
    }

    setUploading(true);
    try {
      const content = await decodeTextFile(file);
      if (!content.trim()) {
        setNotice("文件内容为空，未加入知识库。");
        return;
      }
      const res = await api.post<{ document: DocItem }>(`/api/knowledge-bases/${activeBase}/upload`, {
        title: file.name,
        content,
        fileType: getFileType(file.name),
        sourceType: "upload",
      });
      setDocs((prev) => [res.document, ...prev]);
      setNotice(`${file.name} 已上传，正在解析切片。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "上传失败，请稍后重试。");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm("确定删除这篇知识库文档？")) return;
    await api.delete(`/api/documents/${id}`);
    setDocs((prev) => prev.filter((doc) => doc.id !== id));
    if (selectedDocId === id) {
      setSelectedDocId((prev) => prev === id ? null : prev);
      setSelectedDocDetail(null);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!activeBase || !query) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.post<{ results: SearchResult[]; warning?: string }>(`/api/knowledge-bases/${activeBase}/search`, { query, topK: 12, rerankTopK: 6 });
      setSearchResults(res.results);
      setRightPanelMode("search");
      setNotice(res.warning ? "向量检索暂不可用，已使用文本检索结果。" : "检索完成。");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "检索失败。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectDoc = (doc: DocItem) => {
    setSelectedDocId(doc.id);
    setRightPanelMode("detail");
    setCopiedDocContent(false);
  };

  const handleCopyDocContent = async () => {
    if (!selectedDocDetail?.content) return;
    try {
      await navigator.clipboard.writeText(selectedDocDetail.content);
      setCopiedDocContent(true);
      window.setTimeout(() => setCopiedDocContent(false), 1600);
    } catch {
      setNotice("复制失败，请手动选择内容复制。");
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--surface-white)" }}>
      <input ref={uploadInputRef} type="file" accept=".txt,.md,.markdown,.json,.csv,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yml,.yaml,.log,text/*" className="hidden" onChange={handleUploadFile} />

      <div className="shrink-0 px-6 py-5" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>知识库</h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
              {bases.length} 个知识库 · {docs.length} 篇文档 · {totalChunks} 个片段
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                placeholder="搜索标题或检索片段..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (!event.target.value.trim()) setSearchResults([]);
                }}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                className="outline-none rounded-lg pl-8 pr-3"
                style={{ height: 32, fontSize: "var(--text-xs)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)", width: 220 }}
              />
            </div>
            <button onClick={handleSearch} disabled={!activeBase || !searchQuery.trim() || isSearching} className="rounded-lg font-medium transition-all active:scale-[0.98]" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 12px", background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
              {isSearching ? "检索中" : "检索"}
            </button>
            <button onClick={() => uploadInputRef.current?.click()} disabled={!activeBase || uploading} className="rounded-lg font-medium transition-all active:scale-[0.98]" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 12px", background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {uploading ? "上传中" : "+ 上传资料"}
            </button>
            <button onClick={() => setShowCreateBase(true)} className="rounded-lg font-medium text-white transition-all active:scale-[0.98]" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
              + 知识库
            </button>
            <button onClick={() => setShowCreate(true)} disabled={!activeBase} className="rounded-lg font-medium text-white transition-all active:scale-[0.98]" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: activeBase ? "var(--accent-gradient)" : "var(--fg-disabled)" }}>
              + 新建文档
            </button>
          </div>
        </div>

        {bases.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {bases.map((kb) => (
              <button
                key={kb.id}
                onClick={() => setActiveBase(kb.id)}
                className="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all"
                style={{
                  fontSize: "var(--text-2xs)",
                  background: activeBase === kb.id ? "var(--accent)" : "transparent",
                  color: activeBase === kb.id ? "#fff" : "var(--fg-secondary)",
                }}
              >
                {kb.name} ({kb._count?.documents ?? 0})
              </button>
            ))}
          </div>
        )}

        {notice && (
          <div className="mt-3 rounded-lg px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            {notice}
          </div>
        )}
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden px-6 py-4" style={{ gridTemplateColumns: "minmax(0, 1fr) 330px" }}>
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 650, color: "var(--fg-primary)" }}>{activeBaseInfo?.name ?? "未选择知识库"}</p>
              <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>{activeBaseInfo?.description || "用于给 Agent 检索、引用和补充上下文。"}</p>
            </div>
            <span className="rounded-full px-2 py-1" style={{ fontSize: 10, color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
              {filteredDocs.length} / {docs.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
            {loading ? (
              <p style={{ color: "var(--fg-tertiary)", textAlign: "center", padding: 40 }}>加载中...</p>
            ) : !activeBase ? (
              <EmptyKnowledgeState title="选择或创建一个知识库" desc="知识库用于沉淀课题资料、产品文档、代码说明和 Agent 可引用的上下文。" action="+ 创建知识库" onAction={() => setShowCreateBase(true)} />
            ) : docs.length === 0 ? (
              <EmptyKnowledgeState title="暂无文档" desc="上传资料或新建文档后，系统会自动解析并切片，供 Agent 在会话中引用。" action="+ 上传资料" onAction={() => uploadInputRef.current?.click()} />
            ) : filteredDocs.length === 0 ? (
              <EmptyKnowledgeState title="没有匹配文档" desc="可以按回车进行片段级检索，或清空搜索词查看全部文档。" action="清空搜索" onAction={() => { setSearchQuery(""); setSearchResults([]); }} />
            ) : (
              <div className="space-y-1.5">
                {filteredDocs.map((doc) => {
                  const cfg = TYPE_CONFIG[doc.sourceType] ?? { color: "var(--accent)", label: doc.sourceType };
                  return (
                    <div
                      key={doc.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectDoc(doc)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") handleSelectDoc(doc);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
                      style={{
                        background: selectedDocId === doc.id ? "var(--accent-subtle)" : undefined,
                        boxShadow: selectedDocId === doc.id ? "inset 3px 0 0 var(--accent)" : undefined,
                      }}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: cfg.color + "14" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M8 13h8M8 17h5" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>{doc.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: cfg.color, background: cfg.color + "14" }}>{cfg.label}</span>
                          <span className={`rounded px-1.5 py-0.5 ${isProcessing(doc.status) ? "animate-pulse-dot" : ""}`} style={{ fontSize: 9, background: doc.status === "failed" ? "var(--danger-subtle)" : "var(--surface-low)", color: doc.status === "failed" ? "var(--danger)" : "var(--fg-tertiary)" }}>
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </span>
                          <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>{fmtDate(doc.createdAt)} · {formatSize(doc.fileSize)} · {doc._count?.chunks ?? 0} 片段</span>
                        </div>
                        {doc.status === "failed" && doc.errorMessage && (
                          <p className="mt-1 truncate" style={{ fontSize: 10, color: "var(--danger)" }}>{doc.errorMessage}</p>
                        )}
                      </div>
                      <button onClick={(event) => { event.stopPropagation(); handleDeleteDoc(doc.id); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--danger-subtle)]" style={{ color: "var(--fg-disabled)" }} title="删除文档">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p style={{ fontSize: "var(--text-sm)", fontWeight: 650, color: "var(--fg-primary)" }}>
                  {rightPanelMode === "detail" ? "文档内容" : "片段检索"}
                </p>
                <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
                  {rightPanelMode === "detail" ? "查看正文、切片和可引用内容。" : "按语义或关键词找到可引用的资料片段。"}
                </p>
              </div>
              <div className="flex shrink-0 rounded-lg p-0.5" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                <button onClick={() => setRightPanelMode("detail")} className="rounded-md px-2 py-1 font-medium" style={{ fontSize: 10, color: rightPanelMode === "detail" ? "var(--accent)" : "var(--fg-tertiary)", background: rightPanelMode === "detail" ? "var(--surface-white)" : "transparent" }}>
                  内容
                </button>
                <button onClick={() => setRightPanelMode("search")} className="rounded-md px-2 py-1 font-medium" style={{ fontSize: 10, color: rightPanelMode === "search" ? "var(--accent)" : "var(--fg-tertiary)", background: rightPanelMode === "search" ? "var(--surface-white)" : "transparent" }}>
                  检索
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {rightPanelMode === "detail" ? (
              <DocumentDetailPanel
                doc={selectedDocDetail}
                loading={loadingDocDetail}
                copied={copiedDocContent}
                onCopy={handleCopyDocContent}
                onUpload={() => uploadInputRef.current?.click()}
              />
            ) : (
              <SearchResultsPanel query={searchQuery} isSearching={isSearching} results={searchResults} />
            )}
          </div>
        </aside>
      </div>

      {showCreate && <CreateDocModal onSave={handleCreateDoc} onClose={() => setShowCreate(false)} />}
      {showCreateBase && <CreateBaseModal onSave={handleCreateBase} onClose={() => setShowCreateBase(false)} />}
    </div>
  );
}

function DocumentDetailPanel({
  doc,
  loading,
  copied,
  onCopy,
  onUpload,
}: {
  doc: DocDetail | null;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
  onUpload: () => void;
}) {
  if (loading) {
    return <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>正在加载文档内容...</p>;
  }

  if (!doc) {
    return (
      <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px dashed var(--border)" }}>
        <p style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-secondary)" }}>还没有选择文档</p>
        <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", lineHeight: 1.7, marginTop: 6 }}>点击左侧文档后，这里会显示正文和切片内容。</p>
      </div>
    );
  }

  if (!doc.hasContent) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg p-3" style={{ background: "var(--danger-subtle)", border: "1px solid rgba(239,68,68,0.18)" }}>
          <p style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--danger)" }}>缺少可用内容</p>
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--danger)", lineHeight: 1.7, marginTop: 6 }}>
            {doc.errorMessage || "这篇文档没有生成正文切片，无法被 Agent 引用。"}
          </p>
        </div>
        <button onClick={onUpload} className="rounded-lg font-medium text-white" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
          重新上传资料
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-primary)" }}>{doc.title}</p>
            <p style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
              {doc.chunks.length} 个片段 · {formatSize(doc.fileSize)} · {STATUS_LABELS[doc.status] ?? doc.status}
            </p>
          </div>
          <button onClick={onCopy} className="shrink-0 rounded-md px-2 py-1 font-medium" style={{ fontSize: 10, color: copied ? "var(--success)" : "var(--accent)", background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            {copied ? "已复制" : "复制正文"}
          </button>
        </div>
        <div className="max-h-52 overflow-y-auto rounded-md p-2 custom-scrollbar" style={{ background: "var(--surface-white)", border: "1px solid var(--divider)" }}>
          <p style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", lineHeight: 1.75 }}>
            {doc.content}
          </p>
        </div>
      </div>

      <div>
        <p style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-primary)", marginBottom: 8 }}>切片内容</p>
        <div className="space-y-2">
          {doc.chunks.map((chunk) => (
            <div key={chunk.id} className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>#{chunk.chunkIndex + 1}</span>
                <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>{chunk.chunkType} · {chunk.tokenCount} tokens</span>
              </div>
              {chunk.sectionTitle && <p className="mb-1 truncate" style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{chunk.sectionTitle}</p>}
              <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {chunk.content.length > 360 ? `${chunk.content.slice(0, 360)}...` : chunk.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchResultsPanel({ query, isSearching, results }: { query: string; isSearching: boolean; results: SearchResult[] }) {
  if (!query.trim()) {
    return <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", lineHeight: 1.7 }}>输入关键词后点击“检索”，这里会展示知识库片段。后续会话可以基于这些内容让 Agent 继续处理。</p>;
  }

  if (isSearching) {
    return <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>正在检索...</p>;
  }

  if (results.length === 0) {
    return <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", lineHeight: 1.7 }}>暂无片段结果。可以换一个关键词，或确认文档状态是否已完成。</p>;
  }

  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div key={result.chunkId} className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="truncate" style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{result.documentTitle}</p>
            <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>{Math.round(result.score * 100)}%</span>
          </div>
          {result.sectionTitle && <p className="mb-1 truncate" style={{ fontSize: 10, color: "var(--accent)" }}>{result.sectionTitle}</p>}
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {result.content.length > 260 ? `${result.content.slice(0, 260)}...` : result.content}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyKnowledgeState({ title, desc, action, onAction }: { title: string; desc: string; action: string; onAction: () => void }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" />
        </svg>
      </div>
      <p style={{ fontSize: "var(--text-md)", fontWeight: 650, color: "var(--fg-secondary)", marginBottom: 6 }}>{title}</p>
      <p style={{ maxWidth: 360, fontSize: "var(--text-xs)", color: "var(--fg-disabled)", lineHeight: 1.7, marginBottom: 16 }}>{desc}</p>
      <button onClick={onAction} className="rounded-lg font-medium text-white" style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent-gradient)" }}>
        {action}
      </button>
    </div>
  );
}

function CreateDocModal({ onSave, onClose }: { onSave: (title: string, content: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const canSave = title.trim() && content.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15, 23, 42, 0.28)" }} onClick={onClose}>
      <div className="animate-fade-in-up rounded-xl p-5" style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-lg)", width: 520, maxHeight: "80vh" }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, marginBottom: 16 }}>新建文档</h3>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="文档标题" className="mb-3 w-full rounded-lg px-3 outline-none" style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴资料、课题背景、接口说明或产品规则..." rows={10} className="mb-4 w-full resize-none rounded-lg px-3 py-2 outline-none" style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.6 }} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 font-medium" style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>取消</button>
          <button onClick={() => { if (canSave) onSave(title.trim(), content.trim()); }} className="rounded-lg px-5 font-medium text-white" style={{ height: 32, fontSize: "var(--text-xs)", background: canSave ? "var(--accent)" : "var(--fg-disabled)" }}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateBaseModal({ onSave, onClose }: { onSave: (name: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15, 23, 42, 0.28)" }} onClick={onClose}>
      <div className="animate-fade-in-up rounded-xl p-5" style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-lg)", width: 420 }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, marginBottom: 16 }}>创建知识库</h3>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="知识库名称" className="mb-3 w-full rounded-lg px-3 outline-none" style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <input value={desc} onChange={(event) => setDesc(event.target.value)} placeholder="描述（可选）" className="mb-4 w-full rounded-lg px-3 outline-none" style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 font-medium" style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>取消</button>
          <button onClick={() => { if (canSave) onSave(name.trim(), desc.trim()); }} className="rounded-lg px-5 font-medium text-white" style={{ height: 32, fontSize: "var(--text-xs)", background: canSave ? "var(--accent)" : "var(--fg-disabled)" }}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
