# AgentHub AI 智能助手模块分析报告

**日期**: 2026-05-27  
**版本**: v1.0

---

## 1. 概述

AgentHub 实现了一套完整的多智能体协作系统，基于 DAG（有向无环图）任务编排模式，支持 5 个核心智能体协同工作：Planner（规划者）、Worker（执行者）、Critic（审查者）、Researcher（调研者）、Refiner（优化者）。

---

## 2. 核心架构

### 2.1 系统层次图

```
┌─────────────────────────────────────────────────────────────────┐
│                      WebSocket Gateway                          │
│                  (ws/gateway.ts)                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Orchestrator 编排器                         │
│              (orchestrator/index.ts)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  │ Researcher│  │ Planner │  │  Worker  │  │  Critic  │  │ Refiner  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Adapter 适配器                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  │  OpenAI  │  │ Claude   │  │  Codex   │  │ Generic  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Registry 工具库                        │
│  - 搜索 (Tavily)                                             │
│  - 代码 (e2b)                                                │
│  - 网页抓取                                                  │
│  - 部署 (Vercel)                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 5 个核心智能体

### 3.1 PlannerAgent - 任务规划者

**文件**: `packages/server/src/agents/planner.ts`

**职责**: 将用户的大任务拆解成可执行的步骤

**主要特性**:
- 输出 JSON 格式的步骤计划
- 支持 3-7 个具体步骤
- 带依赖关系的 DAG 结构
- 自动剥离 markdown 代码块
- 内置回退机制（单步/三步）

**输入输出示例**:
```typescript
// 输入
{ task: "开发一个待办事项应用" }

// 输出
{
  steps: [
    { id: "1", task: "需求分析", dependsOn: [] },
    { id: "2", task: "设计数据模型", dependsOn: ["1"] },
    { id: "3", task: "实现后端 API", dependsOn: ["2"] },
    { id: "4", task: "实现前端界面", dependsOn: ["3"] },
    { id: "5", task: "测试验证", dependsOn: ["3", "4"] }
  ]
}
```

---

### 3.2 WorkerAgent - 任务执行者

**文件**: `packages/server/src/agents/worker.ts`

**职责**: 执行具体任务，支持 Agent 自主思考循环

**两种运行模式**:
1. **Agent Loop 模式** - 使用 ReAct 思考-行动-观察循环
2. **纯 LLM 模式** - 直接调用大模型，流式输出

> 无可用 LLM 或工具配置时应返回明确失败原因，不再伪造成功结果。

**Agent Loop 细节**:
- 最大 15 轮迭代
- 内部维护 Thought → Action → Observation 循环
- 自动调用工具执行
- 支持流式输出过程信息

**工具**: 集成了 4 种工具：
- `search` - Tavily 搜索
- `code` - e2b 沙箱代码执行
- `web-fetch` - 网页抓取
- `deploy` - Vercel 部署

---

### 3.3 CriticAgent - 结果审查者

**文件**: `packages/server/src/agents/critic.ts`

**职责**: 审查 Worker 的执行结果，打分并提供改进建议

**输出格式**:
```typescript
{
  valid: true,       // 是否有效
  score: 8,          // 0-10 分
  issues: "",        // 问题列表
  suggestion: ""     // 改进建议
}
```

**特性**:
- 可配置 `criticThreshold` 分数阈值（默认 6）
- 低于阈值自动重试
- 解析失败返回默认值

---

### 3.4 ResearcherAgent - 调研者

**文件**: `packages/server/src/agents/researcher.ts`

**职责**: 任务开始前进行主题调研

**特性**:
- 输出结构化研究报告
- 支持独立启用/禁用（Orchestrator 配置中）
- 提供背景信息给 Planner

---

### 3.5 RefinerAgent - 优化者

**文件**: `packages/server/src/agents/refiner.ts`

**职责**: 优化和润色最终输出

**特性**:
- 保持原意不变的前提下优化表达
- 专业、简洁、结构化
- 支持独立启用/禁用

---

## 4. Orchestrator 编排器

**文件**: `packages/server/src/orchestrator/index.ts`

### 4.1 完整执行流程

```
用户任务
   ↓
[Researcher] 调研（可选）
   ↓
[Planner] 生成计划 → 输出 DAG 步骤
   ↓
[Worker] 并行执行 DAG 任务
   ↓
[Critic] 审查结果（分数 < 阈值 重试）
   ↓
[Refiner] 优化输出（可选）
   ↓
汇总总结
   ↓
最终结果
```

### 4.2 核心配置参数

```typescript
interface OrchestratorConfig {
  maxRetries: 2,           // Critic 审查失败最大重试次数
  criticThreshold: 6,       // Critic 分数阈值（0-10）
  enableResearcher: true,   // 是否启用调研
  enableRefiner: true,      // 是否启用优化
  concurrency: 5            // DAG 并行度
}
```

### 4.3 DAG 并行执行机制

**特性**:
- 分析步骤依赖关系
- 同一波次（Wave）的任务并行执行
- 支持条件边（条件依赖）
- 防止 DAG 死锁检测

**执行算法**:
```
1. 找出所有依赖都已完成的步骤 → 形成波次（Wave）
2. 该波次的任务全部并行执行
3. 标记完成，进入下一轮
4. 循环直到所有步骤完成
```

---

## 5. LLM Adapter 适配器层

**文件**: `packages/adapter/src/`

### 5.1 支持的适配器

| 适配器 | 说明 |
|--------|------|
| **OpenAIAdapter** | OpenAI API 标准接口 |
| **ClaudeCodeAdapter** | Claude Code CLI 集成 |
| **CodexAdapter** | OpenAI Codex 代码模型 |
| **GenericOpenAIAdapter** | 通用 OpenAI 兼容接口 |

### 5.2 BaseAdapter 抽象基类

**核心功能**:
- 自动重试机制（指数退避 + jitter）
- 统一温度/最大 Token 配置
- 流式输出支持
- Embedding 生成支持

**重试策略**:
```
i=0 → 1000ms
i=1 → 2000ms
i=2 → 3000ms
+ 随机 jitter (0-500ms)
```

---

## 6. Agent 智能识别机制

**文件**: `packages/server/src/agents/matching.ts`

**特性**:
- 关键词自动匹配对应智能体
- `@planner`、`@worker` 等 @ 提及语法
- 支持 `@all` 匹配全部智能体
- 返回匹配结果 + 标签

---

## 7. 智能体在对话中的行为

**文件**: `packages/server/src/ws/gateway.ts` (message:send 处理)

### 7.1 三种对话模式

| 模式 | 行为 |
|------|------|
| **简单聊天** | 直接用 LLM 回复（友好，100 字内） |
| **直接对话 (Direct)** | 与指定智能体 1:1 对话 |
| **群聊 (Group)** | 只有启用的智能体参与协作 |

### 7.2 关键修复

**问题**: 群聊中智能体未启用时用户消息不回复

**修复后**: 即使智能体全部禁用，也会用 LLM 回复用户消息，不会卡住。

---

## 8. 状态管理

**文件**: `packages/frontend/src/stores/chat-store.ts`

**核心状态**:
```typescript
{
  connected: boolean,                // WebSocket 连接状态
  conversations: Conversation[],    // 对话列表
  activeConversationId: string | null, // 当前活跃对话
  messages: Record<string, Message[]>, // 消息映射
  agentStates: Record<string, AgentState>, // 智能体状态
  planSteps: string[],              // 计划步骤
  streamBuffer: string,              // 流式输出缓冲
  isStreaming: boolean,              // 是否正在流式输出
  taskSummary: string               // 任务总结
}
```

---

## 9. 技术亮点

| 特性 | 说明 |
|------|------|
| **DAG 并行执行** | 基于依赖分析的并行任务调度 |
| **ReAct 循环** | 自主思考-行动-观察工具使用模式 |
| **自我审查** | Critic 审查 + 自动重试机制 |
| **多后端兼容** | 4 种 LLM 适配器统一接口 |
| **WebSocket 实时流** | 全过程实时推送到前端 |
| **智能关键词匹配** | 自动识别并调用对应的智能体 |
| **条件依赖边** | 支持条件触发的 DAG 执行 |

---

## 10. 架构图（完整）

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│  - Zustand State                                           │
│  - Real-time UI Streaming                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │  WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                WebSocket Gateway (ws/gateway.ts)            │
│  - Auth / Rooms / Broadcasting                             │
│  - Message handlers                                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator (orchestrator/index.ts)       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Researcher → 2. Planner → 3. DAG Worker         │   │
│  │         ↓                                            │   │
│  │      4. Critic (retry if score < threshold)         │   │
│  │         ↓                                            │   │
│  │      5. Refiner → Final Summary                     │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                LLM Adapters (4 implementations)             │
│  OpenAI / Claude / Codex / Generic OpenAI                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tools Registry                           │
│  - search (Tavily)                                          │
│  - code (e2b sandbox)                                        │
│  - web-fetch                                                 │
│  - deploy (Vercel)                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. 总结

AgentHub 的 AI 智能助手模块是一套设计非常完整的多智能体协作系统：

- ✅ **5 个专业分工明确的智能体**
- ✅ **基于 DAG 的高效并行调度**
- ✅ **自我审查 + 重试的质量保证机制**
- ✅ **ReAct 自主工具使用循环**
- ✅ **4 种主流 LLM 后端支持**
- ✅ **WebSocket 实时全流程推送**

这是一个生产级别的多智能体任务编排框架！

---

*报告生成时间: 2026-05-27*
