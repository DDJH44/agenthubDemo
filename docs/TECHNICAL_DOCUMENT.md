# AgentHub 技术文档

## 1. 架构目标

AgentHub 的技术架构围绕三个目标设计：

1. 以会话为中心，保证用户消息、Agent 回复、任务进度和产物工作台在同一个上下文中流转。
2. 以统一适配层接入不同模型和 Agent 平台，避免把某个供应商能力写死到业务组件中。
3. 以可操作产物为核心，把代码、网页、文档、PPT、Diff、版本和部署状态作为后续编辑与二次交互的对象。

## 2. 技术栈

| 层级 | 技术 |
| --- | --- |
| Web 应用 | Next.js 16、React 19、TypeScript |
| UI 与交互 | Tailwind CSS 4、Framer Motion、Monaco Editor、React Flow |
| 状态管理 | Zustand、本地持久化 store、WebSocket 事件同步 |
| 服务端 | Node.js、tsx、HTTP API、WebSocket |
| 数据库 | Prisma、PostgreSQL、pgvector 向量字段 |
| Agent 适配 | OpenAI SDK、OpenAI 兼容接口、Codex CLI、Claude Code CLI、自建 Agent 配置 |
| 文件与知识库 | 本地文件存储、知识库切片、关键词/向量检索降级 |
| 部署 | 默认服务器 SSH 发布、自有服务器目标、Vercel、Miaoda、静态源码包、容器化部署包、本地预览 URL |
| 验证 | ESLint、TypeScript、Jest、Playwright、smoke script |

## 3. 仓库结构

| 路径 | 说明 |
| --- | --- |
| `src/app` | Next.js 应用入口、登录页和主工作台装配 |
| `packages/frontend` | 工作台 UI、聊天、右侧产物面板、设置、知识库、文件、工作流、移动端视图 |
| `packages/server` | HTTP API、WebSocket 网关、Agent 编排、部署服务、知识库、MCP 和数据库仓储 |
| `packages/adapter` | 模型与 Agent 平台适配层 |
| `packages/shared` | 前后端共享类型、消息协议、Agent/工作流/产物类型 |
| `scripts/acceptance-smoke.mjs` | 核心页面和后端健康检查 |
| `docs` | 产品说明、架构说明、AI 协作记录和提交材料 |

## 4. 前端模块

| 模块 | 责任 |
| --- | --- |
| `src/app/page.tsx` | 主工作台入口，负责桌面/移动端布局、动态加载各功能视图、连接会话发送逻辑 |
| `src/app/login/page.tsx` | 登录、注册和品牌入口 |
| `src/features/chat` | 会话列表、消息流、输入框、@ 智能体、上下文篮子、部署卡片、右侧产物工作台 |
| `src/features/views/AIAssistantView.tsx` | AI 智能助手，支持文件/图片上传、文档产物和轻量问答 |
| `src/features/views/MyAgentsView.tsx` | 自建 Agent 创建、编辑、连接测试和 LLM/CLI 配置 |
| `src/features/views/AgentsView.tsx` | 主 Agent、Codex、Claude Code、自建 Agent 联系人和连接健康展示 |
| `src/features/views/KnowledgeView.tsx` | 知识库创建、资料上传、切片状态、片段检索 |
| `src/features/views/FilesView.tsx` | 文件夹、文本文件、上传、编辑、搜索、加入知识库 |
| `src/features/views/WorkflowsView.tsx` | 工作流模板、画布、运行记录、保存为会话可引用工作流 |
| `src/features/views/ContactsView.tsx` | 通讯录、联系人添加、成员邀请、入站邀请处理 |
| `src/features/views/SettingsView.tsx` | 模型 API、默认服务器、运行自检、主题语言和团队设置 |
| `src/features/mobile/MobileRemoteView.tsx` | 手机端轻量遥控器视图 |
| `src/stores` | 会话、工作台、Agent、设置、导航、部署状态等 Zustand store |

## 5. 服务端模块

| 模块 | 责任 |
| --- | --- |
| `src/ws/gateway.ts` | WebSocket 鉴权、会话房间、消息发送、Agent 启用/静音、任务触发、部署卡片 upsert |
| `src/orchestrator` | PMO 编排、任务拆解、子 Agent 执行、失败复核、产物生成 |
| `src/agents` | Planner、Worker、Critic、Researcher、Refiner、路由匹配和运行时配置 |
| `src/api` | Auth、用户、团队邀请、部署目标、自建 Agent、知识库、文件、MCP、记忆接口 |
| `src/deploy` | Vercel、Miaoda、静态源码包、容器包、本地预览、自托管 SSH 部署 provider |
| `src/db/repositories` | 用户、会话、消息、任务、产物、知识库、文件、MCP、自建 Agent 等数据访问 |
| `src/knowledge` | 文件解析、切片、入库、混合检索和检索降级 |
| `src/mcp` | MCP server 配置、连接、断开和工具列表 |

## 6. 数据模型

核心 Prisma 模型包括：

- `User`、`Session`、`Workspace`、`WorkspaceMember`：用户、登录态和工作区。
- `Conversation`、`Message`、`ConversationAgent`、`ConversationGroup`：会话、消息、群聊智能体状态和会话分组。
- `Job`、`JobEvent`、`Artifact`：PMO 任务、执行事件和产物。
- `UserAgentConfig`：用户自建 Agent 的模型、CLI、权限和状态。
- `KnowledgeBase`、`Document`、`Chunk`：知识库、文档和切片。
- `WorkspaceFile`、`FileEntity`：工作区文件树和会话附件。
- `McpServerConfig`：MCP server 配置。

消息表保留 `mentions`、`payload` 和向量字段，便于支持 @ 智能体、产物卡片、上下文引用和后续检索。

## 7. Agent 调度模型

AgentHub 的协作模型分为三层：

```text
User Message
  -> PMO Main Agent
  -> Task Decomposition
  -> Agent Dispatch
  -> Parallel Execution / Fallback
  -> Artifact Collection
  -> Chat Response + Workspace Preview
```

- PMO 负责理解需求、拆分步骤、选择子 Agent 和汇总结果。
- Codex 侧重代码生成、代码编辑、Diff 和版本产物。
- Claude Code 侧重失败降级、冲突复核和接管策略，真实执行依赖 CLI 可用性。
- 自建 Agent 由用户配置模型、提示词、工具权限和运行方式，可以参与群聊和任务执行。

## 8. 多用户上下文过滤

当群聊中真实用户数量大于等于 2 时，系统提供智能体启用/静音能力：

```text
Free Discussion
  -> owner enables agents
  -> [AGENT_START]
  -> scoped task discussion
  -> owner mutes agents
  -> [AGENT_END]
  -> Free Discussion
```

- `ConversationAgent.enabled` 记录每个会话中的智能体状态。
- 服务端写入内部边界消息 `[AGENT_START]`、`[AGENT_END]`。
- Agent 上下文读取时只保留启用区间内的消息。
- 前端渲染时隐藏边界标记，让用户看到正常消息流。
- 群主以外成员不能切换全局智能体启用状态。

## 9. 产物链路

产物不是普通附件，而是可以继续编辑、引用和部署的工作对象：

```text
Agent Response
  -> Artifact Card in Chat
  -> Workspace Store
  -> Preview / Code / Diff / Slides / History / Deploy / Context
  -> User Edit or Reference
  -> Back to Agent Context
```

支持的典型产物：

- HTML 网页预览。
- 代码卡片和 Monaco 编辑。
- Markdown/文档渲染、段落引用、Markdown/Word/PDF 下载。
- PPT/PPTX 浏览和 PPTX 下载。
- Diff 对比和应用。
- 版本历史。
- 部署状态卡片。

右侧工作台按会话和话题聚合产物，避免多个 `index.html` 互相混淆。

## 10. 部署链路

部署统一走 provider 接口：

```text
Select Artifact
  -> Choose Provider
  -> Build / Upload / Publish
  -> Upsert Deploy Card
  -> Logs and Progress
  -> Public URL or Failure Reason
```

当前 provider：

- `self-hosted`：默认服务器或用户自有服务器 SSH 静态部署。
- `local-preview`：生成可访问预览 URL。
- `static-download`：源码包下载。
- `container-package`：容器化部署包。
- `vercel`：Vercel API 部署，依赖 `VERCEL_TOKEN`。
- `miaoda`：Miaoda Webhook 部署，依赖对应 Webhook 或 Token。

默认服务器环境变量：

- `SELF_HOSTED_SSH_HOST`
- `SELF_HOSTED_SSH_USER`
- `SELF_HOSTED_SSH_KEY`
- `SELF_HOSTED_PUBLIC_URL`
- `SELF_HOSTED_SSH_PORT`
- `SELF_HOSTED_DEPLOY_PATH`
- `SELF_HOSTED_POST_DEPLOY_COMMAND`

真实 Key、SSH 私钥和部署密钥只放服务器环境，不进入源码仓库。

## 11. 知识库、文件与工作流

- 文件中心用于保存上传文件、生成产物草稿和可编辑文本资料。
- 知识库用于把文本类资料解析成切片，支持检索和 Agent 引用。
- 文件可以一键沉淀到知识库。
- 工作流可以保存为命名流程，在会话输入框中引用，并随当前会话上下文发送给后端。
- MCP 页面用于配置外部工具服务，连接后可以查看工具列表。

## 12. 移动端策略

移动端不是完整工作台，而是轻量遥控器：

- 保留 AI 助手、会话查看、发消息和确认执行。
- 复杂的代码编辑、预览、部署和版本管理留在桌面端。
- 对旧移动浏览器缺少 `crypto.randomUUID` 的情况使用兼容 ID 生成方式，避免白屏。

## 13. 质量保障

推荐提交前执行：

```bash
npm run lint
npm run typecheck
npm run test -- --runInBand
npm run smoke:acceptance
```

文档-only 改动至少执行：

```bash
git diff --check
git status --short
```

## 14. 当前技术风险

- Codex / Claude Code 真实可用性依赖服务器 CLI、权限和运行路径，需要持续通过健康检查暴露状态。
- 长会话上下文会带来 token 成本和信息污染，需要进一步做摘要、锁定和预算提示。
- 代码编辑与 Diff 应用后需要更完整的冲突检测，避免覆盖用户修改。
- 自托管部署目前适合轻量静态产物，生产环境还需要 HTTPS、域名、对象存储、日志和密钥托管。
- 知识库向量维度和模型切换需要迁移策略，避免旧数据与新 embedding 维度不一致。
