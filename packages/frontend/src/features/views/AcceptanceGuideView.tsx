"use client";

import { useMemo } from "react";
import type { NavKey } from "@/stores/navigation-store";
import { ACCEPTANCE_GROUP_CONVERSATION_ID, startAcceptanceDemo } from "@/features/demo/acceptance-demo";
import { useChatStore } from "@/stores/chat-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type GuideStatus = "ready" | "demo" | "missing";
type GuideTarget = "chat" | "agents" | "my-agents" | "tasks" | "right-panel";
type RightPanelTab = "tasks" | "code" | "preview" | "diff" | "slides" | "history" | "deploy" | "context";

interface GuideItem {
  id: string;
  group: string;
  title: string;
  desc: string;
  evidence: string;
  status: GuideStatus;
  target: GuideTarget;
  tab?: RightPanelTab;
}

const STATUS_META: Record<GuideStatus, { label: string; color: string; bg: string }> = {
  ready: { label: "已完成", color: "var(--success)", bg: "var(--success-subtle)" },
  demo: { label: "可演示", color: "#174ea6", bg: "rgba(23, 78, 166, 0.07)" },
  missing: { label: "待补齐", color: "var(--danger)", bg: "var(--danger-subtle)" },
};

const GROUP_ORDER = ["交互体验", "主 Agent", "多 Agent 接入", "产物链路"];

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function StatusBadge({ status }: { status: GuideStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold" style={{ color: meta.color, background: meta.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function CompletionBar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span style={{ color: "var(--fg-tertiary)" }}>验收覆盖度</span>
        <span className="font-bold" style={{ color: "#174ea6" }}>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
        <div className="h-full rounded-sm transition-all" style={{ width: `${percent}%`, background: "#174ea6" }} />
      </div>
    </div>
  );
}

function useGuideItems(): GuideItem[] {
  const conversations = useChatStore((state) => state.conversations);
  const messages = useChatStore((state) => state.messages);
  const contextReferences = useChatStore((state) => state.contextReferences);
  const taskFlow = useChatStore((state) => state.taskFlow);
  const sessionAgentStatuses = useChatStore((state) => state.sessionAgentStatuses);
  const userAgents = useUserAgentStore((state) => state.agents);
  const artifacts = useWorkspaceStore((state) => state.artifacts);
  const deployStatus = useWorkspaceStore((state) => state.deployStatus);
  const deployUrl = useWorkspaceStore((state) => state.deployUrl);

  return useMemo(() => {
    const allMessages = Object.values(messages).flat();
    const hasGroup = conversations.some((conversation) => conversation.type === "group");
    const hasDirect = conversations.some((conversation) => conversation.type === "direct");
    const hasDeployCard = allMessages.some((message) => message.type === "deploy_card") || Boolean(deployStatus || deployUrl);
    const hasDiff = allMessages.some((message) => message.type === "diff_card") || artifacts.some((artifact) => artifact.type === "code" && artifact.filename?.endsWith(".diff"));
    const hasDocument = artifacts.some((artifact) => artifact.type === "document" || artifact.type === "markdown");
    const hasSlides = artifacts.some((artifact) => artifact.type === "slides");
    const hasHtml = artifacts.some((artifact) => artifact.type === "html");
    const hasVersions = artifacts.some((artifact) => (artifact.version ?? 1) > 1 || artifact.parentId);
    const hasContext = Object.values(contextReferences).some((refs) => refs.length > 0);
    const hasPmo = taskFlow.some((task) => task.agentId === "pmo" || /PMO|主 Agent/.test(task.agentName)) || sessionAgentStatuses.some((agent) => agent.agentId === "pmo");
    const hasConflictFallback = allMessages.some((message) => /冲突|降级|接管/.test(message.content));
    const hasMainstreamAgents = conversations.some((conversation) => ["Codex", "Claude Code", "Open Code"].some((name) => conversation.participants.includes(name)));

    return [
      {
        id: "conversation-list",
        group: "交互体验",
        title: "对话列表、单聊与群聊",
        desc: "左侧会话列表区分群聊、单聊、置顶、归档、搜索和 Agent 能力标签。",
        evidence: `${conversations.length} 个会话，群聊 ${hasGroup ? "已就绪" : "待演示"}，单聊 ${hasDirect ? "已就绪" : "待演示"}`,
        status: hasGroup && hasDirect ? "ready" : "demo",
        target: "chat",
      },
      {
        id: "message-actions",
        group: "交互体验",
        title: "消息操作与上下文管理",
        desc: "消息可复制、加入上下文、交给 PMO/Codex/UX，并在上下文面板统一管理。",
        evidence: hasContext ? "已存在消息引用和上下文条目" : "演示数据会注入上下文引用",
        status: hasContext ? "ready" : "demo",
        target: "right-panel",
        tab: "context",
      },
      {
        id: "pmo-orchestration",
        group: "主 Agent",
        title: "PMO 主 Agent 调度",
        desc: "PMO 负责理解课题、拆解任务、派发子 Agent，并展示并行调度队列。",
        evidence: hasPmo ? `${taskFlow.length || sessionAgentStatuses.length} 条调度记录` : "启动演示后展示 PMO 调度板",
        status: hasPmo ? "ready" : "demo",
        target: "right-panel",
        tab: "tasks",
      },
      {
        id: "fallback-conflict",
        group: "主 Agent",
        title: "失败降级与代码冲突处理",
        desc: "检测同文件冲突后降级给 Claude Code，保留 Diff 和复盘事件。",
        evidence: hasConflictFallback || hasDiff ? "冲突、降级、Diff 均有演示记录" : "演示会话会生成冲突与 Diff",
        status: hasConflictFallback || hasDiff ? "ready" : "demo",
        target: "right-panel",
        tab: "diff",
      },
      {
        id: "platform-agents",
        group: "多 Agent 接入",
        title: "Codex、Claude Code、Open Code",
        desc: "平台 Agent 有头像、名称、能力标签、适配器信息和降级策略。",
        evidence: hasMainstreamAgents ? "主流 Agent 已加入验收会话" : "Agent 页面可查看完整联系人式信息",
        status: hasMainstreamAgents ? "ready" : "demo",
        target: "agents",
      },
      {
        id: "custom-agent",
        group: "多 Agent 接入",
        title: "用户自建 Agent",
        desc: "支持创建自建 Agent，并在聊天列表与会话成员里显示真实头像、名称和能力。",
        evidence: userAgents.length > 0 ? `${userAgents.length} 个自建 Agent` : "演示内置自建 UX Reviewer",
        status: userAgents.length > 0 ? "ready" : "demo",
        target: "my-agents",
      },
      {
        id: "artifact-preview",
        group: "产物链路",
        title: "网页、文档、PPT 预览",
        desc: "HTML 预览、文档段落引用、PPT 翻页浏览均可从聊天流或右侧工作台进入。",
        evidence: [hasHtml && "网页", hasDocument && "文档", hasSlides && "PPT"].filter(Boolean).join(" / ") || "启动演示后自动注入三类产物",
        status: hasHtml && hasDocument && hasSlides ? "ready" : "demo",
        target: "right-panel",
        tab: "preview",
      },
      {
        id: "code-history",
        group: "产物链路",
        title: "代码编辑、Diff 与版本历史",
        desc: "代码可编辑并保存新版本，Diff 可应用为版本，历史可预览、回滚、交给 Agent。",
        evidence: hasVersions ? "HTML v1/v2 版本链已生成" : "演示会注入 v1/v2 与 Diff",
        status: hasVersions ? "ready" : "demo",
        target: "right-panel",
        tab: "history",
      },
      {
        id: "deploy",
        group: "产物链路",
        title: "部署到第三方平台",
        desc: "部署面板支持平台选择、日志、进度、失败重试和外部访问链接。",
        evidence: hasDeployCard ? `部署状态：${deployStatus || "done"}` : "演示会生成部署状态卡片",
        status: hasDeployCard ? "ready" : "demo",
        target: "right-panel",
        tab: "deploy",
      },
    ];
  }, [artifacts, contextReferences, conversations, deployStatus, deployUrl, messages, sessionAgentStatuses, taskFlow, userAgents.length]);
}

export function AcceptanceGuideView() {
  const { setActiveNav } = useNavigationStore();
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const switchConversation = useWorkspaceStore((state) => state.switchConversation);
  const items = useGuideItems();
  const readyCount = items.filter((item) => item.status === "ready").length;

  const prepareDemo = () => {
    startAcceptanceDemo();
    setActiveConversation(ACCEPTANCE_GROUP_CONVERSATION_ID);
    switchConversation(ACCEPTANCE_GROUP_CONVERSATION_ID);
  };

  const openGuideItem = (item: GuideItem) => {
    prepareDemo();
    const nextNav: NavKey =
      item.target === "agents" ? "agents" :
      item.target === "my-agents" ? "my-agents" :
      item.target === "tasks" ? "tasks" :
      "chat";
    setActiveNav(nextNav);

    if (item.target === "right-panel" && item.tab) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab: item.tab } }));
      }, 80);
    }
  };

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);

  const walkthrough = [
    { label: "启动验收演示", item: items[0] },
    { label: "进入群聊并查看 PMO 调度", item: items.find((item) => item.id === "pmo-orchestration") },
    { label: "打开预览 / 文档 / PPT", item: items.find((item) => item.id === "artifact-preview") },
    { label: "查看 Diff 与版本历史", item: items.find((item) => item.id === "code-history") },
    { label: "检查部署与上下文引用", item: items.find((item) => item.id === "deploy") },
  ].filter((step): step is { label: string; item: GuideItem } => Boolean(step.item));

  return (
    <div data-testid="acceptance-guide" className="h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 py-6">
        <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>课题验收导览</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--fg-primary)" }}>一条路径讲清楚整个项目</h1>
            <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--fg-tertiary)", lineHeight: 1.75 }}>
              这里把课题要求拆成可点击的验收点。每一项都能直接跳到对应会话、Agent 页面或右侧产物工作台 Tab。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" data-testid="acceptance-reset" onClick={prepareDemo} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white" style={{ background: "#174ea6" }}>
                <Icon path="M5 3l14 9-14 9V3z" />
                重置并启动演示
              </button>
              <button type="button" data-testid="acceptance-start-chat" onClick={() => openGuideItem(items[0])} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.16)" }}>
                <Icon path="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                从会话开始
              </button>
            </div>
          </div>

          <aside className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
            <CompletionBar done={readyCount} total={items.length} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "已完成", value: readyCount },
                { label: "可演示", value: items.filter((item) => item.status === "demo").length },
                { label: "总项", value: items.length },
              ].map((stat) => (
                <div key={stat.label} className="rounded-md p-2" style={{ background: "var(--surface-low)" }}>
                  <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{stat.label}</p>
                  <p className="mt-1 text-lg font-bold" style={{ color: "var(--fg-primary)" }}>{stat.value}</p>
                </div>
              ))}
            </div>
          </aside>
        </header>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {grouped.map((entry) => (
              <section key={entry.group}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-bold" style={{ color: "var(--fg-primary)" }}>{entry.group}</h2>
                  <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{entry.items.filter((item) => item.status === "ready").length} / {entry.items.length}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {entry.items.map((item) => (
                    <article key={item.id} className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{item.title}</h3>
                          <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.65 }}>{item.desc}</p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="rounded-md px-3 py-2 text-xs" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", lineHeight: 1.55 }}>
                        {item.evidence}
                      </p>
                      <button type="button" data-testid={`guide-item-${item.id}`} onClick={() => openGuideItem(item)} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.14)" }}>
                        <Icon path="M9 18l6-6-6-6" size={12} />
                        演示这一项
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
              <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>推荐演示顺序</h2>
              <div className="mt-3 space-y-2">
                {walkthrough.map((step, index) => (
                  <button key={step.label} type="button" onClick={() => openGuideItem(step.item)} className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-[var(--surface-low)]">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: "#174ea6" }}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{step.label}</span>
                      <span className="block truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{step.item.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
              <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>答辩提示</h2>
              <div className="mt-3 space-y-2 text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.7 }}>
                <p>先讲 PMO 如何拆任务，再展示 Codex、Claude Code、Open Code、自建 UX Reviewer 的协作关系。</p>
                <p>产物部分按“预览、编辑、Diff、历史、部署、引用段落继续追问”的顺序演示。</p>
                <p>所有按钮都会先准备演示数据，避免现场从空状态开始。</p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
