import { create } from "zustand";
import { createId } from "@/lib/id";

export interface ConversationFile {
  id: string;
  title: string;
  content: string;
  topic: string;
  messageId: string;
  timestamp: number;
  starred: boolean;
}

interface ConversationFilesStore {
  files: ConversationFile[];
  addFile: (file: Omit<ConversationFile, "id" | "timestamp">) => void;
  removeFile: (id: string) => void;
  toggleStar: (id: string) => void;
  getFilesByTopic: (topic: string) => ConversationFile[];
  getAllTopics: () => string[];
  clearFiles: () => void;
  hydrate: () => void;
}

const STORAGE_KEY = "agenthub-conversation-files";

function loadFiles(): ConversationFile[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveFiles(files: ConversationFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    /* ignore quota errors */
  }
}

export const useConversationFilesStore = create<ConversationFilesStore>((set, get) => ({
  files: [],
  addFile: (file) =>
    set((state) => {
      const newFile: ConversationFile = {
        ...file,
        id: createId(),
        timestamp: Date.now(),
      };
      const next = [...state.files, newFile];
      saveFiles(next);
      return { files: next };
    }),
  removeFile: (id) =>
    set((state) => {
      const next = state.files.filter((f) => f.id !== id);
      saveFiles(next);
      return { files: next };
    }),
  toggleStar: (id) =>
    set((state) => {
      const next = state.files.map((f) => (f.id === id ? { ...f, starred: !f.starred } : f));
      saveFiles(next);
      return { files: next };
    }),
  getFilesByTopic: (topic) => get().files.filter((f) => f.topic === topic),
  getAllTopics: () => {
    const topics = new Set<string>();
    get().files.forEach((f) => topics.add(f.topic));
    return Array.from(topics);
  },
  clearFiles: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ files: [] });
  },
  hydrate: () => {
    set({ files: loadFiles() });
  },
}));
