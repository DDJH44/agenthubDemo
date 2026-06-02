# AgentHub Architecture

## 1. 技术栈

| 层级 | 技术 |
| --- | --- |
| Web 应用 | Next.js 16、React 19、TypeScript |
| UI 与交互 | Tailwind CSS 4、Framer Motion、Monaco Editor、React Flow |
| 状态管理 | Zustand |
| 服务端 | Node.js、tsx、WebSocket |
| Agent 适配 | OpenAI SDK、Generic OpenAI、Claude Code、Codex 适配器 |
| 数据与共享类型 | `packages/shared`、本地 store、演示数据 |
| 验证 | ESLint、TypeScript、Jest、acceptance smoke script |

## 2. 仓库结构

| 路径 | 说明 |
| --- | --- |
| `packages/frontend` | Next.js 前端，包含工作台 UI、聊天、Agent 页面、产物面板 |
| `packages/server` | WebSocket 服务和 Agent 请求入口 |
| `packages/adapter` | 多模型/多 Agent 平台适配层 |
| `packages/shared` | 前后端共享类型和协议 |
| `scripts/acceptance-smoke.mjs` | 验收演示数据冒烟检查 |
| `docs` | 产品、架构、AI 协作和答辩材料 |

## 3. 前端模块

| 模块 | 责任 |
| --- | --- |
| `src/app/page.tsx` | 主工作台入口 |
| `src/app/login/page.tsx` | 登录与品牌入口 |
| `src/features/chat` | 聊天主界面、消息流、会话列表、输入区 |
| `src/features/workspace` | 右侧工作台，承载预览、代码、Diff、部署、上下文 |
| `src/features/views` | Agent 页面、任务页面、验收指南等 |
| `src/features/demo/acceptance-demo.ts` | 注入答辩演示会话、消息、Agent、产物和部署状态 |
| `src/stores` | 会话、Agent、工作台、导航等 Zustand store |

## 4. Agent 调度模型

AgentHub 的产品模型分为三层：

1. 用户层：用户在单聊或群聊中提出需求。
2. PMO 层：主 Agent 解析需求、拆任务、选择子 Agent、跟踪状态。
3. 执行层：Codex、Claude Code、Open Code、自建 Agent 等执行具体任务。

简化流程：

```text
User Message
  -> PMO Main Agent
  -> Task Decomposition
  -> Agent Dispatch
  -> Parallel Execution / Fallback
  -> Artifact Collection
  -> Chat Response + Workspace Preview
```

## 5. 产物链路

产物在系统里不是普通附件，而是可以继续编辑和引用的工作对象。

```text
Agent Response
  -> Artifact Card in Chat
  -> Workspace Store
  -> Preview / Code / Diff / Slides / History / Deploy Panel
  -> User Edit or Reference
  -> Back to Agent Context
```

支持的典型产物：

- HTML 网页预览。
- Markdown / 文档渲染。
- PPT 浏览。
- 代码编辑。
- Diff 对比和应用。
- 版本历史。
- 部署状态卡片。

## 6. 适配器层

`packages/adapter` 负责屏蔽不同模型或 Agent 平台差异。当前项目中按统一接口组织：

- OpenAI 兼容模型。
- Generic OpenAI 兼容服务。
- Claude Code。
- Codex。

Open Code 在前端 Agent 联系人和验收演示中作为主流 Agent 平台概念展示，后续可以继续补齐真实执行适配器。

运行时相关环境变量只应写在本地 `.env` 或部署平台密钥中：

- `ADAPTER_TYPE`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `LLM_MODEL`

真实 Key 和 Endpoint 不写入源码、不写入文档、不进入 Git 提交。

## 7. 上下文管理

上下文管理服务于“二次交互”：

- 用户可以把消息加入上下文。
- 文档段落、代码片段、Diff 结果可以作为引用交给 Agent。
- 右侧 Context 面板统一显示当前会话的引用材料。
- PMO 在调度时可以基于上下文选择更合适的子 Agent。

后续可以继续增加上下文锁定、引用过期、上下文裁剪和 token 预算提示。

## 8. 部署链路

部署链路在产品中以状态卡片和右侧 Deploy 面板呈现：

```text
Select Artifact
  -> Choose Platform
  -> Build / Upload / Publish
  -> Logs and Progress
  -> Public URL or Failure Retry
```

当前重点是把“部署到三方平台”的交互闭环演示清楚；真实平台可继续接入 Vercel、飞书妙搭或静态托管服务。

## 9. 质量保障

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

## 10. 当前技术风险

- 真实多 Agent 平台 API 的稳定性和授权方式可能不同，需要在适配层继续隔离差异。
- 浏览器中渲染 HTML、文档、PPT 时要注意沙箱和内容安全策略。
- 代码编辑与 Diff 应用后需要更完整的冲突检测，避免覆盖用户修改。
- 长会话上下文会带来 token 成本和信息污染，需要进一步做摘要和裁剪。
