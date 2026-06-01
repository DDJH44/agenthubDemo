"use client";

import { useState } from "react";
import { useUserAgentStore } from "@/stores/user-agent-store";

const MARKET_AGENTS = [
  { id: "code-reviewer", name: "代码审查专家", desc: "自动审查代码质量、安全性和最佳实践", emoji: "🔍", color: "#2b7fff", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个代码审查专家...", tools: [], avatar: "", avatarBg: "#2b7fff" },
  { id: "data-analyst", name: "数据分析师", desc: "处理数据、生成图表和分析报告", emoji: "📊", color: "#006c49", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个数据分析师...", tools: [], avatar: "", avatarBg: "#006c49" },
  { id: "doc-generator", name: "文档生成器", desc: "自动生成 API 文档和使用指南", emoji: "📝", color: "#825100", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个文档生成器...", tools: [], avatar: "", avatarBg: "#825100" },
  { id: "test-engineer", name: "测试工程师", desc: "编写单元测试、集成测试和 E2E 测试", emoji: "🧪", color: "#ba1a1a", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个测试工程师...", tools: [], avatar: "", avatarBg: "#ba1a1a" },
  { id: "devops-helper", name: "DevOps 助手", desc: "CI/CD 配置、容器编排和部署管理", emoji: "🚀", color: "var(--accent)", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个DevOps助手...", tools: [], avatar: "", avatarBg: "var(--accent)" },
  { id: "security-auditor", name: "安全审计员", desc: "扫描漏洞、检查依赖和合规审计", emoji: "🛡️", color: "#7c3aed", role: "custom" as const, model: "gpt-4o-mini" as const, systemPrompt: "你是一个安全审计员...", tools: [], avatar: "", avatarBg: "#7c3aed" },
];

export function AgentMarketView() {
  const { agents, addAgent, removeAgent } = useUserAgentStore();
  const [installed, setInstalled] = useState<Set<string>>(
    new Set(agents.filter((a) => MARKET_AGENTS.some((m) => m.id === a.id)).map((a) => a.id))
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleInstall = (agent: typeof MARKET_AGENTS[number]) => {
    if (installed.has(agent.id)) {
      removeAgent(agent.id);
      setInstalled((prev) => { const next = new Set(prev); next.delete(agent.id); return next; });
      setFeedback(`${agent.name} 已卸载`);
    } else {
      addAgent({ ...agent });
      setInstalled((prev) => new Set(prev).add(agent.id));
      setFeedback(`${agent.name} 已安装到我的智能体`);
    }
    setTimeout(() => setFeedback(null), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--surface-white)" }}>
      <div className="px-8 pt-6 pb-4">
        <div className="mb-6">
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
            智能体市场
          </h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)", marginTop: 2 }}>
            发现和安装社区智能体，扩展你的 AI 团队
          </p>
          {feedback && (
            <div className="mt-2 rounded-lg px-3 py-1.5 inline-block" style={{ fontSize: "var(--text-xs)", color: "var(--success)", background: "var(--success-subtle)" }}>
              {feedback}
            </div>
          )}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {MARKET_AGENTS.map((item) => {
            const isInstalled = installed.has(item.id);
            return (
              <div
                key={item.name}
                className="rounded-xl p-4 transition-all"
                style={{
                  background: "var(--surface-white)", border: "1px solid",
                  borderColor: isInstalled ? "var(--success)" : "var(--border)",
                  boxShadow: "var(--shadow-xs)",
                }}
                onMouseEnter={(e) => { if (!isInstalled) e.currentTarget.style.borderColor = item.color; }}
                onMouseLeave={(e) => { if (!isInstalled) e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ width: 40, height: 40, background: item.color, fontSize: 18 }}>
                    {item.emoji}
                  </div>
                  <div>
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-primary)" }}>{item.name}</p>
                    <span className="rounded px-1.5 py-px" style={{ fontSize: 9, fontWeight: 500, background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
                      {isInstalled ? "已安装" : "社区"}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", lineHeight: 1.5, marginBottom: 12 }}>
                  {item.desc}
                </p>
                <button onClick={() => handleInstall(item)}
                  className="w-full h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all font-medium active:scale-[0.98]"
                  style={{
                    fontSize: "var(--text-2xs)",
                    color: isInstalled ? "var(--danger)" : "var(--accent)",
                    background: isInstalled ? "var(--danger-subtle)" : "var(--accent-subtle)",
                    border: `1px solid ${isInstalled ? "rgba(186,26,26,0.2)" : "var(--accent-border)"}`,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {isInstalled
                      ? <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a2 2 0 012-2h4a2 2 0 012 2v3" />
                      : <path d="M12 5v14 M5 12h14" />
                    }
                  </svg>
                  {isInstalled ? "卸载" : "安装"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
