# AgentHub 会话系统优化设计规格

## 1. 概述

在现有会话系统基础上，新增：
- 自定义 Agent 创建与管理（表单 + localStorage 持久化）
- 智能体单聊（用户自定义 Agent ↔ 用户）
- 多智能体群聊（用户 + 多个自定义 Agent + 固定主智能体）
- 主智能体（PM + Planner 能力融合，固定参与每个群聊）

## 2. 数据模型

### 2.1 新增类型

```typescript
// packages/shared/src/types/user-agent.ts

export type AgentRole = "planner" | "worker" | "critic" | "researcher" | "refiner" | "coder" | "reviewer" | "custom";

export type ModelId = "gpt-4o-mini" | "gpt-4o" | "claude-3.5-sonnet" | "qwen-max" | "deepseek-chat";

export type ToolType = "code_execution" | "web_search" | "file_read" | "file_write" | "shell" | "diff_apply" | "browser";

export interface UserAgent {
  id: string;              // uuid
  name: string;            // 用户自定义名称，如 "Python 工程师"
  avatar: string;          // emoji 或首字母，如 "🐍" / "P"
  avatarBg: string;        // 头像背景色
  role: AgentRole;         // 角色类型
  model: ModelId;          // 使用的模型
  systemPrompt: string;    // 系统提示词
  tools: ToolType[];       // 启用的工具
  createdAt: number;
  updatedAt: number;
}

// 主智能体定义（固定系统 Agent）
export const MAIN_AGENT: UserAgent = {
  id: "__main__",
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
```

### 2.2 扩展 Conversation 类型

```typescript
// packages/shared/src/types/conversation.ts (扩展)

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  type: "direct" | "group" | "task_room";
  status: "active" | "archived";
  participants: string[];          // Agent id 列表
  hasMainAgent: boolean;           // 是否包含主智能体（群聊始终为 true）
  lastMessage?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
}
```

### 2.3 UserAgent Store

```typescript
// packages/frontend/src/stores/user-agent-store.ts

interface UserAgentStore {
  agents: UserAgent[];
  addAgent: (agent: Omit<UserAgent, "id" | "createdAt" | "updatedAt">) => void;
  updateAgent: (id: string, updates: Partial<UserAgent>) => void;
  removeAgent: (id: string) => void;
  getAgent: (id: string) => UserAgent | undefined;
  hydrate: () => void;
}
```

localStorage key: `agenthub-user-agents`

## 3. 组件设计

### 3.1 新增组件

| 组件 | 文件 | 功能 |
|------|------|------|
| `CreateConversationModal` | `packages/frontend/src/features/chat/CreateConversationModal.tsx` | 新建会话模态框（选择模式 + 选择 Agent） |
| `AgentSelectList` | `packages/frontend/src/features/chat/AgentSelectList.tsx` | Agent 选择列表（复选框 + 搜索 + 分类） |
| `AgentConfigForm` | `packages/frontend/src/features/views/MyAgentsView.tsx`（内嵌） | 创建/编辑自定义 Agent 表单 |
| `AgentCard` | `packages/frontend/src/features/views/AgentCard.tsx` | Agent 卡片（列表展示 + 操作按钮） |
| `MyAgentsView` | `packages/frontend/src/features/views/MyAgentsView.tsx` | "我的智能体"页面（之前是 EmptyPlaceholder） |
| `AgentMarketView` | `packages/frontend/src/features/views/AgentMarketView.tsx` | "智能体市场"页面（之前是 EmptyPlaceholder） |
| `AgentBadge` | `packages/frontend/src/features/chat/AgentBadge.tsx` | 聊天消息中的 Agent 标识（区分系统/自定义） |

### 3.2 修改组件

| 组件 | 修改内容 |
|------|---------|
| `ConversationSidebar` | "新建任务"按钮改为弹出 `CreateConversationModal` |
| `ConversationSidebar` | 底部新增"最近会话"数据与 SidebarNav 对齐 |
| `AgentChatPanel` | 消息发送者标识增加 `AgentBadge`，区分系统/自定义 Agent |
| `SidebarNav` | "新建任务"按钮改为弹出 `CreateConversationModal` |

## 4. 交互流程

### 4.1 创建单聊

```
用户点击"新建任务" → CreateConversationModal 弹出
  → 选择"单聊"模式
  → 显示"我的智能体"列表（单选）
  → 选中 Agent → 确认
  → 创建 Conversation (type: "direct", participants: [selectedAgent.id])
  → 切换到聊天面板
```

### 4.2 创建群聊

```
用户点击"新建任务" → CreateConversationModal 弹出
  → 选择"群聊"模式（默认）
  → 显示"我的智能体"列表（多选，至少选 1 个）
  → 主智能体始终自动包含（不可取消，显示为"已固定"）
  → 选中 N 个 Agent → 确认
  → 创建 Conversation (type: "group", participants: ["__main__", id1, id2, ...])
  → 切换到聊天面板
```

### 4.3 创建自定义 Agent

```
"我的智能体"页面 → 点击"创建智能体"
  → AgentConfigForm 弹出（或页面内表单）
  → 填写：名称、头像（emoji 选择器）、角色（下拉）、模型（下拉）、系统提示词（文本域）、工具（多选）
  → 保存 → 存入 user-agent-store + localStorage
  → 刷新"我的智能体"列表
```

### 4.4 消息发送与显示

```
用户输入消息 → 点击发送
  → 消息类型: "user_message"，sender: "user"
  → 通过 WebSocket 发送到后端
  → 主智能体首先响应（协调/拆解指令）
  → 主智能体根据指令内容，分配给对应的自定义 Agent
  → 各 Agent 依次响应，消息类型: "agent_message"
  → 每条消息带 sender (Agent id) 和 AgentBadge（名称 + 头像 + 系统/自定义标识）
```

## 5. 视觉设计

### 5.1 AgentBadge 标识

| Agent 类型 | 标识 |
|-----------|------|
| 主智能体 | 🤖 名称 + 紫色标签 "主" |
| 系统 Agent | 首字母 + 对应颜色圆点 |
| 自定义 Agent | emoji/首字母 + 蓝色标签 "自定义" |

### 5.2 CreateConversationModal

```
┌─────────────────────────────────┐
│  新建任务                      │
├─────────────────────────────────┤
│  ○ 单聊  ● 群聊                 │
├─────────────────────────────────┤
│  选择智能体：                     │
│  ┌──────────────────────────┐   │
│  │ 🤖 AgentHub 助手 [主] [固定]│   │
│  │ ⬜ Python 工程师          │   │
│  │ ☑️ 前端开发助手           │   │
│  │ ️ 数据分析师            │   │
│  └──────────────────────────┘   │
│  已选 2 个智能体                  │
├─────────────────────────────────┤
│         [取消]  [创建群聊]      │
└─────────────────────────────────┘
```

## 6. 实现顺序

1. **user-agent-store** — Store 层，localStorage 持久化
2. **AgentConfigForm + MyAgentsView** — Agent 管理 UI
3. **CreateConversationModal + AgentSelectList** — 会话创建 UI
4. **AgentBadge** — 消息发送者标识
5. **ConversationSidebar 集成** — 按钮改为弹出模态框
6. **AgentChatPanel 集成** — 消息列表显示 AgentBadge
7. **SidebarNav 集成** — "新建任务"按钮改为弹出模态框
