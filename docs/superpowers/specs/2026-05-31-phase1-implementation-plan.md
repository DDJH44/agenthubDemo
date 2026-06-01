# 第一阶段实施计划：交互体验 + 产物预览

> 基于 [2026-05-31-agenthub-full-refactor-design.md](./2026-05-31-agenthub-full-refactor-design.md)
> 执行顺序：从上到下，每个模块完成后再进入下一模块

---

## 模块 A：WS 协议类型定义

### 文件：`packages/shared/src/types/ws.ts`

### A1. 新增 WSClientMessage 类型

在现有联合类型末尾追加：

| 类型 | payload | 说明 |
|------|---------|------|
| `agent:assign` | `{ conversationId, agentId, content }` | 指定 Agent 执行任务 |
| `agent:cancel` | `{ conversationId, agentId }` | 取消 Agent 任务 |
| `artifact:update` | `{ conversationId, artifactId, content }` | 前端编辑产物回传 |
| `artifact:deploy` | `{ conversationId, artifactId, providerId, config? }` | 触发部署 |
| `conversation:mode` | `{ conversationId, mode: "single" \| "group" }` | 切换会话模式 |

### A2. 新增 WSServerMessage 类型

| 类型 | payload | 说明 |
|------|---------|------|
| `agent:message` | `{ conversationId, agentId, agentName, agentRole, content, artifacts?, timestamp }` | 单 Agent 消息 |
| `agent:broadcast` | `{ conversationId, fromAgentId, toAgentIds?, content, context?, timestamp }` | Agent 群聊广播 |
| `agent:typing` | `{ conversationId, agentId, agentName }` | Agent 正在输入 |
| `agent:joined` | `{ conversationId, agentId, agentName, agentRole }` | Agent 加入会话 |
| `agent:left` | `{ conversationId, agentId }` | Agent 离开会话 |
| `artifact:updated` | `{ conversationId, artifact: Artifact }` | 产物被更新 |
| `artifact:version` | `{ conversationId, artifactId, versions: VersionEntry[] }` | 版本快照 |
| `deploy:progress` | `{ deployId, status, progress, logs }` | 部署进度 |
| `deploy:completed` | `{ deployId, url, providerId }` | 部署完成 |
| `deploy:failed` | `{ deployId, error, providerId }` | 部署失败 |

### A3. 扩展 Artifact 类型

```typescript
interface Artifact {
  // 现有字段...
  type: "html" | "code" | "document" | "slides" | "image";  // 扩展类型
  version: number;        // 新增
  parentId?: string;      // 新增
  metadata?: {            // 新增
    language?: string;
    framework?: string;
    pageCount?: number;
  };
}
```

### ✅ 验证：`npx tsc --noEmit --project packages/shared/tsconfig.json`

---

## 模块 B：服务端 WS 网关

### 文件：`packages/server/src/ws/gateway.ts`

### B1. 新增消息处理分支

| case | 处理逻辑 |
|------|---------|
| `agent:assign` | 解析 content，匹配目标 Agent，发送 `agent:message` 并触发编排器 |
| `agent:cancel` | 取消编排器中该 Agent 的任务 |
| `artifact:update` | 接收前端编辑产物，存为新版本，广播 `artifact:updated` |
| `artifact:deploy` | 触发 DeployManager，根据 providerId 调用对应 Provider |
| `conversation:mode` | 更新 DB 中会话 mode 字段，广播 `conversation:updated` |
| `message:send` (扩展) | 群聊模式下解析 @mention，定向路由给目标 Agent 或广播 |

### B2. 编排器回调扩展

在编排器回调中新增以下广播：

| 事件时机 | 广播类型 |
|---------|---------|
| Agent 开始处理 | `agent:typing` |
| Agent 完成输出 | `agent:message` |
| Agent 间通信 | `agent:broadcast` |
| 产物更新 | `artifact:updated` |
| 部署进度 | `deploy:progress` / `deploy:completed` / `deploy:failed` |

### ✅ 验证：`npm run dev:server` 启动无报错

---

## 模块 C：前端 Chat Store

### 文件：`packages/frontend/src/stores/chat-store.ts`

### C1. ChatStore 接口新增字段

```typescript
interface ChatStore {
  // ...现有字段
  
  // 新增
  conversationMode: Record<string, "single" | "group">;
  agentTyping: Record<string, Set<string>>;  // convId -> typing agentIds
  currentPreview: null | { artifactId: string; type: string; content: string };
}
```

### C2. 新增 Actions

| action | 说明 |
|--------|------|
| `setConversationMode(convId, mode)` | 设置会话模式 |
| `setAgentTyping(convId, agentId, isTyping)` | 设置 Agent 输入状态 |
| `setCurrentPreview(preview)` | 设置当前预览产物 |
| `addAgentMessage(convId, msg)` | 添加 Agent 消息（带 agentId/role 标识） |

### C3. 持久化扩展

新增 localStorage key：
- `agenthub-conv-mode` — 会话模式
- `agenthub-preview` — 当前预览状态

### ✅ 验证：TypeScript 编译通过

---

## 模块 D：前端 WebSocket Hook

### 文件：`packages/frontend/src/hooks/useWebSocket.ts`

### D1. 新增消息处理器

```typescript
// 在 switch (msg.type) 中新增：
case "agent:message":
  useChatStore.getState().addAgentMessage(msg.conversationId, msg);
  break;
case "agent:broadcast":
  // 添加群聊广播消息到消息列表
  break;
case "agent:typing":
  useChatStore.getState().setAgentTyping(msg.conversationId, msg.agentId, true);
  break;
case "agent:joined":
case "agent:left":
  // 更新 Agent 团队状态
  break;
case "artifact:updated":
  useWorkspaceStore.getState().addArtifact(msg.artifact);
  break;
case "deploy:progress":
case "deploy:completed":
case "deploy:failed":
  useWorkspaceStore.getState().setDeployStatus(msg.status, msg.url);
  break;
```

### D2. 新增发送方法

```typescript
assignAgent(convId: string, agentId: string, content: string): void;
cancelAgent(convId: string, agentId: string): void;
updateArtifact(convId: string, artifactId: string, content: string): void;
deployArtifact(convId: string, artifactId: string, providerId: string): void;
setConversationMode(convId: string, mode: "single" | "group"): void;
```

### ✅ 验证：TypeScript 编译通过

---

## 模块 E：MessageList 重构

### 文件：`packages/frontend/src/features/chat/MessageList.tsx`

### E1. Agent 消息气泡（新增）

```typescript
function AgentMessageBubble({ msg }: { msg: AgentMessage }) {
  // 显示 Agent 头像（渐变圆角）、名称、角色标签
  // 内容区使用 Markdown 渲染
  // 底部操作栏：复制、重新生成、编辑
}
```

### E2. 消息操作栏（新增）

每条消息 hover 显示：

```
📋 复制  🔄 重新生成  ✏️ 编辑  👍 👎
```

| 操作 | 实现 |
|------|------|
| 复制 | `navigator.clipboard.writeText()` |
| 重新生成 | 发送 `agent:assign` 给同一 Agent |
| 编辑 | 将消息内容回填到输入框 |
| 反馈 | 发送 `message:feedback` WS 消息 |

### E3. Agent 输入指示器（新增）

```tsx
function AgentTypingIndicator({ agents }: { agents: string[] }) {
  return (
    <div>
      {agents.map(name => (
        <span>{name} 正在输入<DotAnimation /></span>
      ))}
    </div>
  );
}
```

### E4. 部署状态卡片（增强）

将 `DeployStatusCard` 改为三态：

```tsx
function DeployStatusCard({ deploy }: { deploy: DeployState }) {
  switch (deploy.status) {
    case "deploying": return <ProgressCard />;
    case "completed": return <SuccessCard />;
    case "failed": return <FailedCard />;
  }
}
```

### ✅ 验证：浏览器截图，确认消息气泡渲染正确

---

## 模块 F：会话模式切换

### 文件：`packages/frontend/src/features/chat/ConversationListView.tsx`

### F1. 会话列表顶部模式切换

```
┌─ 模式切换 ──────────┐
│ [○ 单聊]  [● 群聊]  │
└─────────────────────┘
```

点击切换时，过滤显示对应模式的会话。

**单聊 Tab**：只显示 `mode === "single"` 的会话
**群聊 Tab**：只显示 `mode === "group"` 的会话

### F2. 创建群聊弹窗（修改 `CreateConversationModal`）

创建群聊时弹出 Agent 选择器：

```
┌─ 创建群聊 ────────────────────┐
│ 群聊名称：[________________]  │
│                                │
│ 选择 Agent 团队：              │
│ ☑ Planner    ☑ Researcher    │
│ ☑ Frontend   ☐ Designer      │
│ ☑ Critic     ☐ Tester        │
│                                │
│         [创建群聊]             │
└────────────────────────────────┘
```

### ✅ 验证：创建群聊，发送消息，确认多个 Agent 协作响应

---

## 模块 G：Agent 选择器（@提及）

### 文件：`packages/frontend/src/features/chat/MentionSuggestions.tsx`（增强）

### G1. 群聊 @提及

在群聊输入框中输入 `@` 弹出 Agent 选择器：

```typescript
function MentionSuggestions({ agents, onSelect, filter }) {
  // 过滤匹配的 Agent
  // 键盘 ↑↓ 导航 + Enter 选择
  // 显示 Agent 头像、名称、能力标签
}
```

### G2. 输入框增强

修改 `QuickReplyBar.tsx`：

```typescript
function QuickReplyBar({ onSend, conversationMode }) {
  // 群聊模式：显示 "输入消息，@Agent 指定回复对象"
  // 单聊模式：显示当前对话 Agent 名称
  // 解析 @mention，生成 agent:assign 或 message:send
}
```

### ✅ 验证：群聊中输入 @，确认弹窗出现，选择 Agent 后消息正确发送

---

## 模块 H：Context Panel（上下文面板）

### 文件：`packages/frontend/src/features/views/RightPanelTabs.tsx`（增强）

### H1. Tab 列表

| Tab | 图标 | 内容 |
|-----|------|------|
| 上下文 | 📋 | 当前项目、项目文件、Agent 团队、项目记忆、最近动态 |
| 预览 | 👁️ | 产物预览（按类型路由渲染器） |
| 代码 | 💻 | Monaco Editor 代码视图 |
| Diff | 🔄 | Monaco Diff Editor |
| 部署 | 🚀 | 部署状态和历史 |

### H2. 上下文 Tab 内容

```
┌─ 上下文面板 ─────────────┐
│                           │
│ 📋 当前项目               │
│   项目名称 + 描述         │
│                           │
│ 📁 项目文件               │
│   ○ index.html            │
│   ○ style.css             │
│   ○ app.js                │
│   (点击预览/编辑)          │
│                           │
│ 🤖 Agent 团队             │
│   ● Planner    在线       │
│   ● Frontend   工作中     │
│   ○ Critic     空闲       │
│                           │
│ 🧠 项目记忆               │
│   "用户偏好深色主题"       │
│   [+ 添加记忆]            │
│                           │
│ 📜 最近动态               │
│   Planner 拆解任务  2m    │
│   Frontend 生成代码 1m    │
└───────────────────────────┘
```

### H3. 项目记忆

```typescript
interface ProjectMemory {
  id: string;
  conversationId: string;
  content: string;
  createdBy: "user" | string;  // agentId
  createdAt: number;
}
```

- localStorage 持久化
- 用户手动添加
- Agent 自动提取关键信息后提示用户确认

### ✅ 验证：截图确认上下文面板各区块正确渲染

---

## 模块 I：产物预览系统

### 文件：`packages/frontend/src/features/chat/RightPanel.tsx`（重构）

### I1. ArtifactRenderer（新增文件）

路由组件，根据类型选择渲染器：

```typescript
function ArtifactRenderer({ artifact, onEdit, onDeploy }) {
  switch (artifact.type) {
    case "html": return <HtmlRenderer artifact={artifact} />;
    case "code": return <CodeRenderer artifact={artifact} />;
    case "document": return <DocumentRenderer artifact={artifact} />;
    case "slides": return <SlidesRenderer artifact={artifact} />;
    default: return <FallbackRenderer artifact={artifact} />;
  }
}
```

### I2. 四种渲染器

**HtmlRenderer**（增强现有 PreviewTab）：
- iframe srcdoc 渲染
- 桌面/手机视口切换按钮
- 切换到代码视图按钮
- 部署按钮（三个平台选择）

**CodeRenderer**（增强现有 CodeTab）：
- Monaco Editor 全功能模式
- 顶部语言标签 + 版本选择
- [查看历史] 按钮 → 弹出 VersionHistoryModal
- [让 Agent 修改] → 选中代码 + 输入修改指令

**DocumentRenderer**（新增）：
- ReactMarkdown 渲染
- 选中段落 → 右键「交给 Agent 处理」
- 编辑按钮 → 切换 Markdown 编辑模式

**SlidesRenderer**（新增）：
- iframe 渲染 Google Slides 预览
- 翻页按钮 ◀ ▶
- 页面信息 "1/5"
- [下载 PDF] 按钮

### I3. 产物操作统一栏

```
[✏️ 编辑]  [🗑️ 删除]  [📦 下载]  [🚀 部署]  [📋 复制]
```

### ✅ 验证：生成 HTML/代码/文档 产物，确认四种渲染器正常

---

## 模块 J：部署平台

### 文件新建：`packages/frontend/src/features/chat/DeployPanel.tsx`

### J1. DeployPanel 组件

```tsx
function DeployPanel({ artifact, onClose }) {
  const [provider, setProvider] = useState(null);
  const [config, setConfig] = useState({});
  
  return (
    <div>
      <h3>选择部署平台</h3>
      <ProviderCard id="vercel" name="Vercel" icon="▲" />
      <ProviderCard id="static-download" name="下载静态包" icon="📦" />
      <ProviderCard id="self-hosted" name="自托管服务器" icon="🖥️" />
      
      {provider === "self-hosted" && <SSHConfigForm />}
      {provider === "vercel" && <VercelConfigForm />}
      
      <Button onClick={deploy}>部署</Button>
    </div>
  );
}
```

### J2. DeployStatusCard（增强）

三态渲染已在模块 E 中实现。

### ✅ 验证：点击部署按钮，确认部署流程 UI 正常

---

## 执行顺序

```
A (WS 类型) → B (服务端) → C (Chat Store) → D (WS Hook)
    │
    ├── E (MessageList)
    ├── F (会话模式)
    ├── G (@提及)
    ├── H (Context Panel)
    ├── I (产物预览)
    └── J (部署平台)
```

其中 E-J 的 6 个模块可以并行开发（都是前端组件，互不依赖）。

---

## 每模块验证方式

| 模块 | 验证方法 |
|------|---------|
| A | `npx tsc --noEmit` |
| B | `npm run dev:server` 启动无报错 |
| C | TypeScript 编译通过 |
| D | TypeScript 编译通过 |
| E-J | 浏览器截图，确认 UI 正确渲染 |

## 最终集成验证

1. 启动项目 `npm run dev:all`
2. 创建群聊，选择多个 Agent
3. 发送"帮我做一个番茄钟应用"
4. 验证：消息列表中 Agent 消息气泡正确显示（头像、角色标签）
5. 验证：产物预览卡片出现，可点击展开
6. 验证：代码 Tab 正常使用 Monaco 编辑器
7. 验证：HTML 预览 Tab 正常渲染 iframe
8. 验证：部署按钮可触发部署流程
9. 验证：刷新页面后会话、消息、产物均持久化
