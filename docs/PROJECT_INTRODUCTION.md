# AgentHub 项目介绍与技术选型说明

## 1. 项目定位

AgentHub 是一个面向多 Agent 协作的软件生成工作台。项目以 IM 会话为核心入口，让用户可以在单聊或群聊中用自然语言提出需求，再由 PMO 主 Agent 理解目标、拆解任务、分派给不同能力的 Agent，最终形成可预览、可编辑、可下载、可部署的产物。

它解决的不是“单次问答”问题，而是“从需求讨论到产物交付”的完整协作链路问题。用户可以像在一个协作群里沟通一样发起任务，系统则把 Agent 的过程、代码、文档、PPT、部署状态和上下文都沉淀到一个统一的工作台中。

一句话概括：

> AgentHub = IM 协作入口 + PMO 主 Agent 调度 + 多 Agent 产物工作台 + 一键预览与部署。

## 2. 项目背景与核心目标

本项目对应 AI 全栈挑战赛 AgentHub 课题要求，重点考察的是参赛者对 AI 协作产品的完整设计与技术闭环能力。系统需要支持多 Agent 协作、单聊与群聊、产物预览编辑、代码 Diff、部署状态卡片、上下文管理、自建 Agent 接入等能力。

AgentHub 的核心目标包括：

| 目标 | 项目实现 |
| --- | --- |
| 构建以 IM 聊天为核心的多 Agent 协作平台 | 提供会话列表、单聊、群聊、成员、@Agent、上下文篮子和消息操作 |
| 支持主 Agent 调度 | PMO 主 Agent 负责拆解任务、生成执行计划、按依赖调度、汇总结论 |
| 至少接入两个主流 Agent 平台 | 设计了 Codex CLI、Claude Code CLI、OpenAI 兼容 API、自建 Agent 适配层 |
| 支持 Agent 产物预览与编辑 | 支持 HTML、代码、文档、PPT、Diff、历史版本、部署状态等产物工作台 |
| 支持真实部署链路 | 支持默认服务器、自有服务器、Vercel、Miaoda、静态包、容器化部署包和本地预览 |
| 支持协作上下文管理 | 群聊启用/静音 Agent、上下文过滤、引用消息、引用工作流、引用文档段落 |

## 3. 总体架构

AgentHub 采用前后端一体的 TypeScript Monorepo 架构。根应用使用 Next.js 作为 Web 入口，核心业务能力拆分到 `packages/frontend`、`packages/server`、`packages/adapter` 和 `packages/shared` 四个工作区包中。

```text
User
  -> Next.js / React Workspace
  -> WebSocket Gateway + HTTP API
  -> PMO Orchestrator
  -> Planner / Researcher / Worker / Critic / Refiner
  -> Adapter Layer
  -> OpenAI Compatible API / Codex CLI / Claude Code CLI / Custom Agent
  -> Artifact Workspace
  -> Preview / Edit / Diff / Version / Deploy
```

核心分层如下：

| 层级 | 主要技术 | 职责 |
| --- | --- | --- |
| Web 应用层 | Next.js 16.2.6、React 19.2.4、TypeScript | 登录、主工作台、移动端视图、动态加载各功能模块 |
| 前端交互层 | Tailwind CSS 4、Zustand、Monaco Editor、React Flow、Framer Motion | 会话 UI、产物工作台、代码编辑、流程画布、状态反馈 |
| 实时通信层 | WebSocket `ws`、HTTP API | 消息同步、群聊房间广播、任务事件流、部署状态更新 |
| Agent 编排层 | PMO Orchestrator、DAG 调度、ReAct 工具循环 | 任务拆解、角色分派、并行执行、评审重试、结果汇总 |
| 模型适配层 | OpenAI SDK、OpenAI 兼容 API、Codex CLI、Claude Code CLI | 隔离不同模型和 Agent 平台的接入差异 |
| 数据层 | Prisma 7.8.0、PostgreSQL、预留 vector 字段 | 用户、会话、消息、任务、产物、知识库、文件、MCP 配置持久化 |
| 部署层 | Provider Pattern、SSH、Vercel API、静态包、容器化包 | 把 Agent 产物发布成可访问 URL 或可下载交付物 |
| 质量保障层 | ESLint、TypeScript、Jest、Playwright、Smoke Script | 类型检查、单元测试、端到端验证和演示前自检 |

## 4. 仓库结构说明

| 路径 | 说明 |
| --- | --- |
| `src/app` | Next.js 应用入口，包含登录页和主工作台页面 |
| `packages/frontend` | 前端功能模块，会话、产物工作台、智能体、知识库、文件、工作流、设置、帮助等 |
| `packages/server` | 服务端核心，包含 API、WebSocket、Agent 编排、部署、知识库、MCP、数据库仓库 |
| `packages/adapter` | 模型和 Agent 平台适配层，统一封装 OpenAI、Generic OpenAI、Codex、Claude Code |
| `packages/shared` | 前后端共享类型、协议、工具函数和常量 |
| `docs` | 产品文档、技术文档、演示脚本、验收清单和部署说明 |
| `scripts` | smoke test、验收脚本和辅助工具 |

选择 Monorepo 的原因：

| 约束 | 选择 Monorepo 的收益 |
| --- | --- |
| 前端、后端、共享协议变化频繁 | 类型和协议可以统一维护，减少接口漂移 |
| 需要快速迭代 Demo | 一个仓库即可启动、检查、构建和提交 |
| Agent 产物、WebSocket 事件、部署状态都依赖共享类型 | `packages/shared` 可以让前后端使用同一套结构定义 |

取舍：

- 选择了 Monorepo，获得了类型一致性和迭代速度。
- 放弃了多仓库独立发布的隔离性。
- 对本项目而言，答辩演示和全链路协作比独立服务治理更重要，所以 Monorepo 更合适。

## 5. 前端技术选型

### 5.1 Next.js 16.2.6

Next.js 是项目的 Web 应用框架，负责路由、页面构建、生产构建和静态资源处理。

选择原因：

| 项目约束 | Next.js 的匹配点 |
| --- | --- |
| 需要登录页、工作台页、移动端兼容视图 | App Router 可以把页面入口组织得比较清楚 |
| 项目需要快速部署到服务器或 Vercel | Next.js 生态对生产构建、静态资源和 Node 部署支持成熟 |
| 前端模块较多，首屏不能过重 | 项目中使用动态加载降低初始复杂度 |
| 需要和 React 19、TypeScript 深度结合 | Next.js 对 React 和 TypeScript 有一体化支持 |

底层机制：

Next.js 在本项目中主要承担两个角色：一是路由和构建入口，二是前端运行时容器。主工作台页面通过动态导入加载多个视图模块，避免所有功能在首屏一次性进入浏览器执行。生产构建时，Next.js 会编译 React 组件、优化静态资源，并输出可部署应用。

替代方案对比：

| 方案 | 优势 | 劣势 | 为什么本项目没有选择 |
| --- | --- | --- | --- |
| Vite + React | 启动快、配置轻、适合纯 SPA | 生产路由、部署约定和服务端能力需要自己补 | AgentHub 后期需要登录、部署和公网演示，Next.js 更完整 |
| Remix | 数据加载模型清晰，表单体验好 | 当前团队熟悉度和生态资料相对少 | 本项目重点是工作台和实时协作，不是传统表单站点 |
| Next.js | 工程闭环强，构建和部署成熟 | 版本升级变化较大，需要遵守本地 Next 文档 | 与课题 Demo、部署和 React 技术栈匹配度最高 |

好处：

- 降低前端工程搭建成本。
- 支持后续部署到 Vercel 或自有服务器。
- 与 React、TypeScript、ESLint 配套完整。

### 5.2 React 19.2.4

React 是项目 UI 的核心组件框架，负责会话列表、消息流、产物卡片、设置面板、知识库、文件中心等复杂界面的组件化组织。

选择原因：

| 项目约束 | React 的匹配点 |
| --- | --- |
| 页面组件多，状态复杂 | 组件化和 Hooks 模型适合拆分复杂 UI |
| 需要大量交互组件 | React 生态中 Monaco、React Flow、状态管理和测试方案成熟 |
| UI 需要持续调优 | 组件边界清晰，方便局部重构和视觉统一 |

底层机制：

React 通过组件树描述界面，状态变化后触发虚拟树比较，再将必要变更提交到真实 DOM。对 AgentHub 这类“消息流 + 工作台 + 右侧产物面板”的界面来说，组件化的最大价值是把复杂视图拆成可维护的局部单元，例如 `MessageList`、`DeployStatusCard`、`RightPanel`、`ArtifactCard` 等。

好处：

- 会话、消息、产物和设置可以拆成独立组件。
- 便于复用头像、Badge、卡片、按钮、Tab、代码块等 UI 元素。
- 与 Zustand、Monaco、Framer Motion 等库组合顺畅。

### 5.3 TypeScript 5

TypeScript 是整个项目的主语言，覆盖前端、后端、适配层和共享协议。

选择原因：

| 项目约束 | TypeScript 的匹配点 |
| --- | --- |
| WebSocket 事件种类多 | 可以定义事件 payload 类型，减少字段拼错 |
| Agent 产物类型复杂 | HTML、代码、文档、PPT、部署状态可以建模为明确类型 |
| 前后端共享协议 | `packages/shared` 可以同时被前端和后端引用 |
| 项目迭代快，容易引入回归 | 类型检查能提前发现接口不一致 |

好处：

- 降低消息协议、产物协议和部署协议的维护成本。
- 让自建 Agent、部署目标、MCP 配置等复杂对象更容易扩展。
- `npm run typecheck` 可以作为提交前质量闸门。

取舍：

- 开发时需要维护类型定义，短期会多写一些代码。
- 但多 Agent 平台的长期复杂度很高，类型约束带来的收益大于成本。

### 5.4 Tailwind CSS 4

Tailwind CSS 用于构建 AgentHub 的视觉系统和响应式布局。

选择原因：

| 项目约束 | Tailwind 的匹配点 |
| --- | --- |
| UI 需要频繁调整 | 原子类可以快速微调间距、边框、颜色和响应式 |
| 需要保持 SaaS 工作台质感 | 可以精确控制卡片、状态、列表和面板密度 |
| 不希望引入过重组件库 | Tailwind 提供样式能力，不强制绑定组件结构 |

好处：

- 适合快速从“AI 味”调整成更成熟的 SaaS 工作台风格。
- 可以统一蓝紫品牌色、浅灰背景、8px 左右圆角、轻阴影和细线图标。
- 与现有 React 组件自然结合。

替代方案：

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| Ant Design | 企业组件丰富，开发快 | 视觉风格较重，容易不像自研产品 |
| CSS Modules | 样式隔离强 | 高频 UI 迭代成本更高 |
| Tailwind CSS | 轻、快、可控 | 需要团队约定设计规范，避免类名堆叠混乱 |

### 5.5 Zustand 5

Zustand 用于前端状态管理，包括会话、工作台、设置、部署状态、Agent 状态等。

选择原因：

| 项目约束 | Zustand 的匹配点 |
| --- | --- |
| 状态分散在多个视图 | Store 可以按业务拆分 |
| 不需要 Redux 级别的复杂样板 | Zustand API 轻，接入成本低 |
| WebSocket 事件需要快速同步 UI | Store 更新直接驱动组件刷新 |

底层机制：

Zustand 本质是一个外部 Store。组件通过 selector 订阅自己关心的状态片段，当状态变化时只通知相关组件。对实时消息流和产物工作台来说，这比把所有状态塞进顶层 React state 更清晰。

好处：

- 会话列表、当前会话、右侧产物面板可以解耦。
- WebSocket 收到 `message:created`、`artifact:created`、`deploy:progress` 后可以集中更新。
- 后续扩展通知、主题、语言、移动端状态更容易。

### 5.6 Monaco Editor

Monaco Editor 用于代码产物查看、二次编辑和 Diff。

选择原因：

| 项目约束 | Monaco 的匹配点 |
| --- | --- |
| Agent 会生成 HTML、CSS、JS、TS、JSON 等代码 | Monaco 支持多语言高亮 |
| 需要代码二次编辑 | Monaco 提供成熟编辑能力 |
| 需要 Diff 和版本历史 | Monaco 生态适合实现代码对比 |

好处：

- 让代码产物从“只读消息”变成“可编辑工作对象”。
- 支持横向滚动、稳定尺寸、语法高亮和代码复制。
- 符合课题对代码编辑、Diff、版本历史的要求。

取舍：

- Monaco 体积比普通 textarea 大。
- 但代码编辑是本项目核心功能，选择专业编辑器是值得的。

### 5.7 React Flow

React Flow 用于工作流画布和任务流程可视化。

选择原因：

| 项目约束 | React Flow 的匹配点 |
| --- | --- |
| 工作流需要节点和边 | 原生支持节点、边、拖拽和画布 |
| 需要可视化任务流程 | 比手写 SVG 或 div 连线可靠 |
| 后续可能扩展条件、变量、Agent 节点 | React Flow 的节点模型可扩展 |

好处：

- 用户可以把工作流保存成命名流程，再在会话中引用。
- 适合展示“输入、处理、输出”的可视化结构。
- 与 PMO DAG 调度理念一致。

### 5.8 Framer Motion

Framer Motion 用于轻量动画，例如按钮状态、面板出现、图标反馈等。

选择原因：

- 项目需要有产品质感，但不希望出现夸张动画。
- Framer Motion 能提供细腻的透明度、位移、阴影变化。
- 与 React 组件模型兼容度高。

好处：

- 提升状态变化的可感知性。
- 让用户能感受到按钮 hover、Agent 状态、面板展开等反馈。
- 保持成熟 SaaS 风格，而不是“炫技式 AI 动效”。

## 6. 后端技术选型

### 6.1 Node.js + TypeScript + tsx

后端使用 Node.js 编写，开发时通过 `tsx` 运行 TypeScript 源码。

选择原因：

| 项目约束 | Node.js 的匹配点 |
| --- | --- |
| 前后端都使用 TypeScript | 降低语言切换成本 |
| 需要处理 WebSocket、HTTP API、外部 API 调用 | Node.js 非阻塞 IO 模型适合这类任务 |
| 需要快速迭代 Demo | `tsx` 可以直接运行 TS，减少构建步骤 |

好处：

- 前后端统一语言，便于共享类型。
- WebSocket、文件、SSH、HTTP 请求等生态成熟。
- 适合快速构建 AI 协作类中台服务。

取舍：

- CPU 密集型任务不适合直接在主进程执行。
- 本项目主要是 IO 密集型，包括模型请求、WebSocket 推送、数据库读写和部署命令，Node.js 是合理选择。

### 6.2 WebSocket `ws`

项目使用 `ws` 实现实时消息和任务事件推送。

选择原因：

| 项目约束 | WebSocket 的匹配点 |
| --- | --- |
| Agent 回复需要流式显示 | WebSocket 可以持续推送 chunk |
| 部署状态需要实时更新 | 进度、日志、成功/失败可以推送给当前会话 |
| 群聊需要多人同步 | 服务端房间广播可以同步所有在线成员 |

底层机制：

服务端维护 `conversationId -> WebSocket Set` 的房间映射。用户进入会话后加入房间，发送消息或任务事件时，服务端把事件广播给同房间客户端。这样消息、任务步骤、产物、部署进度都能在不刷新页面的情况下更新。

好处：

- 避免轮询带来的延迟和额外请求。
- Agent 执行过程更像真实协作，而不是刷新后才出现结果。
- 适合“消息流 + 任务状态 + 部署日志”这种多事件场景。

替代方案：

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| HTTP 轮询 | 实现简单 | 延迟高，请求多，体验不自然 |
| SSE | 适合单向流式输出 | 群聊双向交互和复杂事件管理较弱 |
| WebSocket | 双向实时，适合房间广播 | 需要维护连接、鉴权和断线处理 |

### 6.3 Prisma 7.8.0 + PostgreSQL

Prisma 是项目的数据访问层，PostgreSQL 是主要关系数据库。

选择原因：

| 项目约束 | Prisma + PostgreSQL 的匹配点 |
| --- | --- |
| 数据关系复杂 | 用户、工作区、会话、消息、任务、产物、知识库之间关系清晰 |
| 需要事务和索引 | PostgreSQL 适合可靠持久化 |
| 需要类型安全的数据访问 | Prisma 生成类型，减少 SQL 字段错误 |
| 后续可能扩展向量检索 | 数据模型预留 `vector(2048)` 字段 |

核心数据模型：

| 模型 | 作用 |
| --- | --- |
| `User`、`Session`、`Workspace`、`WorkspaceMember` | 用户、登录态和工作区 |
| `Conversation`、`Message`、`ConversationAgent` | 会话、消息和群聊内 Agent 状态 |
| `Job`、`JobEvent`、`Artifact` | PMO 任务、执行事件和产物 |
| `UserAgentConfig` | 用户自建 Agent 配置 |
| `KnowledgeBase`、`Document`、`Chunk` | 知识库、文档和切片 |
| `WorkspaceFile`、`FileEntity` | 工作区文件树和会话附件 |
| `McpServerConfig` | MCP server 配置 |

好处：

- 会话消息和 Agent 任务不会只停留在前端状态中，刷新后仍可恢复。
- JobEvent 能记录 Agent 执行过程，方便产物工作台同步任务进度。
- Artifact 把代码、网页、文档、PPT、部署结果从普通消息中独立出来，方便预览、编辑和部署。

取舍：

- Prisma 对非常复杂的 SQL 和特殊扩展字段需要配合 raw SQL。
- 但本项目更重视类型安全、开发效率和数据结构清晰，Prisma 更适合。

## 7. 多 Agent 编排技术

### 7.1 PMO Orchestrator

项目的多 Agent 协作核心在 `packages/server/src/orchestrator`。它不是简单地把消息转发给一个模型，而是把任务拆解成多个步骤，并按角色分配给不同 Agent。

执行流程：

```text
用户需求
  -> 简单任务判断
  -> 代码生成快速路径或完整 PMO 编排路径
  -> Researcher 调研
  -> Planner 拆解 steps + dependsOn
  -> Worker 执行步骤
  -> Critic 评审结果
  -> 不合格则重试
  -> Refiner 整合润色
  -> 生成 Artifact + 最终总结
```

选择这种设计的原因：

| 项目约束 | PMO 编排的好处 |
| --- | --- |
| 用户需求可能很复杂 | 主 Agent 可以先拆任务，而不是直接生成一大段答案 |
| 需要展示协作过程 | 每个步骤、每个角色、每个状态都能在 UI 中可视化 |
| 需要失败降级 | Critic 可以审查并触发重试 |
| 需要产物沉淀 | Orchestrator 可以统一收集代码、文档、PPT、部署结果 |

### 7.2 DAG 依赖调度

Planner 输出的步骤包含 `dependsOn`，Orchestrator 会按依赖关系执行。没有依赖冲突的一组任务会组成一个 wave，并通过 `Promise.all` 并行执行。

底层机制：

```text
remaining steps
  -> 找到 dependsOn 都已完成的步骤
  -> 组成当前 wave
  -> Promise.all 并行执行 wave
  -> 写入结果
  -> 继续下一轮
```

好处：

- 支持并行调度，符合课题要求。
- 任务之间有依赖，避免后置任务读取不到前置结果。
- 如果 DAG 死锁，可以显式报错，避免任务无限等待。

取舍：

- 当前是中心化调度，不是完全自治的 Agent-to-Agent 自发协商。
- 但对产品 Demo 来说，PMO 编排更可控、更容易解释，也更适合可视化。

### 7.3 Worker ReAct 工具循环

WorkerAgent 支持工具循环，模型可以按“思考、行动、观察、完成”的方式调用工具。

可用工具包括：

| 工具 | 作用 |
| --- | --- |
| `glob` | 搜索文件路径 |
| `grep` | 搜索文本内容 |
| `read_file` | 读取文件 |
| `write_file` | 生成文件 |
| `edit_file` | 修改文件 |
| `bash` | 执行本地命令 |
| `code` | 处理代码任务 |
| `search` | 外部搜索 |
| `web-fetch` | 获取网页内容 |
| `deploy` | 准备部署 |

好处：

- Agent 不只是聊天模型，而是可以调用工具完成任务。
- 适合代码生成、文件修改、部署准备等工程型任务。
- 工具调用失败时可以调整策略或进入 fallback。

### 7.4 Critic 评审与失败降级

CriticAgent 会对 Worker 的输出进行评分和问题反馈。如果结果不合格，Orchestrator 会把改进建议交给 Worker 重试。

好处：

- 避免一次生成失败后直接结束。
- 让“检查、重试、改进”成为系统流程，而不是靠用户手动追问。
- 能在答辩时体现失败降级和质量控制能力。

### 7.5 当前 multi-agent 能力边界

项目当前已经实现“PMO 编排式多 Agent 协作”，包括拆解、分派、并行、评审、重试和汇总。但它还不是完全自治的 Agent 社会。

已实现：

- 多角色 Agent。
- 主 Agent 调度。
- 按依赖并行执行。
- Critic 评审与重试。
- 自建 Agent 运行时配置。
- 群聊内 Agent 启用/静音和上下文过滤。

仍可继续增强：

- 增加 `delegate_to_agent` 工具，让主 Agent 在执行过程中显式调用某个群内 Agent。
- 给每个 Agent 独立记忆、独立工具权限和独立模型实例。
- 增加 Agent 间投票、辩论、仲裁机制。

这部分在答辩时建议表述为：

> AgentHub 已实现以 PMO 主 Agent 为中心的多 Agent 协作编排，并支持多个 Agent 平台和用户自建 Agent 接入；当前架构优先保证任务可控、过程可视和产物可交付，后续可以扩展为更自治的 Agent-to-Agent 协商模型。

## 8. 模型与 Agent 平台适配层

适配层位于 `packages/adapter`，统一封装不同模型和 Agent 平台。

支持类型：

| 类型 | 用途 |
| --- | --- |
| `openai` | OpenAI SDK 接入 |
| `generic-openai` | DeepSeek、火山方舟等 OpenAI 兼容 API |
| `codex` | Codex CLI 接入 |
| `claude-code` | Claude Code CLI 接入 |

选择 Adapter Pattern 的原因：

| 项目约束 | Adapter Pattern 的好处 |
| --- | --- |
| 不同平台 API/CLI 调用方式不同 | 统一成 `sendMessage`、`streamResponse`、`generateEmbedding` 等接口 |
| 用户可以自建 Agent | 每个 Agent 可以配置 provider、model、baseURL、apiKey、cliPath |
| 后续可能新增模型 | 新增适配器即可，不需要改业务层 |
| 部署环境和本地环境不同 | 可以通过环境变量或用户配置切换 |

好处：

- 业务代码不直接依赖某个供应商。
- 支持 DeepSeek 等 OpenAI 兼容模型时，只需要配置 Base URL 和 API Key。
- Codex CLI 和 Claude Code CLI 可以作为工程类 Agent 接入。

取舍：

- 抽象层会带来一定接口设计成本。
- 但 AgentHub 的目标就是多平台协作，适配层是必要的架构边界。

## 9. 会话与实时协作模块

会话模块是 AgentHub 的产品入口，包含会话列表、单聊、群聊、消息流、@Agent、成员管理、上下文篮子和任务触发。

关键设计：

| 功能 | 技术实现 |
| --- | --- |
| 会话列表 | `Conversation` 表持久化，前端 Store 维护当前筛选和选中项 |
| 消息流 | `Message` 表持久化，WebSocket 实时广播 |
| @Agent | 服务端解析 mention，并根据群内启用 Agent 过滤 |
| 群聊成员 | `participants` 与通讯录/邀请能力结合 |
| Agent 启用/静音 | `ConversationAgent.enabled` + `[AGENT_START]` / `[AGENT_END]` 边界 |
| 上下文过滤 | 多用户群聊中只把启用区间内内容交给 Agent |
| 消息操作 | 复制、引用、交给指定 Agent、加入上下文 |

为什么使用 WebSocket 而不是纯 HTTP：

- Agent 输出是连续过程，不是一次性结果。
- 任务执行有 plan、step、stream、artifact、deploy 等多种事件。
- 群聊中多个用户需要同时看到更新。

好处：

- 体验接近真实协作工具。
- 用户不需要刷新页面等待 Agent 结果。
- 产物工作台可以和会话消息保持联动。

## 10. 产物工作台模块

产物工作台是 AgentHub 和普通聊天机器人的关键区别。系统不把代码和文件仅仅作为聊天文本，而是抽象成 Artifact。

支持的产物类型：

| 产物 | 能力 |
| --- | --- |
| HTML 网页 | 内联卡片、右侧预览、一键部署 |
| 代码文件 | Monaco 查看、编辑、保存版本、Diff |
| Markdown/文档 | 渲染、下载、段落引用、交给 Agent 继续处理 |
| PPT/Slides | 浏览、PPTX 导出、下载 |
| 部署状态 | 进度、日志、成功 URL、失败原因 |
| 版本历史 | 保存不同版本，切换查看和比较 |
| 上下文引用 | 将片段加入上下文或指定 Agent 处理 |

选择 Artifact 模型的原因：

| 问题 | Artifact 模型的解决方式 |
| --- | --- |
| 代码混在聊天里难以编辑 | 代码进入独立卡片和 Monaco 编辑器 |
| 多次生成 `index.html` 容易混淆 | 通过 topic、filename、artifactId 和去重逻辑聚合 |
| 部署结果和部署中状态分裂 | 使用同一张部署卡片 upsert 状态 |
| 用户想继续修改产物 | Artifact 可以被引用、编辑、Diff 和重新部署 |

好处：

- 满足课题“内联产物预览、编辑、二次交互和部署”的要求。
- 让 Agent 输出从“答案”变成“可操作工作对象”。
- 右侧工作台可以围绕当前话题同步产物，减少上下文混乱。

## 11. 部署模块技术选型

部署模块采用 Provider Pattern。不同部署方式都实现统一的 `IDeployProvider` 接口。

当前 provider：

| Provider | 作用 |
| --- | --- |
| `local-preview` | 生成本地/服务端可预览 URL |
| `self-hosted` | 通过 SSH 部署到默认服务器或用户自有服务器 |
| `vercel` | 调用 Vercel API 部署 |
| `miaoda` | 调用 Miaoda Webhook 部署 |
| `static-download` | 生成静态源码包下载 |
| `container-package` | 生成 Dockerfile、Nginx 配置和容器化部署包 |

选择 Provider Pattern 的原因：

| 项目约束 | Provider Pattern 的好处 |
| --- | --- |
| 部署平台不止一个 | 每个平台独立实现，界面和调用层保持统一 |
| 有些平台需要密钥，有些不需要 | provider 内部负责读取环境变量和校验 |
| 部署过程需要实时进度 | 统一 `onProgress(progress, log)` 回调 |
| 需要失败原因可见 | 每个 provider 返回结构化 logs 和 error |

Self-hosted 部署的关键流程：

```text
选择产物
  -> 写入临时部署目录
  -> 打包 tar.gz
  -> scp 上传服务器
  -> ssh 解压到目标目录
  -> 可选执行 post deploy command
  -> 验证公网 URL
  -> 更新部署卡片
```

安全设计：

- `.env.local`、API Key、SSH 私钥和服务器部署密钥不提交到仓库。
- 默认服务器依赖 `SELF_HOSTED_SSH_HOST`、`SELF_HOSTED_SSH_USER`、`SELF_HOSTED_SSH_KEY`、`SELF_HOSTED_PUBLIC_URL` 等环境变量。
- 用户自有服务器部署目标可以单独配置，并通过连接测试验证。

好处：

- 答辩演示时可以直接把网页产物发布到服务器。
- 用户没有第三方平台账号时，也可以使用默认服务器。
- 如果 Vercel 或 Miaoda 未配置，系统能展示真实失败原因，而不是假装成功。

## 12. 知识库与文件模块

知识库和文件模块用于把项目资料、需求文档、开发记录、截图说明等沉淀为可检索上下文。

技术实现：

| 模块 | 实现方式 |
| --- | --- |
| 文件中心 | `WorkspaceFile` 管理文件树，支持文件夹、文本文件、上传、编辑和搜索 |
| 会话附件 | `FileEntity` 记录会话中的上传文件 |
| 知识库 | `KnowledgeBase`、`Document`、`Chunk` 组织资料 |
| 文档处理 | 文件解析后切片，保留 sectionTitle、chunkIndex、prev/next 关系 |
| 检索 | 支持关键词检索，并预留 embedding 能力和向量字段 |

为什么选择“文件中心 + 知识库”双模块：

| 文件中心 | 知识库 |
| --- | --- |
| 更像网盘，负责保存和编辑原始资料 | 更像 RAG 数据源，负责切片和检索 |
| 适合用户整理项目资料 | 适合 Agent 引用资料回答和生成文档 |
| 关注文件树和操作 | 关注可检索内容和引用片段 |

好处：

- 用户可以先上传资料，再选择沉淀到知识库。
- Agent 后续可以引用文档片段继续处理。
- 适合提交课题背景、产品文档、技术文档和 AI 协作记录。

当前取舍：

- 知识库已经具备切片和检索基础能力。
- 向量检索能力在数据模型和适配器层预留，但需要根据实际 embedding 模型维度做进一步稳定化。

## 13. 工作流与 MCP 模块

### 13.1 工作流

工作流模块用于保存可复用的任务流程。项目后期将工作流从“独立页面执行”调整为“在会话输入框中引用”，更符合用户习惯。

选择这种方式的原因：

- 用户真正发起任务的地方是会话，不是工作流页面。
- 工作流如果脱离会话上下文，会不知道结果应该发送到哪个会话。
- 在会话中引用工作流，可以天然继承当前话题、当前成员和当前 Agent 状态。

好处：

- 工作流变成“可复用提示和流程模板”。
- 每个会话可以按需引用，不会造成跨会话串台。
- 更符合“聊天即入口”的产品定位。

### 13.2 MCP

MCP 模块用于配置外部工具服务，让 AgentHub 后续可以接入更多工具能力。

技术设计：

| 能力 | 实现 |
| --- | --- |
| MCP 配置 | `McpServerConfig` 保存 name、protocol、command、url、env、status |
| 连接状态 | 支持 connected/disconnected 状态记录 |
| 工具列表 | 连接后可查看服务暴露的工具 |

为什么保留 MCP：

- AgentHub 的长期目标不是只调用模型，而是让 Agent 能使用外部工具。
- MCP 是当前 AI 工具生态中较通用的工具连接协议。
- 即使当前 Demo 以会话和产物为主，MCP 也为后续扩展数据库、浏览器、代码仓库、文档系统留出接口。

## 14. 自建 Agent 模块

自建 Agent 是项目满足“用户自建 Agent”和“多平台接入”的关键模块。

支持配置：

| 配置项 | 作用 |
| --- | --- |
| 名称、头像、能力标签 | 在会话和智能体列表中展示 |
| provider | openai、generic-openai、codex、claude-code、inherit 等 |
| model | 指定模型名称 |
| baseURL | OpenAI 兼容接口地址 |
| apiKey | 私有模型密钥，服务端加密存储或环境配置 |
| cliPath | Codex/Claude Code CLI 路径 |
| systemPrompt | 定义该 Agent 的角色和行为边界 |
| permissions/tools | 限制该 Agent 可用工具范围 |

为什么这样设计：

- 不同用户可能有不同模型资源。
- DeepSeek、火山方舟等都可以通过 OpenAI 兼容协议接入。
- Codex CLI 和 Claude Code CLI 更适合代码类任务。
- 用户自建 Agent 不应写死在代码里，而应该由数据库配置驱动。

好处：

- 同一个群聊可以包含不同能力的 Agent。
- 用户可以把自己的模型 API 接入项目。
- 系统可以根据配置选择运行时 adapter。

## 15. 设置、帮助与移动端

设置页承担运行环境可见性，包括模型 API、默认服务器、主题、语言、团队邀请、运行自检等。

为什么设置页重要：

- AgentHub 很多能力依赖环境变量或外部平台。
- 如果配置缺失，用户需要明确知道是“没配置”而不是“系统坏了”。
- 答辩前可以通过自检确认后端、模型、部署服务器和工作区状态。

帮助页用于把使用流程、常见问题、部署说明、Agent 协作机制解释给用户。

移动端定位为“遥控器”，不是完整工作台：

| 桌面端 | 移动端 |
| --- | --- |
| 完整工作台、代码编辑、预览、部署、Diff、设置 | AI 助手、会话查看、消息发送、任务确认 |
| 面向深度操作 | 面向轻量确认 |
| 类似电视机 | 类似遥控器 |

这种取舍的好处：

- 避免在手机小屏上强行塞入复杂代码编辑和部署面板。
- 保留最常用的消息与确认能力。
- 更符合真实用户在移动端的使用习惯。

## 16. 质量保障技术

项目提供以下质量检查脚本：

```bash
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm run smoke:acceptance
```

各工具作用：

| 工具 | 作用 |
| --- | --- |
| ESLint | 检查代码风格和潜在错误 |
| TypeScript | 检查前后端类型一致性 |
| Jest | 单元测试任务分类、部署 provider、消息解析、Agent 路由等 |
| Playwright | 验证关键 UI 流程和截图 |
| Smoke Script | 演示前检查前端、后端和核心接口 |

选择这些工具的原因：

- ESLint 和 TypeScript 负责静态质量。
- Jest 负责核心业务逻辑的稳定性。
- Playwright 和 smoke test 负责演示前的真实可用性。
- 对一个 AI 协作 Demo 来说，最怕“演示时突然不可用”，所以 smoke test 很关键。

## 17. 项目技术优势总结

### 17.1 架构完整

项目不是单页聊天 Demo，而是覆盖了前端工作台、后端编排、数据库持久化、Agent 适配、产物工作台和部署链路。

### 17.2 协作闭环明确

从用户发消息到 PMO 拆解，再到 Agent 执行、产物生成、预览编辑、部署发布，形成完整闭环。

### 17.3 可扩展性较好

通过 Monorepo、共享类型、Adapter Pattern、Deploy Provider Pattern 和 Prisma 数据模型，后续新增 Agent、部署平台、产物类型和工具服务都比较自然。

### 17.4 产品体验贴近真实 SaaS 工具

界面采用三栏/四栏工作台结构，减少装饰性“AI 味”，强调会话、任务、产物和部署状态的可操作性。

### 17.5 对外部环境状态保持诚实

未配置 Vercel、Miaoda、模型 API 或 CLI 时，系统显示真实配置状态，不伪造成功结果。默认服务器、模型 API 和部署密钥通过服务器环境变量配置，不进入仓库。

## 18. 当前局限与后续优化方向

| 局限 | 后续方向 |
| --- | --- |
| 当前多 Agent 是 PMO 中心化编排，不是完全自治协商 | 增加 `delegate_to_agent` 工具和 Agent 间调用协议 |
| 自建 Agent 还可以进一步细化工具权限 | 为每个 Agent 建立独立工具白名单和执行审计 |
| 知识库向量检索仍需稳定模型维度和迁移策略 | 增加 embedding 维度检测、重建索引和引用来源高亮 |
| 部署生产化能力还有提升空间 | 引入 HTTPS、域名、对象存储、部署回滚和日志归档 |
| 多人协作通知仍可增强 | 增加邀请通知、入群通知、Agent 状态变更通知和未读提醒 |

## 19. 适合答辩时的技术表述

可以这样介绍项目：

> AgentHub 是一个以会话为入口的多 Agent 协作工作台。前端使用 Next.js、React、TypeScript、Tailwind、Zustand、Monaco 和 React Flow 构建工作台体验；后端使用 Node.js、WebSocket、Prisma 和 PostgreSQL 实现消息、任务、产物和知识库持久化；Agent 层通过 PMO Orchestrator 把复杂需求拆成 DAG 任务，按 Planner、Researcher、Worker、Critic、Refiner 等角色执行，并通过 OpenAI 兼容 API、Codex CLI、Claude Code CLI 和用户自建 Agent 适配层接入不同智能体能力。系统把 Agent 输出沉淀为 Artifact，支持网页、代码、文档、PPT、Diff、版本历史和部署状态卡片，实现从需求沟通到产物交付的闭环。

如果老师追问“为什么这样选技术”，可以回答：

> 本项目的核心难点不是单一页面开发，而是复杂协作链路的统一建模。Next.js 和 React 负责快速构建可维护工作台，TypeScript 和 shared package 保证前后端协议一致，WebSocket 保证 Agent 流式输出和部署状态实时同步，Prisma 和 PostgreSQL 保证会话、任务、产物持久化，Adapter Pattern 保证不同模型和 Agent 平台可插拔，Deploy Provider Pattern 保证不同部署目标可以统一接入。这样设计的好处是功能闭环完整、扩展边界清晰、演示过程可解释、后续升级空间比较大。

