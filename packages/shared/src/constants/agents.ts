import type { AgentDefinition } from "../types/agent";

export const KNOWN_AGENTS = ["planner", "worker", "critic", "researcher", "refiner", "coder", "reviewer", "browser"] as const;
export type AgentName = (typeof KNOWN_AGENTS)[number];

export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  planner: { id: "planner", name: "Planner Agent", role: "planner", description: "任务拆解与规划", capabilities: ["task_decomposition", "dependency_analysis"], adapterType: "openai" },
  worker: { id: "worker", name: "Worker Agent", role: "worker", description: "执行具体任务步骤", capabilities: ["code_generation", "tool_use"], adapterType: "openai" },
  critic: { id: "critic", name: "Critic Agent", role: "critic", description: "质量审查与反馈", capabilities: ["quality_review", "scoring"], adapterType: "openai" },
  researcher: { id: "researcher", name: "Researcher Agent", role: "researcher", description: "信息搜索与收集", capabilities: ["web_search", "data_synthesis"], adapterType: "openai" },
  refiner: { id: "refiner", name: "Refiner Agent", role: "refiner", description: "内容润色与优化", capabilities: ["content_polish"], adapterType: "openai" },
};

export const AGENT_ROLE_LABELS: Record<string, string> = {
  planner: "规划者", worker: "执行者", critic: "审查者", researcher: "研究员", refiner: "润色师",
  coder: "程序员", reviewer: "代码审查", browser: "浏览器", frontend: "前端 Agent", backend: "后端 Agent",
  design: "设计 Agent", custom: "自定义",
};

export const AGENT_COLORS: Record<string, string> = {
  planner: "#4648d4",
  worker: "#006c49",
  critic: "#825100",
  researcher: "#2b7fff",
  refiner: "#ba1a1a",
  coder: "#4648d4",
  reviewer: "#825100",
  browser: "#2b7fff",
};

export const AGENT_CARDS = [
  { name: "planner", color: "#4648d4", desc: "任务拆解与规划" },
  { name: "worker", color: "#006c49", desc: "代码生成与工具调用" },
  { name: "critic", color: "#825100", desc: "质量审查与反馈" },
  { name: "researcher", color: "#2b7fff", desc: "信息搜索与分析" },
  { name: "refiner", color: "#ba1a1a", desc: "内容润色与优化" },
];

export const AGENT_DEFS = [
  { name: "planner", type: "planner", model: "gpt-4o-mini", tools: ["plan"], status: "online" },
  { name: "worker", type: "worker", model: "gpt-4o-mini", tools: ["code", "search", "web-fetch"], status: "online" },
  { name: "critic", type: "critic", model: "gpt-4o-mini", tools: ["review"], status: "online" },
  { name: "researcher", type: "researcher", model: "gpt-4o-mini", tools: ["search", "web-fetch"], status: "online" },
  { name: "refiner", type: "refiner", model: "gpt-4o-mini", tools: ["polish"], status: "idle" },
] as const;

export const AGENT_TEMPLATES = {
  planner: { color: "#4648d4", icon: "📋" },
  worker: { color: "#006c49", icon: "⚙️" },
  critic: { color: "#825100", icon: "🔍" },
  researcher: { color: "#2b7fff", icon: "🔎" },
  refiner: { color: "#ba1a1a", icon: "✨" },
};

export const AGENT_META = [
  { name: "PM Agent", color: "#5b4fff", status: "空闲", statusColor: "#0d9e6c", role: "项目管理" },
  { name: "Frontend Agent", color: "#2b7fff", status: "运行中", statusColor: "#0d9e6c", role: "前端开发" },
  { name: "Backend Agent", color: "#006c49", status: "运行中", statusColor: "#0d9e6c", role: "后端开发" },
  { name: "Design Agent", color: "#825100", status: "空闲", statusColor: "#0d9e6c", role: "UI/UX 设计" },
  { name: "Test Agent", color: "#ba1a1a", status: "空闲", statusColor: "#0d9e6c", role: "测试工程师" },
];
