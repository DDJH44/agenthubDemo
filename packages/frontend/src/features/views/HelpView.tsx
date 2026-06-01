"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  { q: "如何创建一个新任务？", a: "在左侧导航栏点击「新建任务」按钮，填写任务描述，系统将自动匹配合适的智能体团队。" },
  { q: "支持哪些 LLM 模型？", a: "当前支持 GPT-4o-mini、豆包（Doubao）等模型。可以通过设置页面配置 API Key 和模型参数。" },
  { q: "如何添加自定义智能体？", a: "进入「智能体市场」浏览社区智能体或前往「我的智能体」创建自定义智能体，配置系统提示词和工具集。" },
  { q: "MCP 协议是什么？", a: "MCP（Model Context Protocol）是一种标准化协议，用于连接外部工具和数据源。在「MCP」页面可以管理服务器连接。" },
  { q: "工作流如何编排？", a: "在工作流页面使用画布编辑器拖拽智能体节点并连线，支持 DAG 有向无环图编排，可并行或串行执行任务。" },
];

const GUIDES = [
  { title: "快速开始", desc: "5 分钟上手 AgentHub，创建你的第一个 AI 任务", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { title: "智能体配置指南", desc: "深入了解如何配置智能体的模型、工具和提示词", icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" },
  { title: "工作流编排入门", desc: "学习使用画布编辑器创建多智能体协作流程", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { title: "部署与发布", desc: "将智能体生成的产物一键部署到线上环境", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
];

export function HelpView() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--surface-white)" }}>
      <div className="px-6 sm:px-8 pt-6 pb-4" style={{ maxWidth: 1440 }}>
        <div className="mb-8">
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)", marginBottom: 4 }}>
            帮助与支持
          </h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>
            快速上手 AgentHub，了解核心功能和最佳实践
          </p>
        </div>

        <div className="mb-8">
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-primary)", marginBottom: 12 }}>快速入门指南</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {GUIDES.map((g) => (
              <div key={g.title} className="rounded-xl p-4 transition-all hover:border-[var(--accent-border)]" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
                      <path d={g.icon} />
                    </svg>
                  </div>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>{g.title}</span>
                </div>
                <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", lineHeight: 1.5 }}>{g.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-primary)", marginBottom: 12 }}>常见问题</h3>
          <div className="space-y-1">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <button onClick={() => setExpanded(expanded === i ? null : i)}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${expanded === i ? "bg-[var(--bg-hover)]" : "bg-[var(--surface-white)] hover:bg-[var(--bg-hover)]"}`}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>{item.q}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round"
                    style={{ transform: expanded === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {expanded === i && (
                  <div className="px-4 pb-3" style={{ background: "var(--bg-hover)" }}>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", lineHeight: 1.7 }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>需要更多帮助？</p>
              <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>联系我们的支持团队，我们将在 24 小时内回复</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
