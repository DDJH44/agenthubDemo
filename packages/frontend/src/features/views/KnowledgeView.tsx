"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";

interface KnowledgeBase {
  id: string; name: string; description?: string; visibility: string;
  createdAt: string; _count?: { documents: number };
}

interface DocItem {
  id: string; title: string; sourceType: string; fileType?: string;
  status: string; createdAt: string; _count?: { chunks: number };
}

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  upload: { color: "#2b7fff", label: "上传" },
  manual: { color: "var(--accent)", label: "手动" },
  import: { color: "#f59e0b", label: "导入" },
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "已上传", parsing: "解析中", chunking: "切片中",
  embedding: "向量化中", completed: "已完成", failed: "失败",
};

function fmtDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export function KnowledgeView() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [activeBase, setActiveBase] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateBase, setShowCreateBase] = useState(false);

  useEffect(() => {
    api.get<{ bases: KnowledgeBase[] }>("/api/knowledge-bases").then((res) => {
      setBases(res.bases);
      if (res.bases.length > 0) setActiveBase(res.bases[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeBase) return;
    api.get<{ documents: DocItem[] }>(`/api/knowledge-bases/${activeBase}/documents`).then((res) => {
      setDocs(res.documents);
    }).catch(() => {});
  }, [activeBase]);

  const handleCreateBase = async (name: string, desc: string) => {
    const res = await api.post<{ base: KnowledgeBase }>("/api/knowledge-bases", { name, description: desc });
    setBases((prev) => [...prev, res.base]);
    setActiveBase(res.base.id);
    setShowCreateBase(false);
  };

  const handleCreateDoc = async (title: string, content: string) => {
    if (!activeBase) return;
    const res = await api.post<{ document: DocItem }>(`/api/knowledge-bases/${activeBase}/documents`, { title, content, sourceType: "manual" });
    setDocs((prev) => [...prev, res.document]);
    setShowCreate(false);
  };

  const handleDeleteDoc = async (id: string) => {
    await api.delete(`/api/documents/${id}`);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const _handleDeleteBase = async (id: string) => {
    await api.delete(`/api/knowledge-bases/${id}`);
    setBases((prev) => prev.filter((b) => b.id !== id));
    if (activeBase === id) setActiveBase(null);
  };

  const totalDocs = docs.length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* Header */}
      <div className="px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
              知识库
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
              {bases.length} 个知识库 · {totalDocs} 篇文档
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input placeholder="搜索文档..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outline-none rounded-lg pl-8 pr-3"
                style={{ height: 30, fontSize: "var(--text-xs)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid transparent", width: 180 }}
              />
            </div>
            <button className="rounded-lg font-medium text-white transition-all active:scale-[0.98]"
              onClick={() => setShowCreateBase(true)}
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
              + 知识库
            </button>
            <button className="rounded-lg font-medium text-white transition-all active:scale-[0.98]"
              onClick={() => setShowCreate(true)}
              disabled={!activeBase}
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: activeBase ? "var(--accent-gradient)" : "var(--fg-disabled)" }}>
              + 新建文档
            </button>
          </div>
        </div>

        {/* KB selector tabs */}
        {bases.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {bases.map((kb) => (
              <button key={kb.id} onClick={() => setActiveBase(kb.id)}
                className="rounded-md px-3 py-1.5 font-medium transition-all shrink-0"
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
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-3">
        {loading ? (
          <p style={{ color: "var(--fg-tertiary)", textAlign: "center", padding: 40 }}>加载中...</p>
        ) : !activeBase ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: 60 }}>
            <p style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--fg-tertiary)", marginBottom: 8 }}>选择或创建一个知识库</p>
            <button onClick={() => setShowCreateBase(true)}
              className="rounded-lg font-medium text-white"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
              + 创建知识库
            </button>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: 60 }}>
            <p style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--fg-tertiary)", marginBottom: 8 }}>暂无文档</p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", marginBottom: 16 }}>创建文档或上传文件开始构建知识库</p>
            <button onClick={() => setShowCreate(true)}
              className="rounded-lg font-medium text-white"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent-gradient)" }}>
              + 新建文档
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {docs.filter((d) => !searchQuery || d.title.includes(searchQuery)).map((doc) => {
              const cfg = TYPE_CONFIG[doc.sourceType] ?? { color: "var(--accent)", label: doc.sourceType };
              return (
                <div key={doc.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: cfg.color + "14" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.5" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, color: cfg.color, background: cfg.color + "14" }}>{cfg.label}</span>
                      <span className={`rounded px-1.5 py-0.5 ${doc.status === "completed" ? "" : "animate-pulse-dot"}`}
                        style={{ fontSize: 9, background: doc.status === "failed" ? "var(--danger-subtle)" : "var(--surface-low)", color: doc.status === "failed" ? "var(--danger)" : "var(--fg-tertiary)" }}>
                        {STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>{fmtDate(doc.createdAt)} · {doc._count?.chunks ?? 0} chunks</span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDoc(doc.id)}
                    className="w-6 h-6 rounded flex items-center justify-center shrink-0 hover:bg-[var(--danger-subtle)]"
                    style={{ color: "var(--fg-disabled)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Doc Modal */}
      {showCreate && <CreateDocModal onSave={handleCreateDoc} onClose={() => setShowCreate(false)} />}
      {showCreateBase && <CreateBaseModal onSave={handleCreateBase} onClose={() => setShowCreateBase(false)} />}
    </div>
  );
}

function CreateDocModal({ onSave, onClose }: { onSave: (title: string, content: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }} onClick={onClose}>
      <div className="rounded-xl p-5 animate-fade-in-up" style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-lg)", width: 480, maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, marginBottom: 16 }}>新建文档</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题"
          className="w-full outline-none rounded-lg px-3 mb-3"
          style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="文档内容..."
          rows={8}
          className="w-full outline-none rounded-lg px-3 py-2 resize-none mb-4"
          style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.6 }} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg font-medium px-4" style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>取消</button>
          <button onClick={() => { if (title.trim()) { onSave(title.trim(), content); setTitle(""); setContent(""); } }}
            className="rounded-lg font-medium text-white px-5" style={{ height: 32, fontSize: "var(--text-xs)", background: title.trim() ? "var(--accent)" : "var(--fg-disabled)" }}>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }} onClick={onClose}>
      <div className="rounded-xl p-5 animate-fade-in-up" style={{ background: "var(--surface-white)", boxShadow: "var(--shadow-lg)", width: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, marginBottom: 16 }}>创建知识库</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="知识库名称"
          className="w-full outline-none rounded-lg px-3 mb-3"
          style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="描述（可选）"
          className="w-full outline-none rounded-lg px-3 mb-4"
          style={{ height: 36, fontSize: "var(--text-sm)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg font-medium px-4" style={{ height: 32, fontSize: "var(--text-xs)", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>取消</button>
          <button onClick={() => { if (name.trim()) onSave(name.trim(), desc); }}
            className="rounded-lg font-medium text-white px-5" style={{ height: 32, fontSize: "var(--text-xs)", background: name.trim() ? "var(--accent)" : "var(--fg-disabled)" }}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
