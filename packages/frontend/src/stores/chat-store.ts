import { create } from "zustand";
import type { Conversation, Message, AgentState, TaskFlowItem, SessionAgentStatus, TaskProgress, ResourceItem, Member } from "@agenthub/shared";
import type { SessionStatus, TaskPriority } from "@agenthub/shared";

// ── localStorage 持久化 ──
const PERSIST_KEY = "agenthub-chat-messages";
const CONV_KEY = "agenthub-conversations";
const ACTIVE_CONV_KEY = "agenthub-active-conv";
const AGENT_STATES_KEY = "agenthub-agent-states";
const CONV_DETAIL_KEY = "agenthub-conv-detail";
const CONTEXT_REFS_KEY = "agenthub-context-references";
const MAX_PERSIST_MSGS = 200;

function loadMessages(): Record<string, Message[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveMessages(msgs: Record<string, Message[]>) {
  if (typeof window === "undefined") return;
  try {
    const trimmed: Record<string, Message[]> = {};
    for (const [k, v] of Object.entries(msgs)) {
      trimmed[k] = v.slice(-MAX_PERSIST_MSGS);
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded */ }
}

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(convs: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convs.slice(-100)));
  } catch { /* quota exceeded */ }
}

function loadActiveConvId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CONV_KEY);
}

function saveActiveConvId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_CONV_KEY, id);
  else localStorage.removeItem(ACTIVE_CONV_KEY);
}

function loadAgentStates(): Record<string, AgentState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(AGENT_STATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAgentStates(states: Record<string, AgentState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AGENT_STATES_KEY, JSON.stringify(states));
  } catch { /* quota exceeded */ }
}

function loadConvDetail(): ChatStore["conversationDetail"] {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONV_DETAIL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConvDetail(detail: ChatStore["conversationDetail"]) {
  if (typeof window === "undefined") return;
  try {
    if (detail) localStorage.setItem(CONV_DETAIL_KEY, JSON.stringify(detail));
    else localStorage.removeItem(CONV_DETAIL_KEY);
  } catch { /* quota exceeded */ }
}

interface ContextReference {
  id: string;
  messageId?: string;
  sourceType: "message" | "quote" | "artifact";
  sender: string;
  senderId?: string;
  title: string;
  content: string;
  createdAt: number;
}

function loadContextReferences(): Record<string, ContextReference[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CONTEXT_REFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveContextReferences(refs: Record<string, ContextReference[]>) {
  if (typeof window === "undefined") return;
  try {
    const trimmed: Record<string, ContextReference[]> = {};
    for (const [key, value] of Object.entries(refs)) {
      trimmed[key] = value.slice(-50);
    }
    localStorage.setItem(CONTEXT_REFS_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded */ }
}

interface StepProgress { id: string; index: number; total: number; step: string; status: "pending"|"running"|"done"; result?: string; }

interface AgentStepInfo {
  iteration: number;
  thought: string;
  action?: { tool: string; input: string };
  observation?: string;
  isFinal: boolean;
  timestamp: number;
}

interface ChatStore {
  connected: boolean; conversations: Conversation[]; activeConversationId: string | null;
  messages: Record<string, Message[]>; agentStates: Record<string, AgentState>;
  planSteps: string[]; steps: StepProgress[]; streamBuffer: string;
  isStreaming: boolean; taskSummary: string;
  agentSteps: AgentStepInfo[];
  messageHistory: Array<{ id: string; messages: Message[]; timestamp: number }>;

  /** 智能体协同分析 */
  analysisResults: Array<{ agentId: string; agentName: string; content: string; timestamp: number }>;
  taskAssignments: Array<{ targetAgent: string; task: string; status: "pending" | "running" | "done" }>;
  isAnalyzing: boolean;

  conversationDetail: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: SessionStatus;
    estimatedDuration: number;
    createdAt: number;
    createdBy: string;
    participants: Member[];
    agentCount: number;
  } | null;

  taskFlow: TaskFlowItem[];
  sessionAgentStatuses: SessionAgentStatus[];
  taskProgress: TaskProgress | null;
  resources: ResourceItem[];

  messageFilter: "all" | "system" | "agent" | "planner" | "researcher" | "frontend" | "backend" | "critic";
  messageSearchQuery: string;

  /** 对话列表管理 */
  showArchived: boolean;
  conversationSearchQuery: string;

  /** 待发送消息（会话创建后自动发送） */
  pendingMessage: string | null;

  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Phase 1: agent coordination
  conversationMode: Record<string, "single" | "group">;
  agentTyping: Record<string, string[]>;
  currentPreview: null | { artifactId: string; type: string; content: string; filename?: string };
  agentMessages: Record<string, Array<{ agentId: string; agentName: string; agentRole: string; content: string; timestamp: number }>>;
  contextReferences: Record<string, ContextReference[]>;

  setConversationMode: (convId: string, mode: "single" | "group") => void;
  setAgentTyping: (convId: string, agentId: string, isTyping: boolean) => void;
  setCurrentPreview: (preview: ChatStore["currentPreview"]) => void;
  addAgentMessage: (convId: string, msg: { agentId: string; agentName: string; agentRole: string; content: string; timestamp: number }) => void;
  addContextReference: (convId: string, ref: Omit<ContextReference, "id" | "createdAt"> & { id?: string; createdAt?: number }) => void;
  removeContextReference: (convId: string, refId: string) => void;
  clearContextReferences: (convId: string) => void;

  /** AI助手全局流式状态（跨视图持久） */
  aiStreamBuffer: string;
  aiIsStreaming: boolean;
  activeAiAbort: AbortController | null;
  sendAssistantMessage: (text: string, history?: Array<{ role: string; content: string }>) => Promise<void>;
  abortAssistantMessage: () => void;

  setConnected: (v: boolean) => void;
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string) => void;
  addMessage: (convId: string, msg: Message) => void;
  addPlan: (steps: Array<{ id: string; task: string }>) => void;
  updateStepProgress: (idx: number, status: StepProgress["status"], result?: string) => void;
  updateStepById: (stepId: string, status: StepProgress["status"], result?: string) => void;
  updateAgentState: (id: string, state: Partial<AgentState>) => void;
  appendStreamChunk: (chunk: string) => void;
  addAgentStep: (step: AgentStepInfo) => void;
  clearAgentSteps: () => void;
  setTaskSummary: (summary: string) => void;
  setStreaming: (v: boolean) => void;
  setStreamBuffer: (buffer: string) => void;
  clearSession: () => void;

  setConversationDetail: (detail: ChatStore["conversationDetail"]) => void;
  setTaskFlow: (items: TaskFlowItem[]) => void;
  updateTaskFlowItem: (id: string, updates: Partial<TaskFlowItem>) => void;
  setSessionAgentStatuses: (statuses: SessionAgentStatus[]) => void;
  setTaskProgress: (progress: TaskProgress) => void;
  setResources: (items: ResourceItem[]) => void;
  addResource: (item: ResourceItem) => void;
  setMessageFilter: (filter: ChatStore["messageFilter"]) => void;
  setMessageSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
  updateConversationTitle: (title: string) => void;
  toggleTaskFlowCollapse: (id: string) => void;

  pinConversation: (id: string) => void;
  unpinConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  unarchiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  updateConversation: (conv: Conversation) => void;
  setShowArchived: (show: boolean) => void;
  setConversationSearchQuery: (query: string) => void;
  searchConversations: (query: string) => void;
  setPendingMessage: (msg: string | null) => void;

  addAnalysisResult: (result: { agentId: string; agentName: string; content: string }) => void;
  addTaskAssignment: (assignment: { targetAgent: string; task: string; status: "pending" | "running" | "done" }) => void;
  setIsAnalyzing: (v: boolean) => void;
  clearAnalysis: () => void;
  undoMessage: (conversationId: string, messageId: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
}

let _streamAccumulator = "";
let _streamRafId: number | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  connected: false,
  conversations: loadConversations(),
  activeConversationId: loadActiveConvId(),
  messages: loadMessages(),
  agentStates: loadAgentStates(), planSteps: [], steps: [],
  streamBuffer: "", isStreaming: false, taskSummary: "",
  agentSteps: [],
  messageHistory: [],
  analysisResults: [],
  taskAssignments: [],
  isAnalyzing: false,

  conversationDetail: loadConvDetail(),
  taskFlow: [],
  sessionAgentStatuses: [],
  taskProgress: null,
  resources: [],
  messageFilter: "all",
  messageSearchQuery: "",
  showArchived: false,
  conversationSearchQuery: "",
  pendingMessage: null,
  isLoading: false,
  isSending: false,
  error: null,

  conversationMode: {},
  agentTyping: {},
  currentPreview: null,
  agentMessages: {},
  contextReferences: loadContextReferences(),

  aiStreamBuffer: "",
  aiIsStreaming: false,
  activeAiAbort: null,

  setConnected: (v) => set({ connected: v }),

  setConversations: (convs) => {
    saveConversations(convs);
    set({ conversations: convs });
  },

  addConversation: (conv) =>
    set((s) => {
      if (s.conversations.some((c) => c.id === conv.id)) return {};
      const next = [...s.conversations, conv];
      const nextActive = s.activeConversationId ?? conv.id;
      saveConversations(next);
      saveActiveConvId(nextActive);
      return {
        conversations: next,
        activeConversationId: nextActive,
      };
    }),

  removeConversation: (id) =>
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== id);
      const nextActive = s.activeConversationId === id ? null : s.activeConversationId;
      saveConversations(next);
      saveActiveConvId(nextActive);
      return { conversations: next, activeConversationId: nextActive };
    }),

  setActiveConversation: (id) => { 
    _streamAccumulator = "";
    if (_streamRafId) { cancelAnimationFrame(_streamRafId); _streamRafId = null; }
    const currentMessages = get().messages;
    const nextMessages = currentMessages[id] ? currentMessages : { ...currentMessages, [id]: [] };
    saveActiveConvId(id);
    set({ 
      activeConversationId: id, 
      agentStates: {}, planSteps: [], steps: [], streamBuffer: "", isStreaming: false, taskSummary: "", agentSteps: [], resources: [], conversationDetail: null, taskFlow: [], sessionAgentStatuses: [], taskProgress: null,
      messages: nextMessages,
    }); 
  },

  addMessage: (convId, msg) =>
    set((s) => {
      const existing = s.messages[convId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return {};
      const MAX_MESSAGES = 500;
      const updated = existing.length >= MAX_MESSAGES ? [...existing.slice(-MAX_MESSAGES + 1), msg] : [...existing, msg];
      const conversations = s.conversations.map((c) =>
        c.id === convId ? { ...c, lastMessage: msg.content.slice(0, 80), lastMessageAt: msg.timestamp, updatedAt: msg.timestamp } : c
      );
      const newMessages = { ...s.messages, [convId]: updated };
      // 异步持久化
      setTimeout(() => saveMessages(newMessages), 0);
      return { messages: newMessages, conversations };
    }),

  addPlan: (plan_steps) =>
    set({
      planSteps: plan_steps.map((p) => p.task),
      steps: plan_steps.map((p, i) => ({ id: p.id, index: i, total: plan_steps.length, step: p.task, status: "pending" as const })),
    }),

  updateStepProgress: (idx, status, result) =>
    set((s) => ({ steps: s.steps.map((st, i) => (i === idx ? { ...st, status, ...(result ? { result } : {}) } : st)) })),

  updateStepById: (stepId, status, result) =>
    set((s) => ({
      steps: s.steps.map((st) => (st.id === stepId ? { ...st, status, result: result ?? st.result } : st)),
    })),

  updateAgentState: (id, state) =>
    set((s) => {
      const next = { ...s.agentStates, [id]: { ...(s.agentStates[id] ?? { id, role: "worker" as const, status: "idle" as const, output: "", logs: [] }), ...state } };
      saveAgentStates(next);
      return { agentStates: next };
    }),

  appendStreamChunk: (chunk) => {
    _streamAccumulator += chunk;
    if (!_streamRafId) {
      _streamRafId = requestAnimationFrame(() => {
        const accumulated = _streamAccumulator;
        _streamAccumulator = "";
        _streamRafId = null;
        set((s) => ({ streamBuffer: s.streamBuffer + accumulated }));
      });
    }
  },

  addAgentStep: (step) => set((s) => ({ agentSteps: [...s.agentSteps, step] })),

  clearAgentSteps: () => set({ agentSteps: [] }),

  setTaskSummary: (summary) => {
    _streamAccumulator = "";
    if (_streamRafId) { cancelAnimationFrame(_streamRafId); _streamRafId = null; }
    const state = get();
    const convId = state.activeConversationId;
    if (convId && state.streamBuffer && state.streamBuffer.trim().length > 0) {
      const existing = state.messages[convId] ?? [];
      const alreadyHasSummary = existing.some(m => m.type === "agent_message" && m.sender === "refiner");
      if (!alreadyHasSummary) {
        const streamMsg: Message = {
          id: crypto.randomUUID(),
          conversationId: convId,
          type: "agent_message",
          sender: "assistant",
          content: state.streamBuffer,
          mentions: [],
          timestamp: Date.now(),
        };
        const newMessages = { ...state.messages, [convId]: [...existing, streamMsg] };
        setTimeout(() => saveMessages(newMessages), 0);
        set({ taskSummary: summary, isStreaming: false, streamBuffer: "", messages: newMessages });
        return;
      }
    }
    set({ taskSummary: summary, isStreaming: false, streamBuffer: "" });
  },

  setStreaming: (v) => set({ isStreaming: v }),

  setStreamBuffer: (buffer) => {
    _streamAccumulator = "";
    if (_streamRafId) { cancelAnimationFrame(_streamRafId); _streamRafId = null; }
    set({ streamBuffer: buffer });
  },

  clearSession: () => {
    _streamAccumulator = "";
    if (_streamRafId) { cancelAnimationFrame(_streamRafId); _streamRafId = null; }
    set({ agentStates: {}, planSteps: [], steps: [], streamBuffer: "", isStreaming: false, taskSummary: "", agentSteps: [], resources: [], conversationDetail: null, taskFlow: [], sessionAgentStatuses: [], taskProgress: null });
  },

  setConversationDetail: (detail) => {
    saveConvDetail(detail);
    set({ conversationDetail: detail });
  },

  setTaskFlow: (items) => set({ taskFlow: items }),

  updateTaskFlowItem: (id, updates) =>
    set((s) => ({ taskFlow: s.taskFlow.map((item) => (item.id === id ? { ...item, ...updates } : item)) })),

  setSessionAgentStatuses: (statuses) => set({ sessionAgentStatuses: statuses }),

  setTaskProgress: (progress) => set({ taskProgress: progress }),

  setResources: (items) => set({ resources: items }),

  addResource: (item) => set((s) => ({ resources: [...s.resources, item] })),

  setMessageFilter: (filter) => set({ messageFilter: filter }),

  setMessageSearchQuery: (query) => set({ messageSearchQuery: query }),

  setLoading: (loading) => set({ isLoading: loading }),

  setSending: (sending) => set({ isSending: sending }),

  setError: (error) => set({ error }),

  updateConversationTitle: (title) =>
    set((s) => ({
      conversationDetail: s.conversationDetail ? { ...s.conversationDetail, title } : null,
      conversations: s.conversations.map((c) =>
        c.id === s.activeConversationId ? { ...c, title, updatedAt: Date.now() } : c
      ),
    })),

  toggleTaskFlowCollapse: (id) =>
    set((s) => ({
      taskFlow: s.taskFlow.map((item) =>
        item.id === id ? { ...item, collapsed: !item.collapsed } : item
      ),
    })),

  pinConversation: (id) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, pinned: true, pinnedAt: Date.now() } : c
      );
      saveConversations(next);
      return { conversations: next };
    }),

  unpinConversation: (id) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, pinned: false, pinnedAt: null } : c
      );
      saveConversations(next);
      return { conversations: next };
    }),

  archiveConversation: (id) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, status: "archived" as const } : c
      );
      saveConversations(next);
      return { conversations: next };
    }),

  unarchiveConversation: (id) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, status: "active" as const } : c
      );
      saveConversations(next);
      return { conversations: next };
    }),

  deleteConversation: (id) =>
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== id);
      const nextActive = s.activeConversationId === id ? null : s.activeConversationId;
      saveConversations(next);
      saveActiveConvId(nextActive);
      return { conversations: next, activeConversationId: nextActive };
    }),

  updateConversation: (conv) =>
    set((s) => {
      const next = s.conversations.map((c) => c.id === conv.id ? { ...c, ...conv } : c);
      saveConversations(next);
      return {
        conversations: next,
        conversationDetail: s.activeConversationId === conv.id && s.conversationDetail
          ? { ...s.conversationDetail, ...(conv.title ? { title: conv.title } : {}), ...(conv.pinned !== undefined ? { pinned: conv.pinned } : {}) }
          : s.conversationDetail,
      };
    }),

  setShowArchived: (show) => set({ showArchived: show }),

  setConversationSearchQuery: (query) => set({ conversationSearchQuery: query }),

  searchConversations: (_query) => {},

  setPendingMessage: (msg) => set({ pendingMessage: msg }),

  // ═══ 全局 AI 助手 SSE（跨视图持久，切页面不中断） ═══

  sendAssistantMessage: async (text, history) => {
    const state = get();
    if (state.aiIsStreaming) return;

    // 取消之前的请求
    state.activeAiAbort?.abort();

    const controller = new AbortController();
    set({ aiIsStreaming: true, aiStreamBuffer: "", activeAiAbort: controller, isSending: true });

    const userMsg: Message = {
      id: crypto.randomUUID(), conversationId: state.activeConversationId ?? "ai-assistant",
      type: "user_message", sender: "user", content: text, mentions: [], timestamp: Date.now(),
    };

    // 即时添加用户消息
    const cid = state.activeConversationId ?? "ai-assistant";
    set((s) => {
      const existing = s.messages[cid] ?? [];
      return { messages: { ...s.messages, [cid]: [...existing, userMsg] } };
    });

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("agenthub-auth-token") : null;
      const res = await fetch(`${window.location.protocol}//${window.location.hostname}:3002/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text, history }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`请求失败 (${res.status})`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "stream" && data.msg) {
            fullText += typeof data.msg === "string" ? data.msg : JSON.stringify(data.msg);
            set({ aiStreamBuffer: fullText });
          } else if (data.type === "error") {
            fullText += `\n\n ${data.content || "未知错误"}`;
            set({ aiStreamBuffer: fullText });
          }
        } catch { /* skip malformed lines */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      }
      if (buffer.trim()) processLine(buffer);

      // 响应完成后添加助手消息
      if (fullText) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(), conversationId: cid,
          type: "agent_message", sender: "assistant", content: fullText, mentions: [], timestamp: Date.now(),
        };
        set((s) => {
          const existing = s.messages[cid] ?? [];
          return { messages: { ...s.messages, [cid]: [...existing, assistantMsg] } };
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errorMsg: Message = {
        id: crypto.randomUUID(), conversationId: cid,
        type: "system", sender: "system", content: `❌ ${(err as Error).message}`, mentions: [], timestamp: Date.now(),
      };
      set((s) => {
        const existing = s.messages[cid] ?? [];
        return { messages: { ...s.messages, [cid]: [...existing, errorMsg] } };
      });
    } finally {
      set({ aiIsStreaming: false, aiStreamBuffer: "", activeAiAbort: null, isSending: false });
    }
  },

  abortAssistantMessage: () => {
    const state = get();
    state.activeAiAbort?.abort();
    set({ aiIsStreaming: false, aiStreamBuffer: "", activeAiAbort: null, isSending: false });
  },

  addAnalysisResult: (result) => {
    set((s) => ({ analysisResults: [...s.analysisResults, { ...result, timestamp: Date.now() }] }));
  },

  addTaskAssignment: (assignment) => {
    set((s) => ({ taskAssignments: [...s.taskAssignments, assignment] }));
  },

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  clearAnalysis: () => set({ analysisResults: [], taskAssignments: [], isAnalyzing: false }),

  // Phase 1: agent coordination
  setConversationMode: (convId, mode) =>
    set((s) => ({ conversationMode: { ...s.conversationMode, [convId]: mode } })),

  setAgentTyping: (convId, agentId, isTyping) =>
    set((s) => {
      const current = s.agentTyping[convId] ?? [];
      const next = isTyping
        ? (current.includes(agentId) ? current : [...current, agentId])
        : current.filter((id) => id !== agentId);
      return { agentTyping: { ...s.agentTyping, [convId]: next } };
    }),

  setCurrentPreview: (preview) => set({ currentPreview: preview }),

  addAgentMessage: (convId, msg) =>
    set((s) => {
      const existing = s.agentMessages[convId] ?? [];
      return { agentMessages: { ...s.agentMessages, [convId]: [...existing, msg] } };
    }),

  addContextReference: (convId, ref) =>
    set((s) => {
      const existing = s.contextReferences[convId] ?? [];
      const duplicate = ref.messageId ? existing.some((item) => item.messageId === ref.messageId) : false;
      if (duplicate) return {};
      const nextRef: ContextReference = {
        ...ref,
        id: ref.id ?? crypto.randomUUID(),
        createdAt: ref.createdAt ?? Date.now(),
      };
      const contextReferences = {
        ...s.contextReferences,
        [convId]: [...existing, nextRef].slice(-50),
      };
      saveContextReferences(contextReferences);
      return { contextReferences };
    }),

  removeContextReference: (convId, refId) =>
    set((s) => {
      const contextReferences = {
        ...s.contextReferences,
        [convId]: (s.contextReferences[convId] ?? []).filter((ref) => ref.id !== refId),
      };
      saveContextReferences(contextReferences);
      return { contextReferences };
    }),

  clearContextReferences: (convId) =>
    set((s) => {
      const contextReferences = { ...s.contextReferences, [convId]: [] };
      saveContextReferences(contextReferences);
      return { contextReferences };
    }),

  undoMessage: (conversationId, messageId) => {
    set((state) => {
      const messages = state.messages[conversationId] || [];
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return state;
      
      // 保存当前状态到历史记录
      const historyEntry = {
        id: crypto.randomUUID(),
        messages: [...messages],
        timestamp: Date.now()
      };
      
      // 移除消息
      const newMessages = messages.filter(m => m.id !== messageId);
      const updatedMessages = { ...state.messages, [conversationId]: newMessages };
      
      // 异步持久化
      setTimeout(() => saveMessages(updatedMessages), 0);
      
      return {
        messages: updatedMessages,
        messageHistory: [...state.messageHistory, historyEntry]
      };
    });
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const messages = state.messages[conversationId] || [];
      const newMessages = messages.filter(m => m.id !== messageId);
      const updatedMessages = { ...state.messages, [conversationId]: newMessages };
      
      // 异步持久化
      setTimeout(() => saveMessages(updatedMessages), 0);
      
      return {
        messages: updatedMessages
      };
    });
  },
}));
