"use client";

import { useMemo, useState, type ReactNode } from "react";

type HelpRoute = "chat" | "ai-assistant" | "my-agents" | "workflows" | "mcp" | "settings" | "knowledge" | "files";

const QUICK_ACTIONS: Array<{ title: string; desc: string; route: HelpRoute; icon: string }> = [
  { title: "打开会话", desc: "查看群聊、单聊和 Agent 执行消息。", route: "chat", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
  { title: "配置模型", desc: "检查 API Key、Base URL 和默认模型。", route: "settings", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { title: "管理智能体", desc: "创建自建智能体并接入 LLM API。", route: "my-agents", icon: "M12 8V4H8 M4 8h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z M9 14h.01 M15 14h.01" },
  { title: "引用工作流", desc: "在会话中调用已经保存的工作流。", route: "workflows", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { title: "知识库", desc: "管理资料片段，让 Agent 引用上下文。", route: "knowledge", icon: "M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" },
  { title: "文件中心", desc: "查看上传文件和生成产物沉淀。", route: "files", icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7" },
];

const FAQ_ITEMS = [
  {
    category: "会话",
    q: "为什么手机端看起来比电脑端简单？",
    a: "手机端定位是 Remote 遥控器，只保留 AI 助手、会话查看、发消息和确认执行；复杂的代码编辑、预览、部署和产物管理放在电脑端完成。",
  },
  {
    category: "会话",
    q: "Agent 生成代码时应该怎么展示？",
    a: "普通说明保持在消息正文中，代码和 HTML 产物进入独立代码卡片，并同步到右侧产物工作台，便于预览、Diff、历史和部署。",
  },
  {
    category: "部署",
    q: "默认服务器部署失败应该先看哪里？",
    a: "先到设置里的部署页查看默认服务器是否可用，再检查聊天里的部署状态卡片。需要环境变量时，设置页会显示缺失项和模板。",
  },
  {
    category: "智能体",
    q: "自建智能体能不能接入自己的 LLM？",
    a: "可以。先在设置中配置默认模型，也可以在我的智能体里为单个智能体补充模型、Base URL、API Key、系统提示词和能力标签。",
  },
  {
    category: "工作流",
    q: "工作流和会话怎么联动？",
    a: "保存工作流后，可在会话输入框引用。执行时会带上当前会话上下文，结果回到当前会话和产物工作台。",
  },
  {
    category: "知识库",
    q: "知识库和文件栏分别有什么用？",
    a: "文件栏管理上传文件和生成产物；知识库把文件或手写资料拆成可检索片段，供 Agent 在回答和执行任务时引用。",
  },
];

const READINESS_CHECKS = [
  "模型 API 已配置",
  "默认服务器可部署",
  "会话能流式回复",
  "代码产物能预览和部署",
  "自建智能体能参与群聊",
  "手机端可确认执行任务",
];

function navigateTo(route: HelpRoute) {
  window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key: route } }));
}

function copyDiagnostics() {
  const text = [
    "AgentHub 支持信息",
    `时间：${new Date().toISOString()}`,
    `地址：${window.location.href}`,
    `浏览器：${navigator.userAgent}`,
    `屏幕：${window.innerWidth}x${window.innerHeight}`,
  ].join("\n");
  return navigator.clipboard.writeText(text);
}

export function HelpView() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFaq = useMemo(() => {
    if (!normalizedQuery) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => `${item.category} ${item.q} ${item.a}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);

  const filteredActions = useMemo(() => {
    if (!normalizedQuery) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter((item) => `${item.title} ${item.desc}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);

  const handleCopyDiagnostics = async () => {
    await copyDiagnostics();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--surface-white)" }}>
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--accent)" }}>Support Center</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>帮助与支持</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--fg-tertiary)" }}>围绕会话、智能体、部署和资料管理排查问题。</p>
          </div>
          <div className="relative w-full max-w-sm">
            <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索问题、功能或场景"
              className="h-10 w-full rounded-lg pl-9 pr-3 text-sm outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--surface-low)", color: "var(--fg-primary)" }}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Panel>
              <SectionTitle title="快捷入口" desc="直接跳到对应工作区继续处理。" />
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                {filteredActions.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => navigateTo(item.route)}
                    className="rounded-lg p-3 text-left transition-colors hover:bg-[var(--surface-low)]"
                    style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d={item.icon} />
                        </svg>
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{item.title}</span>
                    </div>
                    <p className="text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>{item.desc}</p>
                  </button>
                ))}
              </div>
              {filteredActions.length === 0 ? <EmptyText>没有匹配的快捷入口</EmptyText> : null}
            </Panel>

            <Panel>
              <SectionTitle title="常见问题" desc="按当前课题功能场景整理。" />
              <div className="space-y-2">
                {filteredFaq.map((item, index) => {
                  const open = expanded === index;
                  return (
                    <div key={`${item.category}-${item.q}`} className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : index)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        style={{ background: open ? "var(--bg-hover)" : "var(--surface-white)" }}
                      >
                        <span className="min-w-0">
                          <span className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{item.category}</span>
                          <span className="block text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{item.q}</span>
                        </span>
                        <svg aria-hidden="true" className="shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {open ? (
                        <div className="px-4 pb-3" style={{ background: "var(--bg-hover)" }}>
                          <p className="text-sm leading-7" style={{ color: "var(--fg-secondary)" }}>{item.a}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {filteredFaq.length === 0 ? <EmptyText>没有找到相关问题</EmptyText> : null}
              </div>
            </Panel>
          </div>

          <aside className="space-y-4">
            <Panel>
              <SectionTitle title="运行检查" desc="使用前建议确认。" />
              <div className="space-y-2">
                {READINESS_CHECKS.map((item, index) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: "var(--surface-low)" }}>
                    <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--accent)" }}>{index + 1}</span>
                    <span className="text-xs font-medium" style={{ color: "var(--fg-primary)" }}>{item}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionTitle title="定位问题" desc="复制基础环境信息。" />
              <button type="button" onClick={handleCopyDiagnostics} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--accent-border)", background: "var(--accent-subtle)", color: "var(--accent)" }}>
                {copied ? "已复制" : "复制诊断信息"}
              </button>
            </Panel>

            <Panel>
              <SectionTitle title="推荐流程" desc="遇到异常时按顺序排查。" />
              <div className="space-y-2 text-xs leading-6" style={{ color: "var(--fg-secondary)" }}>
                <p>1. 先确认模型 API 是否可用。</p>
                <p>2. 再检查会话是否连上 WebSocket。</p>
                <p>3. 代码产物异常时打开产物工作台。</p>
                <p>4. 部署异常时查看部署卡片和默认服务器状态。</p>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-lg p-4" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
      {children}
    </section>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="rounded-lg px-3 py-4 text-center text-sm" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>{children}</p>;
}
