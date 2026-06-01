# AgentHub 全面重构设计文档

> 日期：2026-05-31
> 方案：B（全面重构）
> 交付策略：分阶段交付，第一阶段优先交互体验

---

## 一、WS 协议重构

### 核心理念

将「编排器 → 前端」单向推送模型，改为「Agent 间可互发消息 + 前端可订阅任意 Agent」的事件驱动模型。

### 新增客户端 → 服务端消息

| 类型 | 说明 |
|------|------|
| `agent:assign` | 指定 Agent 执行任务 |
| `agent:cancel` | 取消指定 Agent 的任务 |
| `artifact:update` | 前端编辑产物后回传 |
| `artifact:deploy` | 触发部署（指定平台） |

### 新增服务端 → 客户端消息

| 类型 | 说明 |
|------|------|
| `agent:message` | 单个 Agent 的消息（单聊模式核心） |
| `agent:broadcast` | Agent 广播消息（群聊模式核心） |
| `agent:typing` | Agent 正在输入指示 |
| `agent:joined` | Agent 加入会话 |
| `agent:left` | Agent 离开会话 |
| `artifact:updated` | 产物被编辑/更新 |
| `artifact:version` | 产物版本快照 |
| `deploy:progress` | 部署进度 |
| `deploy:completed` | 部署完成（含平台、URL） |
| `deploy:failed` | 部署失败（含错误详情） |

### 消息结构

**agent:message（单聊）**

```typescript
{
  type: "agent:message",
  conversationId: string,
  agentId: string,
  agentName: string,
  agentRole: string,        // planner | worker | researcher | critic | refiner
  content: string,
  artifacts?: Artifact[],
  timestamp: number
}
```

**agent:broadcast（群聊）**

```typescript
{
  type: "agent:broadcast",
  conversationId: string,
  fromAgentId: string,
  toAgentIds: string[],     // 空 = 广播给所有
  content: string,
  context?: {
    relatedStepId?: string,
    parentMessageId?: string
  },
  timestamp: number
}
```

**artifact:created（扩展）**

```typescript
{
  type: "artifact:created",
  artifact: {
    id: string,
    type: "html" | "code" | "document" | "slides" | "image",
    filename: string,
    content: string,
    version: number,
    parentId?: string,
    metadata?: {
      language?: string,
      framework?: string,
      pageCount?: number,
    },
    createdAt: number
  }
}
```

### 兼容性

- 保留所有现有消息类型，新增类型不影响旧逻辑
- `agent:stream` 保留，作为流式输出的底层传输
- `message:created` 保留，用于持久化到 DB 的最终消息
- 新增类型是上层语义封装，底层仍走 WS 文本帧

---

## 二、编排器重构

### 现状问题

当前编排器是固定流水线：`Researcher → Planner → Worker×N → Critic → Refiner → Summary`

- 所有任务走同一条流水线，无法按需调度
- Agent 之间不能直接通信，只能通过编排器中转
- 没有失败降级，某个 Agent 失败整个任务就卡住
- 没有「主 Agent」概念

### 新架构：事件驱动 + 主 Agent 协调

```
用户消息
  │
  ▼
┌─────────────┐
│  主 Agent    │  ← PM/PMO 角色
│  (Coordinator)│
│  - 理解意图   │
│  - 拆解任务   │
│  - 分配 Agent │
│  - 监控进度   │
│  - 处理冲突   │
└──────┬──────┘
       │ emit: task:assigned
       ▼
┌──────────────────────────────────┐
│         Agent Bus（事件总线）       │
│                                    │
│  Researcher ◄──────► Worker A     │
│       ▲        bus        ▲       │
│       │                   │       │
│  Planner  ◄──────►  Worker B     │
│       ▲                   │       │
│       │                   ▼       │
│  Critic   ◄──────►  Refiner      │
└──────────────────────────────────┘
       │ emit: agent:completed / agent:failed
       ▼
┌─────────────┐
│  主 Agent    │  ← 汇总结果，决定下一步
│  (Review)    │
└─────────────┘
```

### AgentBus（事件总线）

```typescript
interface AgentBus {
  subscribe(agentId: string, eventTypes: string[], handler: AgentHandler): void;
  unsubscribe(agentId: string): void;
  emit(event: AgentEvent): void;
  sendTo(targetAgentId: string, event: AgentEvent): void;
  broadcast(fromAgentId: string, event: AgentEvent): void;
}

interface AgentEvent {
  type: string;
  fromAgentId: string;
  toAgentIds?: string[];
  payload: unknown;
  conversationId: string;
  parentEventId?: string;
  timestamp: number;
}
```

### 主 Agent（CoordinatorAgent）

```typescript
class CoordinatorAgent extends BaseAgent {
  async handleUserMessage(content: string, context: ConversationContext): Promise<TaskPlan>;
  selectAgents(task: TaskPlan): AgentAssignment[];
  onAgentCompleted(event: AgentEvent): void;
  onAgentFailed(event: AgentEvent): void;
  handleFailure(agentId: string, error: Error): FallbackAction;
  resolveConflict(artifactA: Artifact, artifactB: Artifact): Artifact;
  synthesize(results: AgentResult[]): FinalOutput;
}
```

### Agent 注册表

```typescript
interface AgentDescriptor {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  platform: string;          // "openai" | "claude-code" | "codex" | "custom"
  avatar: string;
  maxConcurrent: number;
}

class AgentRegistry {
  register(descriptor: AgentDescriptor): void;
  unregister(agentId: string): void;
  findByCapability(capability: string): AgentDescriptor[];
  findById(agentId: string): AgentDescriptor | undefined;
}
```

### 执行流程

**单聊模式**：用户 → 主 Agent → 选择 1 个 Agent 执行 → 结果返回用户

**群聊模式**：
1. 用户发送 "帮我做一个番茄钟应用"
2. 主 Agent 拆解：Researcher 调研 + Planner 规划
3. 两者完成后，主 Agent 分配 Worker-A 和 Worker-B 并行执行
4. Critic 审查 → 发现冲突 → 主 Agent 协调合并
5. Refiner 优化 → 主 Agent 汇总 → 返回用户

**失败降级策略**：
1. 重试 1 次（同一 Agent）
2. 换一个同 capability 的 Agent
3. 降级为简化方案
4. 通知用户，请求人工介入

### 与现有编排器的关系

- 现有 `orchestrator/index.ts` 改造为 `CoordinatorAgent`
- 现有 DAG 逻辑保留，作为主 Agent 内部的任务调度策略
- `AgentBus` 是新增组件，替代原来编排器内部的串行调用

---

## 三、前端交互体验

### 布局

三栏式：左侧会话列表 | 中间主聊天区域 | 右侧上下文面板

### 消息类型与渲染

| 消息类型 | 渲染组件 | 说明 |
|---------|---------|------|
| `agent:message` | `AgentMessageBubble` | 单 Agent 回复，带头像、角色标签 |
| `agent:broadcast` | `BroadcastMessageBubble` | 群聊广播，显示来源和目标 |
| `agent:typing` | `AgentTypingIndicator` | 正在输入动画 |
| `artifact:created` | `ArtifactPreviewCard` | 内联产物预览卡片 |
| `artifact:updated` | `ArtifactDiffCard` | 产物更新 diff |
| `deploy:progress` | `DeployStatusCard` | 部署进度条 |
| `deploy:completed` | `DeploySuccessCard` | 部署成功 + 链接 |
| `deploy:failed` | `DeployFailedCard` | 部署失败 + 重试 |

### 单聊 vs 群聊

**单聊**：用户选择一个 Agent 直接对话，消息列表只有用户和该 Agent

**群聊**：
- 用户创建群聊时选择多个 Agent（或由主 Agent 自动组建）
- 消息列表展示所有 Agent 的协作时间线
- 每个 Agent 有独立头像和角色标签
- Agent 之间的交互也展示在时间线中
- 顶部显示「在线 Agent」头像栏

**切换**：
- 会话列表顶部「单聊 / 群聊」切换 Tab
- 群聊创建时弹出 Agent 选择器
- 群聊中通过 `@Agent` 提及指定 Agent

### 消息操作

每条消息 hover 显示：复制、重新生成、编辑、👍/👎 反馈

### 上下文管理

右侧面板「上下文」Tab 包含：
- 当前项目
- 项目文件
- Agent 团队（在线状态）
- 项目记忆（用户可手动添加，Agent 可自动提取）
- 最近动态

支持引用文档段落交给 Agent 处理。

### @提及系统

输入 `@` 弹出 Agent 选择器，群聊模式下 `@Frontend 帮我修改按钮颜色` → 只有 Frontend Agent 响应。

---

## 四、产物系统

### 数据模型

```typescript
interface Artifact {
  id: string;
  conversationId: string;
  type: "html" | "code" | "document" | "slides" | "image";
  filename: string;
  content: string;
  version: number;
  parentId?: string;
  metadata: ArtifactMetadata;
  createdAt: number;
  createdBy: string;
}

interface ArtifactMetadata {
  language?: string;
  framework?: string;
  pageCount?: number;
  title?: string;
  wordCount?: number;
  dependencies?: string[];
}

interface ArtifactVersion {
  artifactId: string;
  versions: Array<{
    version: number;
    content: string;
    createdBy: string;
    createdAt: number;
    changeSummary?: string;
  }>;
}
```

### 四种渲染器

1. **网页预览（HTML Renderer）**：iframe srcdoc 渲染，支持桌面/手机视口切换，可切换代码视图
2. **代码编辑（Code Renderer）**：Monaco Editor 全功能，Diff 视图，「让 Agent 修改」
3. **文档渲染（Document Renderer）**：Markdown 渲染为富文本，支持选中段落交给 Agent
4. **PPT 浏览（Slides Renderer）**：逐页渲染，翻页 + 大纲导航，「让 Agent 优化」

### 版本历史与 Diff

- 每次编辑或 Agent 修改生成新版本
- 支持任意两版本间 Diff 对比
- 支持回滚到历史版本

### 二次交互

1. 内联编辑：直接在渲染器中编辑，保存为新版本
2. 指令修改：选中内容 + 修改指令 → Agent 处理
3. 引用传递：选中段落/代码 → 发给另一个 Agent
4. 回滚：恢复到历史版本

---

## 五、部署平台

### 架构

```
DeployManager（统一入口）
  ├── Vercel Provider
  ├── 静态包下载 Provider
  └── 自托管 Provider
```

### Provider 接口

```typescript
interface DeployProvider {
  id: string;
  name: string;
  icon: string;
  validate(config: DeployConfig): Promise<ValidationResult>;
  deploy(artifacts: Artifact[], config: DeployConfig, onProgress: (msg: string) => void): Promise<DeployResult>;
  getStatus(deployId: string): Promise<DeployStatus>;
  rollback(deployId: string, version: number): Promise<DeployResult>;
  destroy(deployId: string): Promise<void>;
}

interface DeployConfig {
  providerId: string;
  projectName: string;
  environment?: Record<string, string>;
  domain?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  deployPath?: string;
  nginxConfig?: string;
}

interface DeployResult {
  success: boolean;
  deployId: string;
  url?: string;
  providerId: string;
  version: number;
  logs: string[];
  error?: string;
}
```

### 三个 Provider

1. **Vercel**：基于现有 deploy tool 扩展，支持环境变量、自定义域名，实时推送部署进度
2. **静态包下载**：服务端 archiver 打包 ZIP，通过 `/api/download/:deployId` 提供下载，支持预览文件列表
3. **自托管**：SSH/SCP 上传 + Nginx 配置生成，首次需配置连接信息，支持测试连接

### 部署状态卡片

统一 `DeployStatusCard` 组件，三种状态：
- 部署中：进度条 + 日志
- 部署成功：访问链接 + 平台信息
- 部署失败：错误信息 + 重试按钮

### 部署历史

每个会话的部署历史持久化，支持查看历史部署、重新下载、重试失败部署。

---

## 六、分阶段交付计划

### 第一阶段：交互体验 + 产物预览

- WS 协议新增 `agent:message`、`agent:broadcast`、`agent:typing` 等消息类型
- 前端单聊/群聊模式切换
- Agent 消息气泡（头像、角色标签、操作按钮）
- @提及 Agent 选择器
- 产物预览卡片（HTML iframe、代码 Monaco、文档 Markdown）
- 部署状态卡片
- 上下文面板（项目记忆、Agent 团队状态）

### 第二阶段：编排器重构 + 多 Agent 接入

- AgentBus 事件总线
- CoordinatorAgent 主 Agent
- AgentRegistry 注册表
- 接入 Claude Code / Codex 适配器
- 失败降级和冲突处理

### 第三阶段：产物编辑 + 部署平台

- 产物版本历史和 Diff
- 二次交互（指令修改、引用传递）
- Vercel / 静态包下载 / 自托管三个 Provider
- 部署历史和回滚
