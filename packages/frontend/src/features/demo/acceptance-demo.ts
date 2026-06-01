"use client";

import type {
  Artifact,
  Conversation,
  Message,
  PlanNode,
  ResourceItem,
  SessionAgentStatus,
  TaskFlowItem,
} from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export const ACCEPTANCE_GROUP_CONVERSATION_ID = "acceptance-demo-group";
export const ACCEPTANCE_SINGLE_CONVERSATION_ID = "acceptance-demo-single-codex";
const ACCEPTANCE_CLAUDE_CONVERSATION_ID = "acceptance-demo-single-claude";
const ACCEPTANCE_OPEN_CODE_CONVERSATION_ID = "acceptance-demo-single-open-code";
const ACCEPTANCE_UX_CONVERSATION_ID = "acceptance-demo-single-ux";
const DEMO_CONVERSATION_IDS = [
  ACCEPTANCE_GROUP_CONVERSATION_ID,
  ACCEPTANCE_SINGLE_CONVERSATION_ID,
  ACCEPTANCE_CLAUDE_CONVERSATION_ID,
  ACCEPTANCE_OPEN_CODE_CONVERSATION_ID,
  ACCEPTANCE_UX_CONVERSATION_ID,
];

const DEMO_DEPLOY_URL = "https://agenthub-demo-preview.example.com";

function at(offset: number) {
  return Date.now() - offset;
}

function makeMessage(input: Omit<Message, "conversationId" | "timestamp"> & { timestamp?: number }, conversationId = ACCEPTANCE_GROUP_CONVERSATION_ID): Message {
  return {
    conversationId,
    timestamp: input.timestamp ?? Date.now(),
    ...input,
  };
}

const landingHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgentHub 验收预览</title>
    <style>
      :root { color-scheme: light; font-family: Inter, "Microsoft YaHei", sans-serif; }
      body { margin: 0; background: #f6f7f9; color: #202124; }
      main { max-width: 960px; margin: 0 auto; padding: 56px 24px; }
      header { display: grid; gap: 18px; border-bottom: 1px solid #dde1e7; padding-bottom: 28px; }
      h1 { margin: 0; font-size: clamp(28px, 5vw, 44px); line-height: 1.08; letter-spacing: -0.02em; }
      p { color: #5f6368; line-height: 1.7; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; }
      a { color: inherit; text-decoration: none; }
      .primary { background: #174ea6; color: white; padding: 10px 16px; border-radius: 8px; font-weight: 700; }
      .secondary { border: 1px solid #c7ccd4; padding: 10px 16px; border-radius: 8px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 28px; }
      article { background: white; border: 1px solid #e1e4e8; border-radius: 8px; padding: 18px; }
      h2 { margin: 0 0 8px; font-size: 15px; }
      small { color: #188038; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <small>PMO 多 Agent 协作流</small>
        <h1>从需求拆解到产物部署，一次会话完成验收闭环。</h1>
        <p>主 Agent 负责理解目标、拆分任务和调度子 Agent；Codex、Claude Code、Open Code 与自建 UX Reviewer 分工处理实现、冲突、预览和部署。</p>
        <div class="actions">
          <a class="primary" href="#preview">查看产物</a>
          <a class="secondary" href="#diff">查看 Diff</a>
        </div>
      </header>
      <section class="grid" id="preview">
        <article><h2>对话模式</h2><p>会话列表包含单聊与群聊，群聊显示多个 Agent 协作状态。</p></article>
        <article><h2>产物编辑</h2><p>网页、文档、PPT 与代码均可在右侧面板预览或进入编辑。</p></article>
        <article><h2>部署状态</h2><p>部署卡片展示构建、完成、失败与外部访问链接。</p></article>
        <article id="diff"><h2>冲突处理</h2><p>代码冲突由主 Agent 降级给 Claude Code 处理，并保留版本历史。</p></article>
      </section>
    </main>
  </body>
</html>`;

const updatedLandingHtml = landingHtml.replace(
  "一次会话完成验收闭环。",
  "一次会话完成预览、编辑、部署与复盘。"
);

const requirementsDoc = `# 验收需求引用摘要

> 引用段落：产物预览与编辑需要支持网页、文档、PPT、代码编辑、Diff 视图、版本历史，并能把文档段落交给 Agent 处理。

## 已覆盖

- 会话列表：单聊 + 群聊均已注入。
- 主 Agent：PMO 负责理解需求、拆解任务、调度、降级和冲突处理。
- 多 Agent：Codex、Claude Code、Open Code，以及自建 UX Reviewer 同场协作。
- 产物：HTML 预览、Markdown 文档、PPT 浏览、代码 Diff、版本历史、部署状态卡片。
- 上下文管理：引用本段需求后交给 Codex 与 UX Reviewer 二次处理。`;

const demoSlides = `## 课题验收主线

- 对话列表：单聊与群聊并存
- 主 Agent：PMO 拆解与调度
- 子 Agent：Codex、Claude Code、Open Code、自建 UX Reviewer

> 演示时先从会话列表进入群聊，再打开右侧预览面板。

## 产物流转

- HTML 页面进入预览和代码编辑
- Markdown 文档可引用段落
- PPT 在 Slides Tab 中浏览
- Diff Tab 展示冲突与版本变更

## 部署与降级

- Open Code 负责部署
- Claude Code 接管冲突文件
- PMO 汇总失败降级与复盘结论`;

const diffContent = `--- landing-page.v1.html
+++ landing-page.v2.html
@@ -8,7 +8,7 @@
-        <h1>从需求拆解到产物部署，一次会话完成验收闭环。</h1>
+        <h1>从需求拆解到产物部署，一次会话完成预览、编辑、部署与复盘。</h1>
@@ -21,6 +21,7 @@
         <article><h2>部署状态</h2><p>部署卡片展示构建、完成、失败与外部访问链接。</p></article>
+        <article><h2>版本历史</h2><p>保留 v1 与 v2，可回滚并继续交给 Agent 修改。</p></article>`;

const taskFlow: TaskFlowItem[] = [
  {
    id: "demo-flow-pmo",
    agentId: "pmo",
    agentRole: "planner",
    agentName: "PMO 主 Agent",
    taskName: "理解课题并拆解验收路径",
    taskDescription: "识别交互、主 Agent、多 Agent、产物预览编辑四条验收线。",
    status: "done",
    progress: 100,
    timestamp: at(1000 * 60 * 12),
    subTasks: ["确认单聊/群聊入口", "拆分产物链路", "定义失败降级策略"],
  },
  {
    id: "demo-flow-research",
    agentId: "researcher",
    agentRole: "researcher",
    agentName: "Researcher",
    taskName: "提取需求段落与上下文",
    taskDescription: "从课题说明中引用关键段落，交给实现 Agent 二次处理。",
    status: "done",
    progress: 100,
    timestamp: at(1000 * 60 * 10),
  },
  {
    id: "demo-flow-codex",
    agentId: "codex",
    agentRole: "coder",
    agentName: "Codex",
    taskName: "生成网页产物与代码版本",
    taskDescription: "创建 HTML 预览、v1/v2 版本和可编辑代码。",
    status: "done",
    progress: 100,
    timestamp: at(1000 * 60 * 8),
  },
  {
    id: "demo-flow-claude",
    agentId: "claude-code",
    agentRole: "worker",
    agentName: "Claude Code",
    taskName: "处理代码冲突与降级接管",
    taskDescription: "当 Codex 修改同一段落时接管 Diff 合并，输出冲突处理结果。",
    status: "running",
    progress: 76,
    timestamp: at(1000 * 60 * 5),
  },
  {
    id: "demo-flow-open-code",
    agentId: "open-code",
    agentRole: "worker",
    agentName: "Open Code",
    taskName: "部署到第三方平台",
    taskDescription: "产出部署状态卡片与访问链接。",
    status: "done",
    progress: 100,
    timestamp: at(1000 * 60 * 3),
  },
  {
    id: "demo-flow-ux",
    agentId: "ux-reviewer",
    agentRole: "custom",
    agentName: "自建 UX Reviewer",
    taskName: "检查验收演示路径",
    taskDescription: "检查是否能从列表进入会话、打开预览、查看版本并继续追问。",
    status: "waiting",
    progress: 0,
    timestamp: at(1000 * 60),
  },
];

const agentStatuses: SessionAgentStatus[] = [
  { agentId: "pmo", agentRole: "planner", agentName: "PMO 主 Agent", status: "done", progress: 100 },
  { agentId: "codex", agentRole: "coder", agentName: "Codex", status: "done", progress: 100 },
  { agentId: "claude-code", agentRole: "worker", agentName: "Claude Code", status: "running", progress: 76 },
  { agentId: "open-code", agentRole: "worker", agentName: "Open Code", status: "done", progress: 100 },
  { agentId: "ux-reviewer", agentRole: "custom", agentName: "自建 UX Reviewer", status: "waiting", progress: 0 },
];

const plan: PlanNode[] = [
  { id: "plan-understand", task: "主 Agent 理解课题要求并拆解任务", dependsOn: [], agentRole: "planner" },
  { id: "plan-context", task: "引用需求段落，建立上下文", dependsOn: ["plan-understand"], agentRole: "researcher" },
  { id: "plan-build", task: "Codex 生成网页、文档、PPT 与代码产物", dependsOn: ["plan-context"], agentRole: "coder" },
  { id: "plan-conflict", task: "Claude Code 处理同文件冲突并输出 Diff", dependsOn: ["plan-build"], agentRole: "worker" },
  { id: "plan-deploy", task: "Open Code 部署并回传部署状态卡片", dependsOn: ["plan-conflict"], agentRole: "worker" },
  { id: "plan-review", task: "自建 UX Reviewer 复核验收演示路径", dependsOn: ["plan-deploy"], agentRole: "custom" },
];

const artifacts: Artifact[] = [
  {
    id: "demo-artifact-html-v1",
    jobId: "acceptance-demo-job",
    type: "html",
    filename: "landing-page.html",
    content: landingHtml,
    version: 1,
    createdBy: "Codex",
    createdAt: at(1000 * 60 * 8),
    metadata: { editable: true, preview: true, changeSummary: "Codex 生成首版可预览 HTML 页面。" },
  },
  {
    id: "demo-artifact-html-v2",
    jobId: "acceptance-demo-job",
    type: "html",
    filename: "landing-page.html",
    content: updatedLandingHtml,
    version: 2,
    parentId: "demo-artifact-html-v1",
    createdBy: "Claude Code",
    createdAt: at(1000 * 60 * 4),
    metadata: { editable: true, preview: true, conflictResolved: true, changeSummary: "Claude Code 合并冲突，补齐版本历史和部署状态模块。" },
  },
  {
    id: "demo-artifact-requirements",
    jobId: "acceptance-demo-job",
    type: "document",
    filename: "requirements-summary.md",
    content: requirementsDoc,
    version: 1,
    createdBy: "Researcher",
    createdAt: at(1000 * 60 * 7),
    metadata: { changeSummary: "Researcher 提炼课题要求，形成验收清单。" },
  },
  {
    id: "demo-artifact-slides",
    jobId: "acceptance-demo-job",
    type: "slides",
    filename: "acceptance-demo.slides.md",
    content: demoSlides,
    version: 1,
    createdBy: "PMO 主 Agent",
    createdAt: at(1000 * 60 * 6),
    metadata: { changeSummary: "PMO 生成用于答辩的演示 PPT 草稿。" },
  },
  {
    id: "demo-artifact-deploy",
    jobId: "acceptance-demo-job",
    type: "deploy_url",
    filename: "production-url.txt",
    content: DEMO_DEPLOY_URL,
    version: 1,
    createdBy: "Open Code",
    createdAt: at(1000 * 60 * 2),
    metadata: { platform: "Vercel / Miaoda compatible", status: "done" },
  },
];

const resources: ResourceItem[] = [
  { id: "demo-resource-doc", name: "课题要求摘录.md", type: "doc", size: "6 KB", createdAt: at(1000 * 60 * 9) },
  { id: "demo-resource-html", name: "landing-page.html", type: "code", size: "9 KB", createdAt: at(1000 * 60 * 8) },
  { id: "demo-resource-ppt", name: "acceptance-demo.slides.md", type: "doc", size: "4 KB", createdAt: at(1000 * 60 * 6) },
  { id: "demo-resource-diff", name: "landing-page.diff", type: "code", size: "2 KB", createdAt: at(1000 * 60 * 4) },
];

function buildGroupMessages(): Message[] {
  return [
    makeMessage({
      id: "demo-msg-system-start",
      type: "system",
      sender: "system",
      content: "已创建群聊模式：PMO 主 Agent、Codex、Claude Code、Open Code、自建 UX Reviewer 已加入。",
      timestamp: at(1000 * 60 * 13),
    }),
    makeMessage({
      id: "demo-msg-user",
      type: "user_message",
      sender: "user",
      content: "请按课题要求，用多 Agent 协作开发一个验收演示：要有对话列表、单聊/群聊、部署状态卡片、产物预览编辑、Diff、版本历史和上下文引用。",
      timestamp: at(1000 * 60 * 12),
    }),
    makeMessage({
      id: "demo-msg-pmo-plan",
      type: "agent_message",
      sender: "planner",
      senderId: "pmo",
      content: "我作为 PMO 主 Agent 先拆解任务：\n- Codex 负责网页和代码产物。\n- Researcher 负责引用课题段落并建立上下文。\n- Claude Code 负责冲突合并和失败降级。\n- Open Code 负责部署状态卡片。\n- 自建 UX Reviewer 负责验收路径复核。\n\n执行策略：能并行的产物生成与上下文整理并行执行；冲突出现时降级给 Claude Code；最终由 PMO 汇总。",
      mentions: ["codex", "researcher", "claude-code", "open-code", "ux-reviewer"],
      timestamp: at(1000 * 60 * 11),
    }),
    makeMessage({
      id: "demo-msg-plan-card",
      type: "plan",
      sender: "planner",
      content: "计划已生成：理解需求 -> 引用上下文 -> 生成产物 -> 处理冲突 -> 部署 -> 复核。",
      payload: { plan },
      timestamp: at(1000 * 60 * 10),
    }),
    makeMessage({
      id: "demo-msg-research",
      type: "agent_message",
      sender: "researcher",
      senderId: "researcher",
      content: requirementsDoc,
      payload: { artifactType: "document", artifactId: "demo-artifact-requirements", filename: "requirements-summary.md", language: "md" },
      timestamp: at(1000 * 60 * 9),
    }),
    makeMessage({
      id: "demo-msg-codex-html",
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: landingHtml,
      payload: { artifactType: "html", filename: "landing-page.html", language: "html", version: 1 },
      timestamp: at(1000 * 60 * 8),
    }),
    makeMessage({
      id: "demo-msg-conflict",
      type: "critic_review",
      sender: "critic",
      senderId: "pmo",
      content: "检测到 Codex 与自建 UX Reviewer 同时修改 H1 文案，触发代码冲突处理。PMO 已将冲突文件降级派给 Claude Code 合并。",
      timestamp: at(1000 * 60 * 6),
    }),
    makeMessage({
      id: "demo-msg-diff",
      type: "diff_card",
      sender: "worker",
      senderId: "claude-code",
      content: diffContent,
      payload: { fileName: "landing-page.html", originalArtifactId: "demo-artifact-html-v1", modifiedArtifactId: "demo-artifact-html-v2" },
      timestamp: at(1000 * 60 * 5),
    }),
    makeMessage({
      id: "demo-msg-slides",
      type: "agent_message",
      sender: "planner",
      senderId: "pmo",
      content: demoSlides,
      payload: { artifactType: "slides", artifactId: "demo-artifact-slides", filename: "acceptance-demo.slides.md", language: "md" },
      timestamp: at(1000 * 60 * 4),
    }),
    makeMessage({
      id: "demo-msg-deploy",
      type: "deploy_card",
      sender: "worker",
      senderId: "open-code",
      content: "部署完成。产物已进入预览环境，可继续二次交互或交给 Agent 修改。",
      payload: { url: DEMO_DEPLOY_URL, status: "done", platform: "third-party-preview" },
      timestamp: at(1000 * 60 * 3),
    }),
    makeMessage({
      id: "demo-msg-context",
      type: "system",
      sender: "system",
      content: "上下文管理：已引用《课题要求摘录》第 3 段，后续追问会自动带上网页、文档、PPT、Diff 和部署状态。",
      timestamp: at(1000 * 60 * 2),
    }),
    makeMessage({
      id: "demo-msg-summary",
      type: "agent_message",
      sender: "refiner",
      senderId: "ux-reviewer",
      content: "复核结果：验收主线已闭环。建议演示顺序为：会话列表 -> 群聊协作 -> 右侧预览 -> Diff/版本历史 -> 部署卡片 -> 引用文档段落继续追问。",
      timestamp: at(1000 * 60),
    }),
  ];
}

function buildSingleMessages(): Message[] {
  return [
    makeMessage({
      id: "demo-single-user",
      type: "user_message",
      sender: "user",
      content: "Codex，单聊模式下只帮我检查 landing-page.html 的结构。",
      timestamp: at(1000 * 60 * 7),
    }, ACCEPTANCE_SINGLE_CONVERSATION_ID),
    makeMessage({
      id: "demo-single-codex",
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: "已进入单聊模式。结构检查结果：HTML 语义完整，CTA 与四个验收点清晰；建议保留当前朴素样式，避免过度装饰影响验收重点。",
      timestamp: at(1000 * 60 * 6),
    }, ACCEPTANCE_SINGLE_CONVERSATION_ID),
  ];
}

function buildContactMessages(conversationId: string, senderId: string, sender: string, content: string): Message[] {
  return [
    makeMessage({
      id: `${conversationId}-intro`,
      type: "agent_message",
      sender,
      senderId,
      content,
      timestamp: at(1000 * 60 * 5),
    }, conversationId),
  ];
}

function persistMessages(messages: Record<string, Message[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("agenthub-chat-messages", JSON.stringify(messages));
}

function persistContextReferences(refs: Record<string, unknown[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("agenthub-context-references", JSON.stringify(refs));
}

export function resetAcceptanceDemo() {
  const chat = useChatStore.getState();
  const workspace = useWorkspaceStore.getState();
  const demoIds = new Set(DEMO_CONVERSATION_IDS);
  const nextMessages = { ...chat.messages };
  const nextContextReferences = { ...chat.contextReferences };
  const nextConversationMode = { ...chat.conversationMode };

  for (const id of DEMO_CONVERSATION_IDS) {
    delete nextMessages[id];
    delete nextContextReferences[id];
    delete nextConversationMode[id];
  }

  chat.setConversations(chat.conversations.filter((conversation) => !demoIds.has(conversation.id)));
  useChatStore.setState({
    activeConversationId: demoIds.has(chat.activeConversationId ?? "") ? null : chat.activeConversationId,
    messages: nextMessages,
    conversationMode: nextConversationMode,
    contextReferences: nextContextReferences,
    conversationDetail: null,
    taskFlow: [],
    sessionAgentStatuses: [],
    taskProgress: null,
    resources: [],
    agentStates: {},
    planSteps: [],
    steps: [],
    agentSteps: [],
    currentPreview: null,
    analysisResults: [],
    taskAssignments: [],
    isAnalyzing: false,
    taskSummary: "",
    streamBuffer: "",
    isStreaming: false,
  });
  persistMessages(nextMessages);
  persistContextReferences(nextContextReferences);

  workspace.clearWorkspace();
  workspace.switchConversation(null);

  if (typeof window !== "undefined") {
    for (const id of DEMO_CONVERSATION_IDS) {
      localStorage.removeItem(`agenthub-ws-${id}`);
    }
    if (demoIds.has(localStorage.getItem("agenthub-active-conv") ?? "")) {
      localStorage.removeItem("agenthub-active-conv");
    }
    localStorage.removeItem("agenthub-conv-detail");
  }
}

export function seedAcceptanceDemo() {
  const chat = useChatStore.getState();
  const now = Date.now();

  const groupConversation: Conversation = {
    id: ACCEPTANCE_GROUP_CONVERSATION_ID,
    workspaceId: "default",
    title: "课题验收演示：多 Agent 协作",
    type: "group",
    status: "active",
    pinned: true,
    pinnedAt: now,
    participants: ["PMO 主 Agent", "Codex", "Claude Code", "Open Code", "自建 UX Reviewer"],
    lastMessage: "复核结果：验收主线已闭环。",
    lastMessageAt: now,
    createdAt: at(1000 * 60 * 15),
    updatedAt: now,
    summary: "覆盖单聊/群聊、主 Agent、多 Agent 接入、产物预览编辑、Diff、版本历史和部署状态。",
    topics: "acceptance,multi-agent,artifact-preview,deploy",
    messageCount: buildGroupMessages().length,
    importance: 9,
  };

  const singleConversation: Conversation = {
    id: ACCEPTANCE_SINGLE_CONVERSATION_ID,
    workspaceId: "default",
    title: "Codex 单聊检查",
    type: "direct",
    status: "active",
    pinned: false,
    participants: ["Codex"],
    lastMessage: "结构检查完成，建议保留朴素样式。",
    lastMessageAt: at(1000 * 60 * 6),
    createdAt: at(1000 * 60 * 8),
    updatedAt: at(1000 * 60 * 6),
    summary: "单聊模式示例。",
    topics: "single-chat,codex",
    messageCount: 2,
    importance: 5,
  };

  const claudeConversation: Conversation = {
    id: ACCEPTANCE_CLAUDE_CONVERSATION_ID,
    workspaceId: "default",
    title: "Claude Code 冲突处理",
    type: "direct",
    status: "active",
    pinned: false,
    participants: ["Claude Code"],
    lastMessage: "我负责降级接管、冲突合并和代码审查。",
    lastMessageAt: at(1000 * 60 * 5),
    createdAt: at(1000 * 60 * 8),
    updatedAt: at(1000 * 60 * 5),
    summary: "主流 Agent 平台联系人示例。",
    topics: "claude-code,conflict,diff",
    messageCount: 1,
    importance: 5,
  };

  const openCodeConversation: Conversation = {
    id: ACCEPTANCE_OPEN_CODE_CONVERSATION_ID,
    workspaceId: "default",
    title: "Open Code 部署发布",
    type: "direct",
    status: "active",
    pinned: false,
    participants: ["Open Code"],
    lastMessage: "我负责构建部署、发布回调和日志诊断。",
    lastMessageAt: at(1000 * 60 * 4),
    createdAt: at(1000 * 60 * 8),
    updatedAt: at(1000 * 60 * 4),
    summary: "Open Code 部署 Agent 联系人。",
    topics: "open-code,deploy,logs",
    messageCount: 1,
    importance: 5,
  };

  const uxConversation: Conversation = {
    id: ACCEPTANCE_UX_CONVERSATION_ID,
    workspaceId: "default",
    title: "自建 UX Reviewer",
    type: "direct",
    status: "active",
    pinned: false,
    participants: ["自建 UX Reviewer"],
    lastMessage: "我负责体验审查、验收路径和文案建议。",
    lastMessageAt: at(1000 * 60 * 3),
    createdAt: at(1000 * 60 * 8),
    updatedAt: at(1000 * 60 * 3),
    summary: "用户自建 Agent 联系人示例。",
    topics: "custom-agent,ux,review",
    messageCount: 1,
    importance: 5,
  };

  const otherConversations = chat.conversations.filter(
    (conversation) =>
      conversation.id !== ACCEPTANCE_GROUP_CONVERSATION_ID &&
      conversation.id !== ACCEPTANCE_SINGLE_CONVERSATION_ID &&
      conversation.id !== ACCEPTANCE_CLAUDE_CONVERSATION_ID &&
      conversation.id !== ACCEPTANCE_OPEN_CODE_CONVERSATION_ID &&
      conversation.id !== ACCEPTANCE_UX_CONVERSATION_ID
  );

  chat.setConversations([groupConversation, singleConversation, claudeConversation, openCodeConversation, uxConversation, ...otherConversations]);

  const groupMessages = buildGroupMessages();
  const singleMessages = buildSingleMessages();
  const nextMessages = {
    ...useChatStore.getState().messages,
    [ACCEPTANCE_GROUP_CONVERSATION_ID]: groupMessages,
    [ACCEPTANCE_SINGLE_CONVERSATION_ID]: singleMessages,
    [ACCEPTANCE_CLAUDE_CONVERSATION_ID]: buildContactMessages(ACCEPTANCE_CLAUDE_CONVERSATION_ID, "claude-code", "worker", "我负责降级接管、冲突合并和代码审查。把冲突文件或 Diff 交给我即可。"),
    [ACCEPTANCE_OPEN_CODE_CONVERSATION_ID]: buildContactMessages(ACCEPTANCE_OPEN_CODE_CONVERSATION_ID, "open-code", "worker", "我负责构建部署、发布回调和日志诊断。部署失败时可以直接把日志交给我。"),
    [ACCEPTANCE_UX_CONVERSATION_ID]: buildContactMessages(ACCEPTANCE_UX_CONVERSATION_ID, "ux-reviewer", "refiner", "我是用户自建 Agent，负责体验审查、验收路径和文案建议。"),
  };
  useChatStore.setState({ messages: nextMessages });
  persistMessages(nextMessages);

  chat.setActiveConversation(ACCEPTANCE_GROUP_CONVERSATION_ID);
  chat.setConversationMode(ACCEPTANCE_GROUP_CONVERSATION_ID, "group");
  chat.setConversationMode(ACCEPTANCE_SINGLE_CONVERSATION_ID, "single");
  chat.setConversationMode(ACCEPTANCE_CLAUDE_CONVERSATION_ID, "single");
  chat.setConversationMode(ACCEPTANCE_OPEN_CODE_CONVERSATION_ID, "single");
  chat.setConversationMode(ACCEPTANCE_UX_CONVERSATION_ID, "single");
  chat.setConversationDetail({
    title: groupConversation.title,
    description: "一键演示课题要求中的多 Agent 协作、产物链路和部署闭环。",
    priority: "high",
    status: "active",
    estimatedDuration: 18,
    createdAt: groupConversation.createdAt,
    createdBy: "user",
    participants: groupConversation.participants.map((name, index) => ({
      id: `demo-member-${index}`,
      name,
      role: index === 0 ? "owner" : "editor",
    })),
    agentCount: groupConversation.participants.length,
  });
  chat.setTaskFlow(taskFlow);
  chat.setSessionAgentStatuses(agentStatuses);
  chat.setTaskProgress({ completed: 4, inProgress: 1, waiting: 1, total: 6, percentage: 72, estimatedRemaining: "约 3 分钟" });
  chat.setResources(resources);
  chat.addPlan(plan.map((node) => ({ id: node.id, task: node.task })));
  chat.clearAnalysis();
  chat.addAnalysisResult({ agentId: "pmo", agentName: "PMO 主 Agent", content: "已拆解为 6 个验收步骤：上下文整理与网页产物并行，冲突处理完成后再进入部署和 UX 复核。" });
  chat.addAnalysisResult({ agentId: "claude-code", agentName: "Claude Code", content: "发现同文件冲突，已从 Codex 降级接管 Diff 合并，并保留 v1/v2 版本。" });
  chat.addAnalysisResult({ agentId: "open-code", agentName: "Open Code", content: "部署已完成，PMO 将发布回调纳入最终验收上下文。" });
  chat.addTaskAssignment({ targetAgent: "Codex", task: "生成 HTML 产物和可编辑代码", status: "done" });
  chat.addTaskAssignment({ targetAgent: "Claude Code", task: "接管冲突文件并输出 Diff", status: "running" });
  chat.addTaskAssignment({ targetAgent: "Open Code", task: "部署到第三方预览平台", status: "done" });
  chat.addTaskAssignment({ targetAgent: "UX Reviewer", task: "复核验收演示路径", status: "pending" });
  chat.setCurrentPreview({
    artifactId: "demo-artifact-html-v2",
    type: "html",
    content: updatedLandingHtml,
    filename: "landing-page.html",
  });
  chat.clearContextReferences(ACCEPTANCE_GROUP_CONVERSATION_ID);
  chat.addContextReference(ACCEPTANCE_GROUP_CONVERSATION_ID, {
    id: "demo-context-requirement",
    messageId: "demo-msg-user",
    sourceType: "message",
    sender: "我",
    title: "用户需求 · 验收目标",
    content: "请按课题要求，用多 Agent 协作开发一个验收演示：要有对话列表、单聊/群聊、部署状态卡片、产物预览编辑、Diff、版本历史和上下文引用。",
    createdAt: at(1000 * 60 * 12),
  });
  chat.addContextReference(ACCEPTANCE_GROUP_CONVERSATION_ID, {
    id: "demo-context-risk",
    messageId: "demo-msg-conflict",
    sourceType: "message",
    sender: "PMO 主 Agent",
    senderId: "pmo",
    title: "PMO 风险判断 · 冲突接管",
    content: "检测到 Codex 与自建 UX Reviewer 同时修改 H1 文案，触发代码冲突处理。PMO 已将冲突文件降级派给 Claude Code 合并。",
    createdAt: at(1000 * 60 * 6),
  });

  for (const agent of agentStatuses) {
    chat.updateAgentState(agent.agentId, {
      id: agent.agentId,
      role: agent.agentRole,
      status: agent.status === "running" ? "acting" : agent.status === "done" ? "done" : "idle",
      output: `${agent.agentName}：${agent.status === "running" ? "正在处理" : agent.status === "done" ? "已完成" : "等待中"}`,
      logs: [
        { timestamp: now, level: "info", message: `${agent.agentName} 已加入验收演示会话` },
      ],
    });
  }

  const workspace = useWorkspaceStore.getState();
  workspace.switchConversation(ACCEPTANCE_GROUP_CONVERSATION_ID);
  workspace.clearWorkspace();
  workspace.setPlan(plan);
  for (const node of plan) {
    workspace.updateNodeStatus(node.id, node.id === "plan-review" ? "waiting" : node.id === "plan-conflict" ? "running" : "done");
  }
  workspace.addStepResult({
    id: "demo-result-pmo",
    task: "任务拆解",
    result: "PMO 将任务拆成上下文、产物、冲突、部署、复核五条线。",
    toolUsed: "orchestrator",
    duration: 42,
  });
  workspace.addStepResult({
    id: "demo-result-conflict",
    task: "冲突处理",
    result: "Claude Code 合并 H1 文案冲突并生成 Diff。",
    toolUsed: "claude-code-adapter",
    duration: 65,
  });
  workspace.addStepResult({
    id: "demo-result-deploy",
    task: "发布回调",
    result: "Open Code 返回第三方预览链接，部署状态写入消息卡片和右侧部署面板。",
    toolUsed: "open-code-adapter",
    duration: 38,
  });
  for (const artifact of artifacts) {
    workspace.addArtifact(artifact);
  }
  workspace.setDeployStatus("done", DEMO_DEPLOY_URL);

  window.dispatchEvent(new CustomEvent("conversation:select", { detail: { conversationId: ACCEPTANCE_GROUP_CONVERSATION_ID } }));
}

export function startAcceptanceDemo() {
  resetAcceptanceDemo();
  seedAcceptanceDemo();
}
