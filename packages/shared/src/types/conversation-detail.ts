/** 会话详情页扩展类型 — 用于会话页面丰富的交互功能 */

import type { AgentRole } from "./agent";

/** 会话运行状态 */
export type SessionStatus = "active" | "paused" | "terminated" | "completed";

/** 任务优先级 */
export type TaskPriority = "high" | "medium" | "low";

/** 协作流程中单个 Agent 任务项的状态 */
export type TaskFlowStatus = "done" | "running" | "waiting";

/** 协作流程任务项 */
export interface TaskFlowItem {
  id: string;
  agentId: string;
  agentRole: AgentRole;
  agentName: string;
  taskName: string;
  taskDescription: string;
  status: TaskFlowStatus;
  progress: number;          /** 0–100，仅 running 状态有效 */
  timestamp: number;
  estimatedDuration?: number; /** 预计耗时（分钟），用于倒计时 */
  canCollapse?: boolean;
  collapsed?: boolean;
  subTasks?: string[];       /** 展开后显示的任务子项 */
}

/** Agent 在会话中的实时状态 */
export interface SessionAgentStatus {
  agentId: string;
  agentRole: AgentRole;
  agentName: string;
  status: "running" | "waiting" | "done";
  progress?: number;         /** 0–100，仅 running 状态有效 */
}

/** 总体任务进度 */
export interface TaskProgress {
  completed: number;
  inProgress: number;
  waiting: number;
  total: number;
  percentage: number;
  estimatedRemaining?: string; /** 如 "1天6小时" */
}

/** 文件资源项 */
export interface ResourceItem {
  id: string;
  name: string;
  type: "doc" | "pdf" | "image" | "code" | "diagram" | "other";
  size: string;
  url?: string;
  createdAt: number;
}

/** 会话成员 */
export interface Member {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  avatar?: string;
}

/** 会话详情完整结构 */
export interface ConversationDetail {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: SessionStatus;
  estimatedDuration?: number;   /** 预计总耗时（天） */
  createdAt: number;
  createdBy: string;
  participants: Member[];
  agentCount: number;
  taskFlow: TaskFlowItem[];
  agentStatuses: SessionAgentStatus[];
  progress: TaskProgress;
  resources: ResourceItem[];
}

/** 消息附件（嵌入消息中的文件卡片） */
export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: string;
  icon?: string;
}
