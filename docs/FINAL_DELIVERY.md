# AgentHub 提交材料说明

本文档用于整理 AgentHub 当前仓库中的提交材料，说明每份文档对应的内容、运行方式、配置边界和隐私规则。文档内容已按当前项目实现同步，不包含已经移除的功能口径。

## 1. 材料清单

| 材料 | 当前项目对应内容 |
| --- | --- |
| 代码仓库 | Gitee：`https://gitee.com/yellow-family-hero/agenthub`；GitHub 镜像按需要同步 |
| 产品说明 | `docs/SPEC.md` |
| 技术架构说明 | `docs/ARCHITECTURE.md` |
| AI 协作开发记录 | `docs/AI_COLLABORATION.md` |
| 3 分钟流程讲稿 | `docs/DEMO_SCRIPT.md` |
| 提交前检查清单 | `docs/final-acceptance-checklist.md` |
| 自托管部署说明 | `docs/self-hosted-deployment.md` |
| Vercel 部署说明 | `docs/vercel-production-deployment.md` |

## 2. 项目简介

AgentHub 是一个面向多 Agent 协作的软件生成工作台。项目以 IM 会话为入口，支持单聊、群聊、PMO 主 Agent 调度、多 Agent 协作、产物预览编辑、代码 Diff、版本历史、上下文引用、知识库、文件中心、工作流引用和部署状态展示。

一句话总结：

> AgentHub 让用户像在群聊里协作一样，把需求交给 PMO 主 Agent 拆解，再调度 Codex、Claude Code 和自建 Agent 完成从需求到产物、预览、编辑和部署的闭环。

## 3. 当前核心使用流程

1. 用户登录 AgentHub，进入工作台。
2. 用户创建单聊或群聊，并邀请真实用户或智能体成员。
3. 群聊中默认允许真人自由讨论，智能体处于静音状态。
4. 当群聊真实用户数量大于等于 2 时，群主可以启用智能体；系统只把启用区间内的内容交给 Agent。
5. PMO 主 Agent 拆解任务，并把子任务派给代码、设计、检查或部署相关 Agent。
6. Agent 在消息流中输出说明文字，代码、网页、文档、PPT、Diff 和部署结果进入专用卡片。
7. 用户在右侧产物工作台查看预览、代码、Diff、PPT、历史、部署和上下文。
8. 用户可引用消息、文档段落、代码片段或已保存工作流，继续交给指定智能体处理。
9. 用户确认产物后触发部署，系统在同一张部署卡片中展示进度、日志、失败原因或访问链接。

## 4. 课题要求对应关系

| 课题要求 | AgentHub 对应实现 |
| --- | --- |
| 对话列表 | 左侧会话列表支持搜索、置顶、归档、单聊和群聊标签 |
| 单聊模式 | 支持 AI 智能助手、Codex、Claude Code、自建 Agent 单聊 |
| 群聊模式 | 支持真实用户 + PMO 主 Agent + 多个执行 Agent 协作 |
| 部署状态卡片 | 消息流和产物工作台展示部署准备、部署中、成功、失败和访问链接 |
| 主 Agent 概念 | PMO 主 Agent 负责理解需求、拆解任务、调度、汇总和失败降级 |
| 多 Agent 接入 | 内置 Codex CLI、Claude Code CLI 入口，并支持用户自建 Agent |
| 自建 Agent | 用户可创建自定义名称、能力标签、系统提示词、模型、Base URL、API Key 和 CLI 路径 |
| 产物预览与编辑 | 支持网页预览、代码编辑、Diff、版本历史、PPT/文档展示和下载 |
| 二次交互 | 支持消息引用、上下文添加、工作流引用、文档段落引用和指定 Agent 处理 |
| 多用户协作 | 群聊中 2 个及以上真实用户时提供群主启用/静音智能体和上下文过滤 |

## 5. 技术架构简介

| 层级 | 说明 |
| --- | --- |
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS、Zustand |
| 实时通信 | WebSocket 负责消息、Agent 状态、任务状态和部署状态同步 |
| 服务端 | Node.js、HTTP API、WebSocket 网关、Agent 编排、部署服务 |
| 数据层 | Prisma、PostgreSQL、pgvector、本地文件存储 |
| Agent 适配 | OpenAI 兼容接口、Codex CLI、Claude Code CLI、DeepSeek、自建 LLM API |
| 产物工作台 | 将 Agent 回复中的代码、文档、PPT、预览 URL、部署状态转为可操作产物 |
| 部署链路 | 默认服务器、自有服务器、预览 URL、静态源码包、容器化部署包、Vercel、Miaoda |

更详细的技术说明见 `docs/ARCHITECTURE.md`。

## 6. AI 协作开发记录

AI 协作开发记录见 `docs/AI_COLLABORATION.md`。该文档重点说明以下内容：

- 如何从课题要求拆解出会话、主 Agent、多 Agent、产物工作台、部署和上下文管理。
- 如何根据用户反馈持续调整 UI、会话体验、产物展示、部署链路和自建 Agent。
- 如何处理消息串台、代码卡片过小、产物不同步、部署状态分裂、移动端兼容等问题。
- 如何通过提交记录、检查命令、隐私扫描和远端推送保持开发过程可追溯。

## 7. 本地运行方式

```bash
docker compose up -d postgres redis
npm run dev:all
```

默认访问地址：

- 前端工作台：`http://localhost:3000`
- 后端健康检查：`http://localhost:3002/api/health`

常用验证命令：

```bash
npm run lint
npm run typecheck
npm run test -- --runInBand
npm run smoke:acceptance
```

## 8. 部署与配置边界

- 模型 API、默认服务器、部署密钥和 CLI 路径都通过本地或服务器环境变量配置。
- Codex / Claude Code 的真实执行依赖服务器安装对应 CLI，并通过健康检查展示可用状态。
- 默认服务器部署依赖 `SELF_HOSTED_SSH_HOST`、`SELF_HOSTED_SSH_USER`、`SELF_HOSTED_SSH_KEY`、`SELF_HOSTED_PUBLIC_URL`。
- Vercel 和 Miaoda 需要各自平台密钥或 Webhook，未配置时显示明确的待配置或失败原因。
- 当前默认服务器部署适合轻量静态产物；正式生产环境建议拆分前端、后端、数据库、对象存储、HTTPS 和密钥托管。

## 9. 隐私与提交规则

提交仓库前必须确认：

- 不提交 `.env.local`、`.env`、真实 API Key、SSH 私钥。
- 不提交部署输出、数据库文件、日志、临时截图。
- 仓库只保留 `.env.example` 中的环境变量名称和示例说明。
- 服务器上的 `.env` 保留在服务器环境中，不进入 Git。
- 默认服务器、模型 API、部署密钥都只在服务器环境或本地环境中配置。

## 10. 推荐讲解顺序

1. 登录页和工作台：说明 AgentHub 是多 Agent 协作 IM 工作台。
2. 会话列表和群聊：展示单聊、群聊、真实成员、Agent 成员和群主启用/静音。
3. 发送任务：展示 PMO 拆解、Agent 执行、消息正文和代码/文档/PPT 卡片。
4. 产物工作台：展示预览、代码编辑、Diff、版本历史、上下文和部署。
5. 我的智能体与设置：展示自建 Agent、模型配置、默认服务器、运行自检。
6. 知识库、文件、工作流：展示资料沉淀和会话引用能力。
