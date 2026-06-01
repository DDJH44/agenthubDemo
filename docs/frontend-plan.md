# AgentHub 前端页面规划方案

## 1. 页面结构设计

### 1.1 页面层级树

```
AgentHub
├── 工作台 (dashboard)                    ← 默认首页
│   ├── 统计概览（4卡片）
│   ├── 最近任务表格
│   ├── Agent 状态面板
│   ├── 任务趋势图表
│   └── 活动动态
│
├── 会话 (chat)                           ← 核心工作区
│   ├── 会话列表（左侧栏）
│   ├── 聊天主面板
│   │   ├── 消息流（user_message / agent_message / plan / diff / tool_call...）
│   │   ├── Agent 状态指示
│   │   ├── 流式输出
│   │   └── 输入区（@mention / 上传 / Agent 选择）
│   └── 上下文面板（右侧栏）
│       ├── 任务进度（StepCard）
│       ├── 文件预览
│       └── Agent 状态
│
├── 工作空间
│   ├── 任务 (tasks)                      ← 任务管理
│   │   ├── 任务列表（筛选/排序/搜索）
│   │   ├── 任务详情（进度/步骤/结果）
│   │   └── 创建任务表单
│   │
│   ├── 项目 (projects)                   ← 项目管理
│   │   ├── 项目列表
│   │   ├── 项目详情
│   │   │   ├── 成员管理
│   │   │   ├── 任务看板
│   │   │   └── 文件资源
│   │   └── 创建项目表单
│   │
│   ├── 知识库 (knowledge)                ← RAG 数据源
│   │   ├── 文档列表
│   │   ├── 文档查看/编辑
│   │   └── 上传/导入
│   │
│   └── 文件 (files)                      ← 文件中心
│       ├── 文件列表（按类型/项目筛选）
│       ├── 文件预览
│       └── 上传/下载
│
├── 智能体
│   ├── 智能体市场 (agent-market)          ← 社区智能体
│   │   ├── 推荐列表
│   │   ├── 分类浏览
│   │   └── 智能体详情（能力/评分/安装）
│   │
│   ├── 我的智能体 (my-agents)             ← 已安装智能体
│   │   ├── 智能体列表
│   │   ├── 智能体配置（模型/工具/权限）
│   │   └── 智能体测试面板
│   │
│   ├── 工作流 (workflows)                 ← DAG 编排
│   │   ├── 工作流列表
│   │   ├── 画布编辑器（@xyflow/react）
│   │   │   ├── Agent 节点拖拽
│   │   │   ├── 连线编排
│   │   │   └── 属性面板
│   │   └── 执行监控（SSE 实时）
│   │
│   └── MCP (mcp)                         ← MCP 服务器
│       ├── 服务器列表（连接状态）
│       ├── 工具列表
│       └── 服务器详情（协议/地址/操作）
│
└── 系统
    ├── 设置 (settings)                    ← 系统配置
    │   ├── 通用设置（语言/主题/通知）
    │   ├── API 密钥管理
    │   ├── 团队成员管理
    │   └── 数据导出
    │
    └── 帮助与支持 (help)                  ← 文档中心
        ├── 使用指南
        ├── API 文档
        ├── FAQ
        └── 联系支持
```

### 1.2 页面布局模式

| 模式 | 适用页面 | 结构 |
|------|---------|------|
| **仪表盘模式** | 工作台 | 左侧导航(240px) + 主内容区(flex) + 右侧面板(300px) |
| **聊天模式** | 会话 | 左侧会话列表(可拖拽) + 聊天面板(flex) + 上下文面板(可拖拽) |
| **列表-详情模式** | 任务、项目、文件、知识库、智能体 | 左侧导航(240px) + 列表区 + 详情面板(右侧滑出) |
| **画布模式** | 工作流 | 左侧调色板 + 画布(flex) + 属性面板(右侧) |
| **全屏模式** | 设置、帮助 | 左侧导航(240px) + 内容区(flex) |

---

## 2. 路由配置方案

### 2.1 当前路由架构

项目采用 **SPA 状态路由**（非 Next.js 文件路由），通过 `navigation-store` 的 `activeNav` 控制视图切换：

```typescript
// packages/frontend/src/stores/navigation-store.ts
export type NavKey = "dashboard" | "chat" | "agents" | "tasks" | "projects" | "knowledge"
  | "files" | "agent-market" | "my-agents" | "mcp" | "workflows" | "settings" | "help";
```

### 2.2 路由扩展方案

为支持子页面和参数传递，需将 `NavKey` 扩展为路由栈：

```typescript
// 新增路由类型
export interface Route {
  key: NavKey;
  params?: Record<string, string>;   // 路由参数
  search?: Record<string, string>;   // 查询参数
}

// navigation-store 扩展
interface NavigationStore {
  activeNav: NavKey;
  routeStack: Route[];               // 路由栈（支持返回）
  currentRoute: Route;               // 当前路由
  setActiveNav: (key: NavKey) => void;
  navigate: (route: Route) => void;  // 新导航方法
  goBack: () => void;                // 返回上一页
  canGoBack: () => boolean;
}
```

### 2.3 完整路由表

| 路由 Key | 路径（未来 URL） | 参数 | 组件 | 说明 |
|----------|-----------------|------|------|------|
| `dashboard` | `/` | — | DashboardView | 工作台首页 |
| `chat` | `/chat` | — | AgentChatPanel | 聊天列表 |
| `chat` | `/chat/:conversationId` | `conversationId` | AgentChatPanel | 具体会话 |
| `tasks` | `/tasks` | `?status=&priority=&agent=` | TasksView | 任务列表 |
| `tasks` | `/tasks/:taskId` | `taskId` | TaskDetailView | 任务详情 |
| `projects` | `/projects` | — | ProjectsView | 项目列表 |
| `projects` | `/projects/:projectId` | `projectId` | ProjectDetailView | 项目详情 |
| `knowledge` | `/knowledge` | — | KnowledgeView | 知识库列表 |
| `knowledge` | `/knowledge/:docId` | `docId` | DocDetailView | 文档详情 |
| `files` | `/files` | `?type=&project=` | FilesView | 文件中心 |
| `agent-market` | `/agents/market` | — | AgentMarketView | 智能体市场 |
| `agent-market` | `/agents/market/:agentId` | `agentId` | AgentDetailInView | 智能体详情 |
| `my-agents` | `/agents/my` | — | MyAgentsView | 我的智能体 |
| `my-agents` | `/agents/my/:agentId` | `agentId` | AgentConfigView | 智能体配置 |
| `workflows` | `/workflows` | — | WorkflowsView | 工作流列表 |
| `workflows` | `/workflows/:flowId` | `flowId` | WorkflowEditorView | 工作流编辑器 |
| `mcp` | `/mcp` | — | McpView | MCP 服务器 |
| `settings` | `/settings` | `?tab=general|api|team|export` | SettingsView | 设置 |
| `help` | `/help` | — | HelpView | 帮助中心 |

### 2.4 路由守卫策略

```typescript
// 权限级别
type RouteGuard = "public" | "auth" | "admin";

// 路由守卫映射
const ROUTE_GUARDS: Record<NavKey, RouteGuard> = {
  dashboard:      "auth",    // 需登录
  chat:           "auth",    // 需登录
  tasks:          "auth",    // 需登录
  projects:       "auth",    // 需登录
  knowledge:      "auth",    // 需登录
  files:          "auth",    // 需登录
  "agent-market": "auth",    // 需登录
  "my-agents":    "auth",    // 需登录
  workflows:      "auth",    // 需登录
  mcp:            "admin",   // 需管理员
  settings:       "auth",    // 需登录（部分 tab 需 admin）
  help:           "public",  // 公开
};

// 守卫实现
function canAccess(route: NavKey, userRole: WorkspaceRole): boolean {
  const guard = ROUTE_GUARDS[route];
  if (guard === "public") return true;
  if (guard === "auth") return !!userRole;  // 已登录
  if (guard === "admin") return userRole === "owner" || userRole === "admin";
  return false;
}
```

---

## 3. 页面跳转逻辑

### 3.1 跳转方式矩阵

| 来源 | 目标 | 触发方式 | 传参 | 返回策略 |
|------|------|---------|------|---------|
| 左侧导航 | 任意页面 | 点击导航项 | 无 | 无（替换） |
| 工作台→会话 | `/chat/:id` | 点击"新建任务"按钮 | 无 | 返回工作台 |
| 工作台→任务详情 | `/tasks/:id` | 点击任务表格行 | `taskId` | 返回工作台 |
| 工作台→Agent详情 | `/my-agents/:id` | 点击Agent状态项 | `agentId` | 返回工作台 |
| 会话→任务详情 | `/tasks/:id` | 点击消息中的任务卡片 | `taskId` | 返回会话 |
| 任务列表→任务详情 | `/tasks/:id` | 点击任务行 | `taskId` | 返回任务列表 |
| 项目列表→项目详情 | `/projects/:id` | 点击项目卡片 | `projectId` | 返回项目列表 |
| 智能体市场→安装 | `/my-agents/:id` | 点击"安装"按钮 | `agentId` | 返回市场 |
| 工作流→执行监控 | `/workflows/:id` | 点击"运行" | `flowId` | 返回编辑器 |
| 右侧面板→文件 | `/files` | 点击"查看全部" | 无 | 返回上一页 |
| 右侧面板→任务 | `/tasks` | 点击"查看全部" | 无 | 返回上一页 |

### 3.2 参数传递机制

```typescript
// 方式1: Store 传参（当前方案，适合 SPA）
navigate({ key: "tasks", params: { taskId: "abc123" } });

// 方式2: URL 查询参数（适合筛选/排序）
navigate({ key: "tasks", search: { status: "running", agent: "frontend" } });

// 方式3: 共享 Store 状态（适合复杂对象）
// chat-store.activeConversationId → 无需额外传参
// workspace-store.plan → 跨页面共享
```

### 3.3 返回策略

```typescript
// 路由栈管理
interface NavigationStore {
  routeStack: Route[];

  navigate: (route: Route) => void;   // push + 切换
  replace: (route: Route) => void;    // 替换当前（导航栏跳转）
  goBack: () => void;                 // pop + 切换
  canGoBack: () => boolean;           // routeStack.length > 1
}

// 示例：从工作台进入任务详情
navigate({ key: "tasks", params: { taskId: "abc" } });
// routeStack: [dashboard, tasks/abc]

goBack();
// routeStack: [dashboard] → 显示工作台
```

---

## 4. 页面功能映射

### 4.1 功能模块 → 页面 → 组件 → Store → API

| 功能模块 | 页面 | 核心组件 | Store | API/WS |
|---------|------|---------|-------|--------|
| **工作台概览** | dashboard | StatCard, TaskTable, AgentStatusPanel, TaskTrendChart, ActivityFeed | chat-store, workspace-store | WS: agent:status |
| **多智能体对话** | chat | AgentChatPanel, ConversationSidebar, ContextPanel, MentionSuggestions | chat-store | WS: message:send, task:submit |
| **任务管理** | tasks | TaskList, TaskDetail, TaskForm | workspace-store (扩展) | GET /api/tasks, POST /api/tasks |
| **项目管理** | projects | ProjectList, ProjectDetail, MemberManager | workspace-store (扩展) | GET /api/projects |
| **知识库** | knowledge | DocList, DocEditor, DocUploader | workspace-store (扩展) | GET /api/knowledge |
| **文件管理** | files | FileList, FilePreview, FileUploader | workspace-store (扩展) | GET /api/files |
| **智能体市场** | agent-market | AgentMarketList, AgentDetailCard | settings-store (扩展) | GET /api/agents/market |
| **我的智能体** | my-agents | MyAgentList, AgentConfig, AgentTestPanel | settings-store (扩展) | GET/PUT /api/agents |
| **工作流编排** | workflows | WorkflowCanvas, NodePalette, PropertyPanel, ExecutionMonitor | workspace-store | WS: job:create, POST /api/run |
| **MCP 管理** | mcp | McpServerList, McpToolList, McpDetail | settings-store (扩展) | GET /api/mcp |
| **系统设置** | settings | GeneralSettings, ApiKeyManager, TeamManager, DataExport | settings-store | GET/PUT /api/settings |
| **帮助支持** | help | HelpGuide, ApiDocs, FAQ, ContactSupport | — | 静态内容 |

### 4.2 WebSocket 事件 → 页面更新映射

| WS 事件 | 目标页面 | 更新内容 |
|---------|---------|---------|
| `message:created` | chat | 追加消息到聊天流 |
| `agent:stream` | chat | 流式输出追加 |
| `plan:created` | chat, dashboard | 更新任务计划步骤 |
| `step:started` | chat, dashboard | 更新步骤状态为 running |
| `step:completed` | chat, dashboard, tasks | 更新步骤状态为 done |
| `critic:review` | chat | 显示审查结果 |
| `job:completed` | chat, dashboard, tasks | 更新任务状态、统计数据 |
| `job:failed` | chat, dashboard, tasks | 显示错误信息 |
| `artifact:created` | chat, files | 添加文件/产物 |
| `deploy:status` | chat | 更新部署状态 |
| `agent:status` | dashboard, my-agents | 更新 Agent 在线状态 |

---

## 5. 页面权限控制

### 5.1 角色定义（基于 shared/types/user.ts）

| 角色 | WorkspaceRole | 说明 |
|------|--------------|------|
| 所有者 | `owner` | 工作空间创建者，拥有全部权限 |
| 管理员 | `admin` | 可管理成员、配置、Agent |
| 成员 | `member` | 可使用功能，不可管理配置 |

### 5.2 页面权限矩阵

| 页面 | owner | admin | member | 未登录 |
|------|-------|-------|--------|--------|
| 工作台 | ✅ | ✅ | ✅ | ❌ → 登录页 |
| 会话 | ✅ | ✅ | ✅ | ❌ → 登录页 |
| 任务 | ✅ | ✅ | ✅ | ❌ |
| 项目 | ✅ | ✅ | ✅ | ❌ |
| 知识库 | ✅ | ✅ | ✅ | ❌ |
| 文件 | ✅ | ✅ | ✅ | ❌ |
| 智能体市场 | ✅ | ✅ | ✅ | ❌ |
| 我的智能体 | ✅ | ✅ | ✅ | ❌ |
| 工作流 | ✅ | ✅ | ✅ | ❌ |
| MCP | ✅ | ✅ | ❌ | ❌ |
| 设置-通用 | ✅ | ✅ | ✅ | ❌ |
| 设置-API | ✅ | ✅ | ❌ | ❌ |
| 设置-团队 | ✅ | ✅ | ❌ | ❌ |
| 设置-导出 | ✅ | ✅ | ✅ | ❌ |
| 帮助 | ✅ | ✅ | ✅ | ✅ |

### 5.3 功能级权限

| 操作 | owner | admin | member |
|------|-------|-------|--------|
| 创建任务 | ✅ | ✅ | ✅ |
| 删除任务 | ✅ | ✅ | ❌ |
| 创建项目 | ✅ | ✅ | ✅ |
| 删除项目 | ✅ | ❌ | ❌ |
| 安装/卸载智能体 | ✅ | ✅ | ❌ |
| 配置智能体参数 | ✅ | ✅ | ❌ |
| 创建工作流 | ✅ | ✅ | ✅ |
| 删除工作流 | ✅ | ❌ | ❌ |
| 添加 MCP 服务器 | ✅ | ✅ | ❌ |
| 管理团队成员 | ✅ | ✅ | ❌ |
| 修改 API 密钥 | ✅ | ❌ | ❌ |
| 导出数据 | ✅ | ✅ | ✅ |

### 5.4 权限实现方案

```typescript
// packages/frontend/src/hooks/usePermission.ts
export function usePermission() {
  const { userRole } = useAuthStore();  // 待实现

  const can = (action: string): boolean => {
    const permissions: Record<string, WorkspaceRole[]> = {
      "task:delete": ["owner", "admin"],
      "project:delete": ["owner"],
      "agent:install": ["owner", "admin"],
      "agent:config": ["owner", "admin"],
      "workflow:delete": ["owner"],
      "mcp:add": ["owner", "admin"],
      "team:manage": ["owner", "admin"],
      "api:manage": ["owner"],
    };
    const allowed = permissions[action] ?? ["owner", "admin", "member"];
    return allowed.includes(userRole);
  };

  return { can };
}

// 在组件中使用
function DeleteTaskButton() {
  const { can } = usePermission();
  if (!can("task:delete")) return null;
  return <button>删除任务</button>;
}
```

---

## 6. 可扩展性设计

### 6.1 新增页面流程

1. 在 `navigation-store.ts` 的 `NavKey` 类型中添加新 key
2. 在 `i18n.ts` 添加 `nav.xxx` 翻译
3. 在 `SidebarNav.tsx` 的 `NAV_ITEMS` 添加导航项
4. 在 `views/` 目录创建新视图组件
5. 在 `index.tsx` 导出新组件
6. 在 `page.tsx` 的 `renderMain` switch 添加分支
7. 如需权限控制，在 `ROUTE_GUARDS` 添加守卫

### 6.2 未来扩展预留

| 扩展方向 | 预留接口 | 说明 |
|---------|---------|------|
| URL 路由 | `Route.params` / `Route.search` | 当前 SPA 路由可无缝迁移到 Next.js App Router |
| 多工作空间 | `Workspace` 类型已定义 | workspace-store 可扩展为多空间切换 |
| 插件系统 | MCP 工具注册机制 | agent-market 可扩展为插件市场 |
| 实时协作 | WS Room 机制 | 已支持 conversation:subscribe/unsubscribe |
| 移动端适配 | 响应式布局 + BottomTabBar | 已有移动端底部导航组件 |
| 国际化 | i18n 翻译体系 | 已支持 zh/en，可扩展更多语言 |
| 主题切换 | CSS 变量体系 | globals.css 已定义完整 token，可扩展暗色主题 |

### 6.3 后端 API 扩展建议

当前后端仅有 3 个 API 端点（`POST /api/chat`、`POST /api/run`、`GET /api/health`），需补充：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tasks` | GET | 任务列表（支持筛选/分页） |
| `/api/tasks/:id` | GET | 任务详情 |
| `/api/projects` | GET/POST | 项目 CRUD |
| `/api/projects/:id` | GET/PUT/DELETE | 项目详情/更新/删除 |
| `/api/agents` | GET | 智能体列表 |
| `/api/agents/:id` | GET/PUT | 智能体详情/配置 |
| `/api/agents/market` | GET | 市场智能体列表 |
| `/api/files` | GET/POST | 文件列表/上传 |
| `/api/knowledge` | GET/POST | 知识库列表/导入 |
| `/api/mcp` | GET/POST | MCP 服务器列表/注册 |
| `/api/settings` | GET/PUT | 用户设置 |
| `/api/team` | GET/POST/DELETE | 团队成员管理 |
