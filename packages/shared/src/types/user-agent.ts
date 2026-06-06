import type { AgentRole } from "./agent";

export type { AgentRole };

export type ModelId = "gpt-4o-mini" | "gpt-4o" | "claude-3.5-sonnet" | "qwen-max" | "deepseek-chat" | (string & {});

export type ToolType = "code_execution" | "web_search" | "file_read" | "file_write" | "shell" | "diff_apply" | "browser";

export type AgentLLMProvider = "inherit" | "openai" | "openai-compatible" | "volc-ark" | "deepseek" | "custom" | "codex" | "claude-code";

export interface UserAgent {
  id: string;
  name: string;
  avatar: string;
  avatarBg: string;
  role: AgentRole;
  model: ModelId;
  provider?: AgentLLMProvider;
  baseURL?: string;
  cliPath?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  apiKeyHint?: string;
  systemPrompt: string;
  tools: ToolType[];
  createdAt: number;
  updatedAt: number;
}

export const MAIN_AGENT_ID = "__main__";

export const MAIN_AGENT: UserAgent = {
  id: MAIN_AGENT_ID,
  name: "AgentHub 助手",
  avatar: "",
  avatarBg: "#5b4fff",
  role: "custom",
  model: "gpt-4o",
  systemPrompt: "你是 AgentHub 的主智能体。你负责协调对话、拆解用户指令、分配任务给其他 Agent，并总结执行结果。",
  tools: ["code_execution", "web_search", "file_read", "file_write", "shell", "diff_apply"],
  createdAt: 0,
  updatedAt: 0,
};

export const MODEL_OPTIONS: { value: ModelId; label: string }[] = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "qwen-max", label: "Qwen Max" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
];

export const TOOL_OPTIONS: { value: ToolType; label: string }[] = [
  { value: "code_execution", label: "代码执行" },
  { value: "web_search", label: "网页搜索" },
  { value: "file_read", label: "文件读取" },
  { value: "file_write", label: "文件写入" },
  { value: "shell", label: "Shell 命令" },
  { value: "diff_apply", label: "Diff 应用" },
  { value: "browser", label: "浏览器" },
];

export const AVATAR_COLORS = [
  "#5b4fff", "#2b7fff", "#006c49", "#825100", "#ba1a1a",
  "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626",
];
