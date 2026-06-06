# AgentHub

AgentHub 是一个面向多 Agent 协作的软件生成工作台。它以会话为入口，让 PMO 主 Agent 拆解复杂任务，并调度 Codex、Claude Code、Open Code 和用户自建 Agent 完成网页、文档、PPT、代码、预览、Diff、版本历史与部署。

## 快速启动

先启动数据库与缓存：

```bash
docker compose up -d postgres redis
```

再启动前端和后端：

```bash
npm run dev:all
```

本地默认地址：

- 前端工作台：http://localhost:3000
- 后端健康检查：http://localhost:3002/api/health

如果只启动后端：

```bash
npm run dev:server
```

## 结题演示主线

1. 登录 AgentHub，进入工作台。
2. 打开会话页，展示单聊、群聊、会话列表、成员与 Agent 标签。
3. 在群聊中发起任务，让 PMO 拆解并调度多个 Agent。
4. 展示消息流里的文字回复、代码卡片、部署状态卡片。
5. 打开右侧产物工作台，演示预览、代码、Diff、PPT、历史、部署、上下文。
6. 打开我的智能体，展示自建 Agent 和 LLM 配置能力。
7. 打开设置页，使用“结题演示自检”确认后端、模型、部署服务器和工作区状态。

详细脚本见 [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)，最终检查清单见 [docs/final-acceptance-checklist.md](docs/final-acceptance-checklist.md)。

## 常用检查

```bash
npm run lint
npm run typecheck
npm run build
npm run smoke:acceptance
```

`smoke:acceptance` 默认检查 `http://localhost:3000` 和 `http://localhost:3002`，也可以通过环境变量覆盖：

```bash
APP_URL=http://localhost:3000 API_URL=http://localhost:3002 npm run smoke:acceptance
```

## 环境变量

真实密钥只放在本地 `.env.local` 或部署平台密钥配置中，不提交到仓库。模板见 `.env.example`。

重点变量：

- `DATABASE_URL`：PostgreSQL / pgvector 数据库连接。
- `REDIS_URL`：Redis 连接。
- `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`：默认大模型配置。
- `SELF_HOSTED_SSH_HOST` / `SELF_HOSTED_SSH_USER` / `SELF_HOSTED_SSH_KEY` / `SELF_HOSTED_PUBLIC_URL`：AgentHub 默认部署服务器。
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`：前端访问后端和 WebSocket 的地址。

## 隐私与提交规则

- 不提交 `.env.local`、私钥、部署输出、数据库文件、日志和临时截图。
- `.gitignore` 已忽略 `.env*`、`deploy-output/`、`packages/server/deploy-output/`、`tmp_*`、`logs/` 等临时内容。
- 提交前建议运行一次隐私扫描，确认没有真实 API Key、SSH 私钥或本地数据库进入暂存区。

## 文档入口

- [产品规格](docs/SPEC.md)
- [架构说明](docs/ARCHITECTURE.md)
- [演示脚本](docs/DEMO_SCRIPT.md)
- [自托管部署](docs/self-hosted-deployment.md)
- [Vercel 生产部署](docs/vercel-production-deployment.md)
