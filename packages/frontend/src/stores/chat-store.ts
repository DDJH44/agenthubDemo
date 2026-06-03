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

function mergeMessageLists(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  [...existing, ...incoming].forEach((message) => byId.set(message.id, message));
  return [...byId.values()]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-MAX_PERSIST_MSGS);
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
  pinned?: boolean;
  pinnedAt?: number;
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

interface ConversationTaskState {
  planSteps: string[];
  steps: StepProgress[];
  streamBuffer: string;
  isStreaming: boolean;
  taskSummary: string;
  agentSteps: AgentStepInfo[];
}

interface StreamingMessageState {
  agentId: string;
  updatedAt: number;
}

const EMPTY_TASK_STATE: ConversationTaskState = {
  planSteps: [],
  steps: [],
  streamBuffer: "",
  isStreaming: false,
  taskSummary: "",
  agentSteps: [],
};

function taskStateFor(
  states: Record<string, ConversationTaskState>,
  convId: string | null | undefined
): ConversationTaskState {
  if (!convId) return EMPTY_TASK_STATE;
  return states[convId] ?? EMPTY_TASK_STATE;
}

function syncActiveTaskFields(
  activeConversationId: string | null,
  convId: string,
  taskState: ConversationTaskState
): Partial<ChatStore> {
  if (activeConversationId !== convId) return {};
  return {
    planSteps: taskState.planSteps,
    steps: taskState.steps,
    streamBuffer: taskState.streamBuffer,
    isStreaming: taskState.isStreaming,
    taskSummary: taskState.taskSummary,
    agentSteps: taskState.agentSteps,
  };
}

function getCompletedJobIdsFromMessages(messages: Message[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const jobId = message.type === "agent_message" && typeof message.payload?.jobId === "string"
      ? message.payload.jobId
      : null;
    if (jobId) ids.add(jobId);
  }
  return [...ids];
}

function findLatestCompletedSummary(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type === "agent_message" && typeof message.payload?.jobId === "string") {
      return message.content;
    }
  }
  return "";
}

function mergeJobIds(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])].slice(-20);
}

interface ChatStore {
  connected: boolean; conversations: Conversation[]; activeConversationId: string | null;
  messages: Record<string, Message[]>; agentStates: Record<string, AgentState>;
  planSteps: string[]; steps: StepProgress[]; streamBuffer: string;
  isStreaming: boolean; taskSummary: string;
  agentSteps: AgentStepInfo[];
  conversationTasks: Record<string, ConversationTaskState>;
  streamingMessages: Record<string, Record<string, StreamingMessageState>>;
  completedJobs: Record<string, string[]>;
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
  clearConversationTyping: (convId: string) => void;
  setCurrentPreview: (preview: ChatStore["currentPreview"]) => void;
  addAgentMessage: (convId: string, msg: { agentId: string; agentName: string; agentRole: string; content: string; timestamp: number }) => void;
  addContextReference: (convId: string, ref: Omit<ContextReference, "id" | "createdAt"> & { id?: string; createdAt?: number }) => void;
  toggleContextReferencePin: (convId: string, refId: string) => void;
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
  upsertMessage: (convId: string, msg: Message) => void;
  mergeConversationHistory: (convId: string, messages: Message[]) => void;
  persistCurrentState: () => void;
  addPlan: (steps: Array<{ id: string; task: string }>) => void;
  addConversationPlan: (convId: string, steps: Array<{ id: string; task: string }>) => void;
  updateStepProgress: (idx: number, status: StepProgress["status"], result?: string) => void;
  updateStepById: (stepId: string, status: StepProgress["status"], result?: string) => void;
  updateConversationStepById: (convId: string, stepId: string, status: StepProgress["status"], result?: string) => void;
  updateAgentState: (id: string, state: Partial<AgentState>) => void;
  appendStreamChunk: (convId: string, messageId: string, chunk: string, agentId?: string, jobId?: string) => void;
  addAgentStep: (step: AgentStepInfo) => void;
  addConversationAgentStep: (convId: string, step: AgentStepInfo) => void;
  clearAgentSteps: () => void;
  setTaskSummary: (summary: string) => void;
  setConversationTaskSummary: (convId: string, summary: string, jobId?: string) => void;
  setStreaming: (v: boolean) => void;
  setConversationStreaming: (convId: string, v: boolean) => void;
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
  conversationTasks: {},
  streamingMessages: {},
  completedJobs: {},
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
    const nextTaskState = taskStateFor(get().conversationTasks, id);
    saveActiveConvId(id);
    set({ 
      activeConversationId: id, 
      agentStates: {},
      planSteps: nextTaskState.planSteps,
      steps: nextTaskState.steps,
      streamBuffer: nextTaskState.streamBuffer,
      isStreaming: nextTaskState.isStreaming,
      taskSummary: nextTaskState.taskSummary,
      agentSteps: nextTaskState.agentSteps,
      resources: [], conversationDetail: null, taskFlow: [], sessionAgentStatuses: [], taskProgress: null,
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
      saveConversations(conversations);
      // 异步持久化
      setTimeout(() => saveMessages(newMessages), 0);
      return { messages: newMessages, conversations };
    }),

  upsertMessage: (convId, msg) =>
    set((s) => {
      const existing = s.messages[convId] ?? [];
      const messageIndex = existing.findIndex((message) => message.id === msg.id);
      const updated = messageIndex >= 0
        ? existing.map((message, index) => (index === messageIndex ? { ...message, ...msg } : message))
        : [...existing, msg].slice(-500);
      const conversations = s.conversations.map((conversation) =>
        conversation.id === convId
          ? { ...conversation, lastMessage: msg.content.slice(0, 80), lastMessageAt: msg.timestamp, updatedAt: msg.timestamp }
          : conversation
      );
      const newMessages = { ...s.messages, [convId]: updated };
      saveConversations(conversations);
      setTimeout(() => saveMessages(newMessages), 0);
      return { messages: newMessages, conversations };
    }),

  mergeConversationHistory: (convId, messages) =>
    set((s) => {
      const existing = s.messages[convId] ?? [];
      const merged = messages.length === 0 && existing.length > 0
        ? existing
        : mergeMessageLists(existing, messages);
      const nextMessages = { ...s.messages, [convId]: merged };
      const completedJobIds = getCompletedJobIdsFromMessages(merged);
      saveMessages(nextMessages);
      if (completedJobIds.length > 0) {
        const previousTaskState = taskStateFor(s.conversationTasks, convId);
        const nextTaskState: ConversationTaskState = {
          ...previousTaskState,
          taskSummary: previousTaskState.taskSummary || findLatestCompletedSummary(merged),
          isStreaming: false,
          streamBuffer: "",
        };
        return {
          messages: nextMessages,
          conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
          streamingMessages: { ...s.streamingMessages, [convId]: {} },
          completedJobs: {
            ...s.completedJobs,
            [convId]: mergeJobIds(s.completedJobs[convId] ?? [], completedJobIds),
          },
          agentTyping: { ...s.agentTyping, [convId]: [] },
          ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
        };
      }
      return { messages: nextMessages };
    }),

  persistCurrentState: () => {
    const state = get();
    saveConversations(state.conversations);
    saveMessages(state.messages);
    saveActiveConvId(state.activeConversationId);
  },

  addPlan: (plan_steps) => {
    const convId = get().activeConversationId;
    if (convId) {
      get().addConversationPlan(convId, plan_steps);
      return;
    }
    set({
      planSteps: plan_steps.map((p) => p.task),
      steps: plan_steps.map((p, i) => ({ id: p.id, index: i, total: plan_steps.length, step: p.task, status: "pending" as const })),
    });
  },

  addConversationPlan: (convId, plan_steps) =>
    set((s) => {
      const previous = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = {
        ...previous,
        isStreaming: true,
        taskSummary: "",
        planSteps: plan_steps.map((p) => p.task),
        steps: plan_steps.map((p, i) => ({ id: p.id, index: i, total: plan_steps.length, step: p.task, status: "pending" as const })),
      };
      return {
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    }),

  updateStepProgress: (idx, status, result) =>
    set((s) => ({ steps: s.steps.map((st, i) => (i === idx ? { ...st, status, ...(result ? { result } : {}) } : st)) })),

  updateStepById: (stepId, status, result) =>
    set((s) => ({
      steps: s.steps.map((st) => (st.id === stepId ? { ...st, status, result: result ?? st.result } : st)),
    })),

  updateConversationStepById: (convId, stepId, status, result) =>
    set((s) => {
      const previous = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = {
        ...previous,
        steps: previous.steps.map((st) => (st.id === stepId ? { ...st, status, result: result ?? st.result } : st)),
      };
      return {
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    }),

  updateAgentState: (id, state) =>
    set((s) => {
      const next = { ...s.agentStates, [id]: { ...(s.agentStates[id] ?? { id, role: "worker" as const, status: "idle" as const, output: "", logs: [] }), ...state } };
      saveAgentStates(next);
      return { agentStates: next };
    }),

  appendStreamChunk: (convId, messageId, chunk, agentId = "assistant", jobId) => {
    if (!convId || !messageId || !chunk) return;
    set((s) => {
      const completedForConversation = s.completedJobs[convId] ?? [];
      const isCompletedJob = jobId
        ? completedForConversation.includes(jobId)
        : completedForConversation.some((completedJobId) => messageId.startsWith(`${completedJobId}-`));
      if (isCompletedJob) return {};

      const existing = s.messages[convId] ?? [];
      const messageIndex = existing.findIndex((message) => message.id === messageId);
      const now = Date.now();
      let nextMessagesForConversation: Message[];
      if (messageIndex >= 0) {
        const current = existing[messageIndex];
        const nextContent = current.content === chunk ? current.content : `${current.content}${chunk}`;
        nextMessagesForConversation = existing.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                content: nextContent,
                timestamp: now,
                payload: { ...(message.payload ?? {}), streaming: true, streamMessageId: messageId },
              }
            : message
        );
      } else {
        const streamMessage: Message = {
          id: messageId,
          conversationId: convId,
          type: "agent_message",
          sender: agentId,
          senderId: agentId,
          content: chunk,
          mentions: [],
          payload: { streaming: true, streamMessageId: messageId },
          timestamp: now,
        };
        nextMessagesForConversation = [...existing, streamMessage].slice(-500);
      }

      const nextMessages = { ...s.messages, [convId]: nextMessagesForConversation };
      const previousTaskState = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = {
        ...previousTaskState,
        streamBuffer: `${previousTaskState.streamBuffer}${chunk}`,
        isStreaming: true,
      };
      const nextStreaming = {
        ...(s.streamingMessages[convId] ?? {}),
        [messageId]: { agentId, updatedAt: now },
      };
      const conversations = s.conversations.map((conversation) =>
        conversation.id === convId
          ? { ...conversation, lastMessage: chunk.slice(0, 80), lastMessageAt: now, updatedAt: now }
          : conversation
      );

      setTimeout(() => saveMessages(nextMessages), 0);
      saveConversations(conversations);
      return {
        messages: nextMessages,
        conversations,
        streamingMessages: { ...s.streamingMessages, [convId]: nextStreaming },
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    });
  },

  addAgentStep: (step) => set((s) => ({ agentSteps: [...s.agentSteps, step] })),

  addConversationAgentStep: (convId, step) =>
    set((s) => {
      const previous = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = {
        ...previous,
        isStreaming: true,
        agentSteps: [...previous.agentSteps, step],
      };
      return {
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    }),

  clearAgentSteps: () => set({ agentSteps: [] }),

  setTaskSummary: (summary) => {
    const convId = get().activeConversationId;
    if (convId) {
      get().setConversationTaskSummary(convId, summary);
      return;
    }
    _streamAccumulator = "";
    if (_streamRafId) { cancelAnimationFrame(_streamRafId); _streamRafId = null; }
    const state = get();
    const legacyConvId = state.activeConversationId;
    if (legacyConvId && state.streamBuffer && state.streamBuffer.trim().length > 0) {
      const existing = state.messages[legacyConvId] ?? [];
      const alreadyHasSummary = existing.some(m => m.type === "agent_message" && m.sender === "refiner");
      if (!alreadyHasSummary) {
        const streamMsg: Message = {
          id: crypto.randomUUID(),
          conversationId: legacyConvId,
          type: "agent_message",
          sender: "assistant",
          content: state.streamBuffer,
          mentions: [],
          timestamp: Date.now(),
        };
        const newMessages = { ...state.messages, [legacyConvId]: [...existing, streamMsg] };
        setTimeout(() => saveMessages(newMessages), 0);
        set({ taskSummary: summary, isStreaming: false, streamBuffer: "", messages: newMessages });
        return;
      }
    }
    set({ taskSummary: summary, isStreaming: false, streamBuffer: "" });
  },

  setConversationTaskSummary: (convId, summary, jobId) =>
    set((s) => {
      const previous = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = {
        ...previous,
        taskSummary: summary,
        isStreaming: false,
        streamBuffer: "",
      };
      const updatedMessages = (s.messages[convId] ?? []).map((message) => {
        const isStreamingMessage = Boolean((s.streamingMessages[convId] ?? {})[message.id]);
        if (!isStreamingMessage) return message;
        return {
          ...message,
          payload: { ...(message.payload ?? {}), streaming: false },
        };
      });
      const nextMessages = { ...s.messages, [convId]: updatedMessages };
      const completedForConversation = s.completedJobs[convId] ?? [];
      const nextCompletedJobs = jobId && !completedForConversation.includes(jobId)
        ? { ...s.completedJobs, [convId]: [...completedForConversation, jobId].slice(-20) }
        : s.completedJobs;
      setTimeout(() => saveMessages(nextMessages), 0);
      return {
        messages: nextMessages,
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        streamingMessages: { ...s.streamingMessages, [convId]: {} },
        completedJobs: nextCompletedJobs,
        agentTyping: { ...s.agentTyping, [convId]: [] },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    }),

  setStreaming: (v) => {
    const convId = get().activeConversationId;
    if (convId) {
      get().setConversationStreaming(convId, v);
      return;
    }
    set({ isStreaming: v });
  },

  setConversationStreaming: (convId, v) =>
    set((s) => {
      const previous = taskStateFor(s.conversationTasks, convId);
      const nextTaskState: ConversationTaskState = { ...previous, isStreaming: v };
      return {
        conversationTasks: { ...s.conversationTasks, [convId]: nextTaskState },
        ...syncActiveTaskFields(s.activeConversationId, convId, nextTaskState),
      };
    }),

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

  clearConversationTyping: (convId) =>
    set((s) => ({ agentTyping: { ...s.agentTyping, [convId]: [] } })),

  setCurrentPreview: (preview) => set({ currentPreview: preview }),

  addAgentMessage: (convId, msg) =>
    set((s) => {
      const existing = s.agentMessages[convId] ?? [];
      return { agentMessages: { ...s.agentMessages, [convId]: [...existing, msg] } };
    }),

  addContextReference: (convId, ref) =>
    set((s) => {
      const existing = s.contextReferences[convId] ?? [];
      const duplicate = ref.messageId ? existing.find((item) => item.messageId === ref.messageId) : null;
      if (duplicate) {
        const contextReferences = {
          ...s.contextReferences,
          [convId]: existing.map((item) =>
            item.id === duplicate.id
              ? {
                  ...item,
                  pinned: ref.pinned ?? item.pinned,
                  pinnedAt: ref.pinned ? (ref.pinnedAt ?? Date.now()) : item.pinnedAt,
                  title: ref.pinned ? ref.title : item.title,
                  sourceType: ref.pinned ? ref.sourceType : item.sourceType,
                }
              : item
          ),
        };
        saveContextReferences(contextReferences);
        return { contextReferences };
      }
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

  toggleContextReferencePin: (convId, refId) =>
    set((s) => {
      const contextReferences = {
        ...s.contextReferences,
        [convId]: (s.contextReferences[convId] ?? []).map((ref) => {
          if (ref.id !== refId) return ref;
          const pinned = !ref.pinned;
          return { ...ref, pinned, pinnedAt: pinned ? Date.now() : undefined };
        }),
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
