"use client";

import { useEffect, useRef } from "react";
import { useFileStore } from "@/stores/file-store";

interface FilePanelProps {
  conversationId: string;
  onSendMessage?: (type: string, payload: Record<string, unknown>) => void;
}

const FILE_ICONS: Record<string, string> = {
  "image/png": "🖼",
  "image/jpeg": "🖼",
  "image/gif": "🖼",
  "image/svg+xml": "🖼",
  "application/pdf": "📄",
  "text/html": "🌐",
  "text/css": "🎨",
  "text/javascript": "⚡",
  "application/json": "📋",
  "application/zip": "📦",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePanel({ conversationId, onSendMessage }: FilePanelProps) {
  const { filesByConversation, uploading, uploadFile, downloadFile, deleteFile } = useFileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const files = filesByConversation[conversationId] ?? [];

  useEffect(() => {
    if (conversationId) {
      onSendMessage?.("file:list", { conversationId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSendMessage is stable, only re-run on conversationId change
  }, [conversationId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(conversationId, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(conversationId, file);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* Upload area */}
      <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
          style={{ borderColor: "var(--border)", background: "var(--surface-low)" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {uploading ? "上传中..." : "点击或拖拽文件到此处上传"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>最大 100MB</p>
        </div>
        <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 py-2 px-3 rounded-lg group"
              style={{ background: "var(--surface-low)" }}>
              <span className="text-lg">{FILE_ICONS[file.mimeType] ?? "📎"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{file.name}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  {formatSize(file.size)}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => downloadFile(file.id, file.name)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: "var(--accent)", fontSize: 10 }}>
                  下载
                </button>
                <button onClick={() => deleteFile(conversationId, file.id)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: "#ba1a1a", fontSize: 10 }}>
                  删除
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: "var(--text-tertiary)" }}>暂无文件</p>
          )}
        </div>
      </div>
    </div>
  );
}
