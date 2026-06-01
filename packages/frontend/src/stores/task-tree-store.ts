import { create } from "zustand";
import type { Artifact, StepResult, PlanNode } from "@agenthub/shared";

export interface TaskNode {
  id: string;
  title: string;
  type: "project" | "task" | "file" | "step";
  status: "pending" | "running" | "done" | "failed";
  agentRole?: string;
  children: TaskNode[];
  artifactId?: string;
  content?: string;
  filename?: string;
  lang?: string;
  timestamp: number;
}

interface TaskTreeState {
  trees: Record<string, TaskNode>;
  expandedNodes: Set<string>;
  selectedNodeId: string | null;
  activeConvId: string | null;
}

interface TaskTreeActions {
  toggleExpand: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  switchConversation: (convId: string | null) => void;
  buildFromPlan: (plan: PlanNode[]) => void;
  updateStepStatus: (stepId: string, status: TaskNode["status"]) => void;
  addStepResult: (result: StepResult) => void;
  addArtifact: (artifact: Artifact) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  getSelectedNode: () => TaskNode | null;
  clearTree: () => void;
}

function generateSmartTitle(content: string, type: string, filename?: string): string {
  if (filename && filename !== type) return filename;

  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 60) {
    const cleaned = firstLine.replace(/^[#*\-`>\s]+/, "").replace(/`/g, "");
    if (cleaned.length > 0) return cleaned;
  }

  const codeBlockMatch = content.match(/```(\w+)\n/);
  if (codeBlockMatch) {
    const lang = codeBlockMatch[1];
    const langNames: Record<string, string> = {
      html: "HTML页面", css: "样式文件", js: "JavaScript", javascript: "JavaScript",
      ts: "TypeScript", typescript: "TypeScript", tsx: "React组件", jsx: "React组件",
      json: "JSON配置", py: "Python脚本", python: "Python脚本",
    };
    return langNames[lang] ?? `${lang}代码`;
  }

  if (content.includes("<!DOCTYPE") || content.includes("<html")) return "HTML页面";
  if (content.includes("import React") || content.includes("export default")) return "React组件";
  if (content.includes("function ") || content.includes("const ")) return "代码模块";

  const typeNames: Record<string, string> = {
    code: "代码文件", html: "HTML页面", json: "JSON配置",
    document: "文档", markdown: "Markdown文档", slides: "演示文稿",
  };
  return typeNames[type] ?? "生成内容";
}

function extractFileNodesFromContent(content: string, parentId: string): TaskNode[] {
  const nodes: TaskNode[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1]?.toLowerCase() ?? "";
    const code = match[2];
    if (code.trim().length < 10) continue;

    const extMap: Record<string, string> = {
      html: "html", css: "css", js: "js", javascript: "js",
      ts: "ts", typescript: "ts", tsx: "tsx", jsx: "jsx",
      json: "json", py: "py", python: "py",
    };
    const ext = extMap[lang] || lang || "txt";
    const filename = `file-${idx + 1}.${ext}`;

    nodes.push({
      id: `${parentId}-file-${idx}`,
      title: filename,
      type: "file",
      status: "done",
      content: code,
      filename,
      lang,
      children: [],
      timestamp: Date.now(),
    });
    idx++;
  }

  return nodes;
}

const STORAGE_KEY = "agenthub-task-tree-";

function loadTree(convId: string): TaskNode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY + convId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveTree(convId: string, tree: TaskNode) {
  if (typeof window === "undefined" || !convId) return;
  try {
    const toSave = JSON.parse(JSON.stringify(tree));
    const stripContent = (node: TaskNode) => {
      if (node.type === "file") {
        if (node.artifactId) {
          node.content = undefined;
        } else if (node.content && node.content.length > 2000) {
          node.content = node.content.slice(0, 2000);
        }
      }
      node.children.forEach(stripContent);
    };
    stripContent(toSave);
    localStorage.setItem(STORAGE_KEY + convId, JSON.stringify(toSave));
  } catch { /* quota */ }
}

function removeTree(convId: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY + convId); } catch {}
}

export const useTaskTreeStore = create<TaskTreeState & TaskTreeActions>((set, get) => ({
  trees: {},
  expandedNodes: new Set<string>(),
  selectedNodeId: null,
  activeConvId: null,

  toggleExpand: (nodeId) => set((s) => {
    const next = new Set(s.expandedNodes);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return { expandedNodes: next };
  }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  switchConversation: (convId) => {
    const state = get();
    if (state.activeConvId && state.trees[state.activeConvId]) {
      saveTree(state.activeConvId, state.trees[state.activeConvId]);
    }
    if (convId) {
      const existing = state.trees[convId] ?? loadTree(convId);
      set({ activeConvId: convId, trees: { ...state.trees, [convId]: existing ?? createEmptyProject(convId) } });
    } else {
      set({ activeConvId: null });
    }
  },

  buildFromPlan: (plan) => set((s) => {
    const convId = s.activeConvId;
    if (!convId) return {};
    const existing = s.trees[convId];
    const root = existing ?? createEmptyProject(convId);

    const taskChildren: TaskNode[] = plan.map((step) => {
      const existingTask = findNodeById(root, step.id);
      return {
        id: step.id,
        title: step.task,
        type: "task" as const,
        status: existingTask?.status ?? ("pending" as const),
        agentRole: step.agentRole,
        children: existingTask?.children ?? [],
        timestamp: existingTask?.timestamp ?? Date.now(),
      };
    });

    const newRoot: TaskNode = { ...root, children: taskChildren };
    const autoExpand = new Set(s.expandedNodes);
    autoExpand.add(root.id);
    taskChildren.forEach(t => autoExpand.add(t.id));

    saveTree(convId, newRoot);
    return { trees: { ...s.trees, [convId]: newRoot }, expandedNodes: autoExpand };
  }),

  updateStepStatus: (stepId, status) => set((s) => {
    const convId = s.activeConvId;
    if (!convId || !s.trees[convId]) return {};
    const root = JSON.parse(JSON.stringify(s.trees[convId])) as TaskNode;
    const node = findNodeById(root, stepId);
    if (node) {
      node.status = status;
      if (status === "done") {
        const autoExpand = new Set(s.expandedNodes);
        autoExpand.add(stepId);
        saveTree(convId, root);
        return { trees: { ...s.trees, [convId]: root }, expandedNodes: autoExpand };
      }
    }
    saveTree(convId, root);
    return { trees: { ...s.trees, [convId]: root } };
  }),

  addStepResult: (result) => set((s) => {
    const convId = s.activeConvId;
    if (!convId || !s.trees[convId]) return {};
    const root = JSON.parse(JSON.stringify(s.trees[convId])) as TaskNode;
    const taskNode = findNodeById(root, result.id);
    if (!taskNode) {
      const newTask: TaskNode = {
        id: result.id,
        title: result.task,
        type: "task",
        status: "done",
        children: [],
        timestamp: Date.now(),
      };
      const fileNodes = extractFileNodesFromContent(result.result, result.id);
      newTask.children = fileNodes;
      newTask.status = "done";
      root.children.push(newTask);
    } else {
      taskNode.status = "done";
      const fileNodes = extractFileNodesFromContent(result.result, result.id);
      if (fileNodes.length > 0) {
        taskNode.children = [...taskNode.children.filter(c => c.type !== "file"), ...fileNodes];
      }
    }
    saveTree(convId, root);
    return { trees: { ...s.trees, [convId]: root } };
  }),

  addArtifact: (artifact) => set((s) => {
    const convId = s.activeConvId;
    if (!convId || !s.trees[convId]) return {};
    const root = JSON.parse(JSON.stringify(s.trees[convId])) as TaskNode;

    const existingFile = findNodeByArtifactId(root, artifact.id);
    if (existingFile) return {};

    const title = generateSmartTitle(artifact.content || "", artifact.type, artifact.filename);
    const fileNode: TaskNode = {
      id: `artifact-${artifact.id}`,
      title,
      type: "file",
      status: "done",
      artifactId: artifact.id,
      content: artifact.content,
      filename: artifact.filename,
      lang: artifact.filename?.split(".").pop()?.toLowerCase() ?? artifact.type,
      children: [],
      timestamp: Date.now(),
    };

    let placed = false;
    for (const taskNode of root.children) {
      if (taskNode.agentRole === "worker" || taskNode.children.length > 0) {
        if (!taskNode.children.some(c => c.artifactId === artifact.id)) {
          taskNode.children.push(fileNode);
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const autoTask: TaskNode = {
        id: `auto-${artifact.id}`,
        title: generateSmartTitle(artifact.content || "", artifact.type),
        type: "task",
        status: "done",
        agentRole: "worker",
        children: [fileNode],
        timestamp: Date.now(),
      };
      root.children.push(autoTask);
      const autoExpand = new Set(s.expandedNodes);
      autoExpand.add(autoTask.id);
      saveTree(convId, root);
      return { trees: { ...s.trees, [convId]: root }, expandedNodes: autoExpand };
    }

    saveTree(convId, root);
    return { trees: { ...s.trees, [convId]: root } };
  }),

  getSelectedNode: () => {
    const state = get();
    if (!state.selectedNodeId || !state.activeConvId) return null;
    const root = state.trees[state.activeConvId];
    if (!root) return null;
    return findNodeById(root, state.selectedNodeId);
  },

  updateNodeContent: (nodeId, content) => set((s) => {
    const convId = s.activeConvId;
    if (!convId || !s.trees[convId]) return {};
    const root = JSON.parse(JSON.stringify(s.trees[convId])) as TaskNode;
    const node = findNodeById(root, nodeId);
    if (node) {
      node.content = content;
    }
    saveTree(convId, root);
    return { trees: { ...s.trees, [convId]: root } };
  }),

  clearTree: () => {
    const state = get();
    if (state.activeConvId) removeTree(state.activeConvId);
    set((s) => {
      const next = { ...s.trees };
      if (s.activeConvId) delete next[s.activeConvId];
      return { trees: next, selectedNodeId: null };
    });
  },
}));

function createEmptyProject(convId: string): TaskNode {
  return {
    id: `project-${convId}`,
    title: "项目结构",
    type: "project",
    status: "pending",
    children: [],
    timestamp: Date.now(),
  };
}

function findNodeById(root: TaskNode, id: string): TaskNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function findNodeByArtifactId(root: TaskNode, artifactId: string): TaskNode | null {
  if (root.artifactId === artifactId) return root;
  for (const child of root.children) {
    const found = findNodeByArtifactId(child, artifactId);
    if (found) return found;
  }
  return null;
}
