import { create } from "zustand";
import type { FileInfo } from "@agenthub/shared";

const API_URL = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3002`
  : "http://localhost:3002";

interface FileStore {
  filesByConversation: Record<string, FileInfo[]>;
  uploading: boolean;

  setFiles: (conversationId: string, files: FileInfo[]) => void;
  addFile: (conversationId: string, file: FileInfo) => void;
  removeFile: (conversationId: string, fileId: string) => void;
  uploadFile: (conversationId: string, file: File) => Promise<void>;
  downloadFile: (fileId: string, fileName: string) => Promise<void>;
  deleteFile: (conversationId: string, fileId: string) => Promise<void>;
}

export const useFileStore = create<FileStore>((set, get) => ({
  filesByConversation: {},
  uploading: false,

  setFiles(conversationId, files) {
    set((state) => ({
      filesByConversation: { ...state.filesByConversation, [conversationId]: files },
    }));
  },

  addFile(conversationId, file) {
    set((state) => {
      const existing = state.filesByConversation[conversationId] ?? [];
      return { filesByConversation: { ...state.filesByConversation, [conversationId]: [file, ...existing] } };
    });
  },

  removeFile(conversationId, fileId) {
    set((state) => {
      const existing = state.filesByConversation[conversationId] ?? [];
      return { filesByConversation: { ...state.filesByConversation, [conversationId]: existing.filter(f => f.id !== fileId) } };
    });
  },

  async uploadFile(conversationId, file) {
    set({ uploading: true });
    try {
      const token = localStorage.getItem("agenthub-auth-token");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/api/conversations/${conversationId}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files?.[0]) {
          get().addFile(conversationId, data.files[0]);
        }
      }
    } finally {
      set({ uploading: false });
    }
  },

  async downloadFile(fileId, fileName) {
    const token = localStorage.getItem("agenthub-auth-token");
    const res = await fetch(`${API_URL}/api/files/${fileId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  async deleteFile(conversationId, fileId) {
    const token = localStorage.getItem("agenthub-auth-token");
    const res = await fetch(`${API_URL}/api/files/${fileId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      get().removeFile(conversationId, fileId);
    }
  },
}));
