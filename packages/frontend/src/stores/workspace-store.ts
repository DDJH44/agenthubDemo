import { create } from "zustand";
import type { PlanNode, StepResult, Artifact } from "@agenthub/shared";

const WS_KEY_PREFIX = "agenthub-ws-";

interface WorkspaceData {
  plan: PlanNode[];
  stepResults: StepResult[];
  artifacts: Artifact[];
  dagNodes: Array<{ id: string; task: string; dependsOn: string[]; status: string }>;
  deployStatus: string | null;
  deployUrl: string | null;
  deployProgress: number | null;
  deployProvider: string | null;
  deployLogs: string[];
  deployError: string | null;
  activeArtifactTopicId: string | null;
}

interface WorkspaceStore extends WorkspaceData {
  activeConvId: string | null;
  setActiveArtifactTopic: (topicId: string | null) => void;
  setPlan: (plan: PlanNode[]) => void;
  updateNodeStatus: (nodeId: string, status: string) => void;
  addStepResult: (result: StepResult) => void;
  addArtifact: (artifact: Artifact) => void;
  createArtifactVersion: (artifactId: string, content: string, options?: {
    createdBy?: string;
    changeSummary?: string;
    metadata?: Record<string, unknown>;
  }) => Artifact | null;
  setDeployStatus: (status: string, url?: string, meta?: {
    progress?: number;
    providerId?: string;
    logs?: string[];
    error?: string | null;
  }) => void;
  clearWorkspace: () => void;
  switchConversation: (convId: string | null) => void;
}

const MAX_RESULTS = 100;
const EMPTY: WorkspaceData = {
  plan: [],
  stepResults: [],
  artifacts: [],
  dagNodes: [],
  deployStatus: null,
  deployUrl: null,
  deployProgress: null,
  deployProvider: null,
  deployLogs: [],
  deployError: null,
  activeArtifactTopicId: null,
};

function loadConvWorkspace(convId: string): WorkspaceData {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(WS_KEY_PREFIX + convId);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    return {
      plan: data.plan ?? [],
      stepResults: data.stepResults ?? [],
      artifacts: data.artifacts ?? [],
      dagNodes: data.dagNodes ?? [],
      deployStatus: data.deployStatus ?? null,
      deployUrl: data.deployUrl ?? null,
      deployProgress: data.deployProgress ?? null,
      deployProvider: data.deployProvider ?? null,
      deployLogs: data.deployLogs ?? [],
      deployError: data.deployError ?? null,
      activeArtifactTopicId: data.activeArtifactTopicId ?? null,
    };
  } catch { return EMPTY; }
}

function saveConvWorkspace(convId: string, data: WorkspaceData) {
  if (typeof window === "undefined" || !convId) return;
  try {
    const toSave = {
      plan: data.plan ?? [],
      stepResults: (data.stepResults ?? []).slice(-MAX_RESULTS),
      artifacts: (data.artifacts ?? []).slice(-MAX_RESULTS),
      dagNodes: data.dagNodes ?? [],
      deployStatus: data.deployStatus ?? null,
      deployUrl: data.deployUrl ?? null,
      deployProgress: data.deployProgress ?? null,
      deployProvider: data.deployProvider ?? null,
      deployLogs: (data.deployLogs ?? []).slice(-30),
      deployError: data.deployError ?? null,
      activeArtifactTopicId: data.activeArtifactTopicId ?? null,
    };
    localStorage.setItem(WS_KEY_PREFIX + convId, JSON.stringify(toSave));
  } catch { /* quota exceeded */ }
}

function removeConvWorkspace(convId: string) {
  if (typeof window === "undefined" || !convId) return;
  try { localStorage.removeItem(WS_KEY_PREFIX + convId); } catch { /* */ }
}

function rootArtifactId(artifact: Artifact) {
  return artifact.parentId ?? artifact.id;
}

function nextArtifactVersion(artifacts: Artifact[], rootId: string) {
  const versions = artifacts
    .filter((artifact) => artifact.id === rootId || artifact.parentId === rootId)
    .map((artifact) => artifact.version ?? 1);
  return Math.max(0, ...versions) + 1;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  ...EMPTY,
  activeConvId: null,

  switchConversation: (convId) => {
    const state = get();
    if (state.activeConvId) {
      saveConvWorkspace(state.activeConvId, {
        plan: state.plan, stepResults: state.stepResults, artifacts: state.artifacts,
        dagNodes: state.dagNodes, deployStatus: state.deployStatus, deployUrl: state.deployUrl,
        deployProgress: state.deployProgress, deployProvider: state.deployProvider,
        deployLogs: state.deployLogs, deployError: state.deployError,
        activeArtifactTopicId: state.activeArtifactTopicId,
      });
    }
    if (convId) {
      const loaded = loadConvWorkspace(convId);
      set({ activeConvId: convId, ...loaded });
    } else {
      set({ activeConvId: null, ...EMPTY });
    }
  },

  setActiveArtifactTopic: (topicId) => set((s) => {
    if (s.activeArtifactTopicId === topicId) return {};
    const next = { activeArtifactTopicId: topicId };
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, ...next });
    return next;
  }),

  setPlan: (plan) => set((s) => {
    const dagNodes = plan.map((p) => {
      const existing = s.dagNodes.find((n) => n.id === p.id);
      return { id: p.id, task: p.task, dependsOn: p.dependsOn, status: existing?.status ?? "pending" };
    });
    const next = { plan, dagNodes };
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, ...next });
    return next;
  }),

  updateNodeStatus: (nodeId, status) => set((s) => {
    const dagNodes = s.dagNodes.map((n) => n.id === nodeId ? { ...n, status } : n);
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, dagNodes });
    return { dagNodes };
  }),

  addStepResult: (result) => set((s) => {
    if (s.stepResults.some((r) => r.id === result.id)) return {};
    const stepResults = s.stepResults.length >= MAX_RESULTS ? [...s.stepResults.slice(-MAX_RESULTS + 1), result] : [...s.stepResults, result];
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, stepResults });
    return { stepResults };
  }),

  addArtifact: (artifact) => set((s) => {
    if (s.artifacts.some((a) => a.id === artifact.id)) return {};
    const artifacts = s.artifacts.length >= MAX_RESULTS ? [...s.artifacts.slice(-MAX_RESULTS + 1), artifact] : [...s.artifacts, artifact];
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, artifacts });
    return { artifacts };
  }),

  createArtifactVersion: (artifactId, content, options) => {
    let created: Artifact | null = null;
    set((s) => {
      const source = s.artifacts.find((artifact) => artifact.id === artifactId);
      if (!source) return {};
      const rootId = rootArtifactId(source);
      const version = nextArtifactVersion(s.artifacts, rootId);
      const createdAt = Date.now();
      created = {
        ...source,
        id: `${rootId}-v${version}-${createdAt}`,
        content,
        version,
        parentId: rootId,
        createdAt,
        createdBy: options?.createdBy ?? "User",
        metadata: {
          ...(source.metadata ?? {}),
          ...(options?.metadata ?? {}),
          changeSummary: options?.changeSummary ?? "手动保存版本",
          sourceArtifactId: source.id,
        },
      };
      const artifacts = s.artifacts.length >= MAX_RESULTS ? [...s.artifacts.slice(-MAX_RESULTS + 1), created] : [...s.artifacts, created];
      if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, artifacts });
      return { artifacts };
    });
    return created;
  },

  setDeployStatus: (status, url, meta) => set((s) => {
    const deployUrl = url ?? (status === "deploying" ? s.deployUrl : null);
    const deployLogs = meta?.logs?.length ? [...s.deployLogs, ...meta.logs].slice(-30) : s.deployLogs;
    const next = {
      deployStatus: status,
      deployUrl,
      deployProgress: meta?.progress ?? (status === "success" || status === "completed" || status === "done" || status === "failed" ? 100 : s.deployProgress),
      deployProvider: meta?.providerId ?? s.deployProvider,
      deployLogs,
      deployError: meta?.error === undefined ? (status === "failed" ? s.deployError : null) : meta.error,
    };
    if (s.activeConvId) saveConvWorkspace(s.activeConvId, { ...s, ...next });
    return next;
  }),

  clearWorkspace: () => {
    const state = get();
    if (state.activeConvId) removeConvWorkspace(state.activeConvId);
    set(EMPTY);
  },
}));
