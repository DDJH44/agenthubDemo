"use client";

import { useState, useRef, useEffect } from "react";
import type { UserAgent, AgentRole, ModelId, ToolType } from "@agenthub/shared";
import { AGENT_ROLE_LABELS, MODEL_OPTIONS, TOOL_OPTIONS, AVATAR_COLORS } from "@agenthub/shared";

const EMOJI_OPTIONS = ["🤖", "🐍", "🎨", "📊", "📝", "🔬", "💻", "🚀", "🔧", "🧠", "⚡", "🎯"];

interface AgentCreatorProps {
  onSave: (data: Omit<UserAgent, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

type Step = "describe" | "review" | "confirm";

export function AgentCreatorView({ onSave, onCancel }: AgentCreatorProps) {
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [parsed, setParsed] = useState<{
    name: string; role: string; model: string;
    systemPrompt: string; tools: ToolType[]; avatar: string; avatarBg: string;
  }>({ name: "", role: "custom", model: "gpt-4o-mini", systemPrompt: "", tools: [], avatar: "", avatarBg: AVATAR_COLORS[0] });
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNext = () => {
    if (!description.trim()) return;

    setGenerating(true);
    setMessages((prev) => [...prev, { role: "user", text: description }]);

    const parsed = parseDescription(description);
    setParsed(parsed);

    const response = generateResponse(parsed);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", text: response }]);
      setGenerating(false);
      setStep("review");
    }, 600);
  };

  const handleConfirm = () => {
    onSave({
      name: parsed.name,
      avatar: parsed.avatar,
      avatarBg: parsed.avatarBg,
      role: parsed.role as AgentRole,
      model: parsed.model as ModelId,
      systemPrompt: parsed.systemPrompt,
      tools: parsed.tools,
    });
  };

  const handleRetry = () => {
    setStep("describe");
  };

  const updateField = (field: string, value: string | ToolType[]) => {
    setParsed((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTool = (t: ToolType) => {
    setParsed((prev) => ({
      ...prev,
      tools: prev.tools.includes(t)
        ? prev.tools.filter((x) => x !== t)
        : [...prev.tools, t],
    }));
  };

  return (
    <div className="rounded-xl p-5 animate-fade-in-up"
      style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
      <h3 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)", marginBottom: 4 }}>
        对话式创建智能体
      </h3>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginBottom: 16 }}>
        用自然语言描述你想要的智能体，AI 会自动解析配置
      </p>

      {step === "describe" && (
        <div>
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", maxHeight: 200, overflowY: "auto" }}>
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="rounded-lg px-3 py-2 max-w-[80%]" style={{
                    fontSize: "var(--text-xs)", lineHeight: 1.6,
                    background: m.role === "user" ? "var(--accent)" : "var(--surface-white)",
                    color: m.role === "user" ? "#fff" : "var(--fg-primary)",
                    border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>
          </div>

          <div className="flex gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNext(); } }}
              placeholder="例如：我需要一个 Python 后端工程师，擅长 FastAPI 和 PostgreSQL，能写单元测试..."
              rows={3}
              className="flex-1 rounded-lg px-3 py-2 outline-none resize-none transition-all"
              style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.5 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={handleNext}
              disabled={!description.trim() || generating}
              className="h-full px-5 rounded-lg font-medium self-stretch transition-all"
              style={{
                fontSize: "var(--text-sm)", color: description.trim() && !generating ? "#fff" : "var(--fg-disabled)",
                background: description.trim() && !generating ? "var(--accent-gradient)" : "var(--surface-mid)",
                minHeight: 56,
              }}>
              {generating ? "解析中..." : "解析配置 →"}
            </button>
          </div>

          <div className="flex gap-1.5 mt-3" style={{ flexWrap: "wrap" }}>
            {[
              "Python 后端工程师，用 FastAPI",
              "前端 React 专家，Tailwind CSS",
              "数据分析师，会写 SQL 和画图表",
              "DevOps 工程师，Docker + K8s",
            ].map((hint) => (


              <button key={hint} onClick={() => setDescription(hint)}
                className="rounded-lg px-2.5 py-1 transition-all border border-solid border-[var(--border)] hover:border-[var(--accent-border)] text-[var(--fg-tertiary)] hover:text-[var(--accent)]"
                style={{ fontSize: "var(--text-2xs)" }}>
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "review" && (
        <div>
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--success-subtle)", border: "1px solid rgba(0,108,73,.2)" }}>
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="rounded-lg px-3 py-2 max-w-[80%]" style={{
                    fontSize: "var(--text-xs)", lineHeight: 1.6,
                    background: m.role === "user" ? "var(--accent)" : "var(--surface-white)",
                    color: m.role === "user" ? "#fff" : "var(--fg-primary)",
                    border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>名称</label>
                <input value={parsed.name} onChange={(e) => updateField("name", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 outline-none"
                  style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>角色</label>
                <select value={parsed.role} onChange={(e) => updateField("role", e.target.value)}
                  className="rounded-lg px-3 py-2 outline-none"
                  style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}>
                  {Object.entries(AGENT_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>模型</label>
              <select value={parsed.model} onChange={(e) => updateField("model", e.target.value)}
                className="rounded-lg px-3 py-2 outline-none"
                style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}>
                {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>系统提示词</label>
              <textarea value={parsed.systemPrompt} onChange={(e) => updateField("systemPrompt", e.target.value)}
                rows={3} className="w-full rounded-lg px-3 py-2 outline-none resize-none"
                style={{ fontSize: "var(--text-sm)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)", lineHeight: 1.5 }} />
            </div>

            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>头像</label>
              <div className="flex flex-wrap gap-1">
                {EMOJI_OPTIONS.map((e) => (
                  <button key={e} onClick={() => updateField("avatar", e)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: parsed.avatar === e ? "var(--accent-subtle)" : "var(--surface-low)", border: parsed.avatar === e ? "1px solid var(--accent-border)" : "1px solid transparent", fontSize: 16 }}>{e}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-secondary)", display: "block", marginBottom: 4 }}>工具</label>
              <div className="flex flex-wrap gap-1.5">
                {TOOL_OPTIONS.map((t) => {
                  const active = parsed.tools.includes(t.value);
                  return (
                    <button key={t.value} onClick={() => toggleTool(t.value)}
                      className="rounded-lg px-3 py-1.5 transition-all"
                      style={{ fontSize: "var(--text-2xs)", fontWeight: 500, background: active ? "var(--accent-subtle)" : "var(--surface-low)", color: active ? "var(--accent)" : "var(--fg-tertiary)", border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}` }}>{t.label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={handleRetry}
              className="h-9 px-4 rounded-lg transition-all"
              style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
              重新描述
            </button>
            <button onClick={onCancel}
              className="h-9 px-4 rounded-lg transition-all"
              style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
              取消
            </button>
            <button onClick={handleConfirm}
              className="h-9 px-5 rounded-lg transition-all"
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, background: "var(--accent-gradient)", color: "#fff" }}>
              确认创建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseDescription(desc: string): {
  name: string; role: string; model: string;
  systemPrompt: string; tools: ToolType[]; avatar: string; avatarBg: string;
} {
  const lower = desc.toLowerCase();
  let role = "custom";
  const tools: ToolType[] = [];
  let name = "自定义智能体";
  let avatar = "🤖";
  let model = "gpt-4o-mini";

  if (lower.includes("前端") || lower.includes("react") || lower.includes("vue") || lower.includes("ui")) {
    role = "frontend"; name = "前端工程师"; avatar = "🎨"; tools.push("code_execution");
  }
  if (lower.includes("后端") || lower.includes("api") || lower.includes("fastapi") || lower.includes("django") || lower.includes("node")) {
    role = "backend"; name = "后端工程师"; avatar = "💻"; tools.push("code_execution");
  }
  if (lower.includes("数据") || lower.includes("sql") || lower.includes("分析")) {
    role = "researcher"; name = "数据分析师"; avatar = "📊"; tools.push("web_search");
  }
  if (lower.includes("devops") || lower.includes("docker") || lower.includes("k8s") || lower.includes("部署")) {
    role = "planner"; name = "DevOps 工程师"; avatar = "🚀"; tools.push("shell");
  }
  if (lower.includes("测试") || lower.includes("test")) {
    role = "critic"; name = "测试工程师"; avatar = "🧪"; tools.push("code_execution");
  }
  if (lower.includes("python")) { model = "gpt-4o-mini"; if (name === "自定义智能体") { name = "Python 工程师"; avatar = "🐍"; } }
  if (lower.includes("review") || lower.includes("审查")) { role = "critic"; tools.push("web_search"); }

  const words = desc.split(/[\s,，]+/).filter((w) => w.length > 1);
  const roleKeys = Object.keys(AGENT_ROLE_LABELS);
  for (const w of words) {
    if (roleKeys.includes(w) && w !== "worker") { role = w; break; }
  }

  const systemPrompt = `你是一个${name}，${desc}。用专业、简洁的方式帮助用户完成任务。`;

  return { name, role, model, systemPrompt, tools: [...new Set(tools)] as ToolType[], avatar, avatarBg: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] };
}

function generateResponse(parsed: ReturnType<typeof parseDescription>): string {
  return "已解析配置 ↓\n\n" +
    `👤 名称：${parsed.name}\n` +
    `🎭 角色：${AGENT_ROLE_LABELS[parsed.role] ?? parsed.role}\n` +
    `🧠 模型：${MODEL_OPTIONS.find((m) => m.value === parsed.model)?.label ?? parsed.model}\n` +
    `🔧 工具：${parsed.tools.length > 0 ? parsed.tools.map((t) => TOOL_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ") : "无"}\n\n` +
    "请检查并修改，确认后即可投入使用。";
}
