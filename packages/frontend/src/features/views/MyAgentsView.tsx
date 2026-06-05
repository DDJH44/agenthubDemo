"use client";

import { useMemo, useState } from "react";
import type { AgentLLMProvider, AgentRole, ModelId, ToolType, UserAgent } from "@agenthub/shared";
import { useNavigationStore } from "@/stores/navigation-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { api } from "@/lib/api-client";
import { AgentCard } from "./AgentCard";

const AVATAR_COLORS = ["#174ea6", "#0f766e", "#9a6700", "#a50e0e", "#7c3aed", "#0e7490", "#5f6368"];
const AVATAR_TEXT = ["UX", "FE", "BE", "QA", "PM", "AI", "DB", "OP"];

const ROLE_OPTIONS: Array<{ value: AgentRole; label: string; desc: string }> = [
  { value: "custom", label: "自建专家", desc: "按业务场景自定义职责" },
  { value: "coder", label: "代码工程师", desc: "生成和修改代码" },
  { value: "critic", label: "审查 Agent", desc: "质量检查和风险提示" },
  { value: "researcher", label: "研究 Agent", desc: "查资料、整理上下文" },
  { value: "frontend", label: "前端 Agent", desc: "UI 和交互实现" },
  { value: "backend", label: "后端 Agent", desc: "接口和数据处理" },
  { value: "reviewer", label: "评审 Agent", desc: "验收路径和文档审阅" },
];

const MODEL_OPTIONS: Array<{ value: ModelId; label: string }> = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "qwen-max", label: "Qwen Max" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
];

const LLM_PROVIDER_OPTIONS: Array<{ value: AgentLLMProvider; label: string; baseURL: string; model: string }> = [
  { value: "inherit", label: "继承系统配置", baseURL: "", model: "gpt-4o-mini" },
  { value: "volc-ark", label: "火山方舟 / 豆包", baseURL: "https://ark.cn-beijing.volces.com/api/v3", model: "ep-20260508214225-g6x7g" },
  { value: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { value: "custom", label: "OpenAI 兼容接口", baseURL: "", model: "" },
];

const TOOL_OPTIONS: Array<{ value: ToolType; label: string }> = [
  { value: "code_execution", label: "代码执行" },
  { value: "web_search", label: "网页搜索" },
  { value: "file_read", label: "读文件" },
  { value: "file_write", label: "写文件" },
  { value: "shell", label: "Shell" },
  { value: "diff_apply", label: "应用 Diff" },
  { value: "browser", label: "浏览器" },
];

const TEMPLATES = [
  {
    name: "UX Reviewer",
    role: "reviewer" as AgentRole,
    avatar: "UX",
    color: "#a50e0e",
    model: "gpt-4o-mini" as ModelId,
    tools: ["file_read", "web_search"] as ToolType[],
    prompt: "你是 UX Reviewer，负责检查界面是否克制、清晰、符合验收路径。输出具体问题、优先级和修改建议。",
  },
  {
    name: "Build Fixer",
    role: "coder" as AgentRole,
    avatar: "BF",
    color: "#0f766e",
    model: "gpt-4o-mini" as ModelId,
    tools: ["code_execution", "file_read", "file_write", "shell", "diff_apply"] as ToolType[],
    prompt: "你是 Build Fixer，负责定位构建失败、类型错误和测试失败，并用最小改动修复问题。",
  },
  {
    name: "Requirement Analyst",
    role: "researcher" as AgentRole,
    avatar: "RA",
    color: "#174ea6",
    model: "gpt-4o-mini" as ModelId,
    tools: ["file_read", "web_search"] as ToolType[],
    prompt: "你是 Requirement Analyst，负责从课题说明、文档段落和历史对话中提取验收点，并转成可执行任务。",
  },
];

interface AgentFormState {
  name: string;
  avatar: string;
  avatarBg: string;
  role: AgentRole;
  model: ModelId;
  provider: AgentLLMProvider;
  baseURL: string;
  apiKey: string;
  hasApiKey?: boolean;
  apiKeyHint?: string;
  systemPrompt: string;
  tools: ToolType[];
}

interface AgentConnectionTestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  sample?: string;
  error?: string;
}

interface AgentConnectionStatus {
  agentId: string;
  ok: boolean;
  text: string;
}

function emptyForm(): AgentFormState {
  return {
    name: "",
    avatar: "AI",
    avatarBg: AVATAR_COLORS[0],
    role: "custom",
    model: "gpt-4o-mini",
    provider: "inherit",
    baseURL: "",
    apiKey: "",
    hasApiKey: false,
    apiKeyHint: "",
    systemPrompt: "",
    tools: [],
  };
}

function fromAgent(agent: UserAgent): AgentFormState {
  return {
    name: agent.name,
    avatar: agent.avatar || agent.name.slice(0, 2).toUpperCase(),
    avatarBg: agent.avatarBg,
    role: agent.role,
    model: agent.model,
    provider: agent.provider ?? "inherit",
    baseURL: agent.baseURL ?? "",
    apiKey: "",
    hasApiKey: agent.hasApiKey,
    apiKeyHint: agent.apiKeyHint,
    systemPrompt: agent.systemPrompt,
    tools: agent.tools,
  };
}

function parseDescription(description: string): AgentFormState {
  const text = description.toLowerCase();
  const form = emptyForm();

  if (text.includes("ux") || text.includes("ui") || text.includes("体验")) {
    form.name = "UX Reviewer";
    form.avatar = "UX";
    form.avatarBg = "#a50e0e";
    form.role = "reviewer";
    form.tools = ["file_read", "web_search"];
  } else if (text.includes("前端") || text.includes("react") || text.includes("页面")) {
    form.name = "Frontend Agent";
    form.avatar = "FE";
    form.avatarBg = "#174ea6";
    form.role = "frontend";
    form.tools = ["code_execution", "file_read", "file_write", "diff_apply"];
  } else if (text.includes("后端") || text.includes("api") || text.includes("数据库")) {
    form.name = "Backend Agent";
    form.avatar = "BE";
    form.avatarBg = "#0f766e";
    form.role = "backend";
    form.tools = ["code_execution", "file_read", "file_write", "shell"];
  } else if (text.includes("测试") || text.includes("验收")) {
    form.name = "QA Reviewer";
    form.avatar = "QA";
    form.avatarBg = "#9a6700";
    form.role = "critic";
    form.tools = ["file_read", "code_execution", "browser"];
  } else {
    form.name = "Custom Agent";
    form.avatar = "AI";
    form.avatarBg = "#7c3aed";
    form.role = "custom";
    form.tools = ["file_read"];
  }

  form.systemPrompt = `你是 ${form.name}。用户需求：${description.trim()}。请用清晰、可执行的方式完成任务，并在不确定时说明假设。`;
  return form;
}

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function AgentForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  editing,
}: {
  value: AgentFormState;
  onChange: (next: AgentFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  editing: boolean;
}) {
  const setField = <K extends keyof AgentFormState>(key: K, fieldValue: AgentFormState[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const toggleTool = (tool: ToolType) => {
    setField("tools", value.tools.includes(tool) ? value.tools.filter((item) => item !== tool) : [...value.tools, tool]);
  };

  const selectProvider = (provider: AgentLLMProvider) => {
    const preset = LLM_PROVIDER_OPTIONS.find((item) => item.value === provider);
    onChange({
      ...value,
      provider,
      baseURL: preset?.baseURL ?? value.baseURL,
      model: (preset?.model || value.model) as ModelId,
    });
  };

  return (
    <div className="rounded-lg p-5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--fg-primary)" }}>{editing ? "编辑自建 Agent" : "创建自建 Agent"}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>配置名称、角色、模型、系统提示词和工具权限。</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-md text-sm font-bold text-white" style={{ background: value.avatarBg }}>
          {value.avatar || value.name.charAt(0).toUpperCase() || "AI"}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>名称 *</span>
          <input
            value={value.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="例如：UX Reviewer"
            className="h-10 w-full rounded-md px-3 text-sm outline-none"
            style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>头像文字</span>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_TEXT.map((avatar) => (
              <button
                key={avatar}
                type="button"
                onClick={() => setField("avatar", avatar)}
                className="h-8 rounded-md px-2 text-xs font-bold"
                style={{
                  color: value.avatar === avatar ? "#fff" : "var(--fg-secondary)",
                  background: value.avatar === avatar ? value.avatarBg : "var(--surface-low)",
                  border: "1px solid var(--border)",
                }}
              >
                {avatar}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>角色</span>
          <select
            value={value.role}
            onChange={(event) => setField("role", event.target.value as AgentRole)}
            className="h-10 w-full rounded-md px-3 text-sm outline-none"
            style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
          >
            {ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>模型</span>
          <input
            value={value.model}
            onChange={(event) => setField("model", event.target.value as ModelId)}
            list="agent-model-options"
            placeholder="ep-xxx / gpt-4o-mini / deepseek-chat"
            className="h-10 w-full rounded-md px-3 text-sm outline-none"
            style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
          />
          <datalist id="agent-model-options">
            {MODEL_OPTIONS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
          </datalist>
        </label>
      </div>

      <div className="mt-4 rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>LLM 接入</p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
              继承系统配置，或为这个 Agent 单独接入 OpenAI 兼容 API。
            </p>
          </div>
          {value.hasApiKey && (
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--success)", background: "var(--success-subtle)" }}>
              已保存 {value.apiKeyHint || ""}
            </span>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>供应商</span>
            <select
              value={value.provider}
              onChange={(event) => selectProvider(event.target.value as AgentLLMProvider)}
              className="h-10 w-full rounded-md px-3 text-sm outline-none"
              style={{ color: "var(--fg-primary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            >
              {LLM_PROVIDER_OPTIONS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
            </select>
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>Base URL</span>
            <input
              value={value.baseURL}
              onChange={(event) => setField("baseURL", event.target.value)}
              disabled={value.provider === "inherit"}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
              className="h-10 w-full rounded-md px-3 text-sm outline-none disabled:opacity-60"
              style={{ color: "var(--fg-primary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            />
          </label>

          <label className="block lg:col-span-3">
            <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>API Key</span>
            <input
              type="password"
              value={value.apiKey}
              onChange={(event) => setField("apiKey", event.target.value)}
              disabled={value.provider === "inherit"}
              placeholder={value.hasApiKey ? "留空表示继续使用已保存密钥" : "只保存在服务端，不会明文回显"}
              className="h-10 w-full rounded-md px-3 text-sm outline-none disabled:opacity-60"
              style={{ color: "var(--fg-primary)", background: "var(--surface-white)", border: "1px solid var(--border)" }}
            />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>头像颜色</span>
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setField("avatarBg", color)}
              className="h-7 w-7 rounded-md"
              style={{ background: color, border: value.avatarBg === color ? "2px solid var(--fg-primary)" : "2px solid transparent" }}
              aria-label={`选择颜色 ${color}`}
            />
          ))}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>系统提示词</span>
        <textarea
          value={value.systemPrompt}
          onChange={(event) => setField("systemPrompt", event.target.value)}
          placeholder="描述这个 Agent 的职责、边界和输出格式。"
          rows={4}
          className="w-full resize-none rounded-md px-3 py-2 text-sm outline-none"
          style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.6 }}
        />
      </label>

      <div className="mt-4">
        <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>工具权限</span>
        <div className="flex flex-wrap gap-1.5">
          {TOOL_OPTIONS.map((tool) => {
            const active = value.tools.includes(tool.value);
            return (
              <button
                key={tool.value}
                type="button"
                onClick={() => toggleTool(tool.value)}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  color: active ? "#174ea6" : "var(--fg-secondary)",
                  background: active ? "rgba(23, 78, 166, 0.07)" : "var(--surface-low)",
                  border: `1px solid ${active ? "rgba(23, 78, 166, 0.18)" : "var(--border)"}`,
                }}
              >
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--divider)" }}>
        <button type="button" onClick={onCancel} className="h-9 rounded-md px-4 text-sm font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
          取消
        </button>
        <button type="button" onClick={onSubmit} disabled={!value.name.trim()} className="h-9 rounded-md px-4 text-sm font-semibold text-white" style={{ background: value.name.trim() ? "#174ea6" : "var(--surface-mid)", color: value.name.trim() ? "#fff" : "var(--fg-disabled)" }}>
          {editing ? "保存修改" : "创建 Agent"}
        </button>
      </div>
    </div>
  );
}

export function MyAgentsView() {
  const { agents, addAgent, updateAgent, removeAgent } = useUserAgentStore();
  const { setActiveNav } = useNavigationStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<UserAgent | null>(null);
  const [form, setForm] = useState<AgentFormState>(() => emptyForm());
  const [description, setDescription] = useState("");
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<AgentConnectionStatus | null>(null);

  const stats = useMemo(() => {
    const toolCount = new Set(agents.flatMap((agent) => agent.tools)).size;
    return [
      { label: "自建 Agent", value: agents.length },
      { label: "已授权工具", value: toolCount },
      { label: "代码类", value: agents.filter((agent) => ["coder", "frontend", "backend"].includes(agent.role)).length },
    ];
  }, [agents]);

  const startCreate = (nextForm = emptyForm()) => {
    setEditingAgent(null);
    setForm(nextForm);
    setFormOpen(true);
  };

  const startEdit = (agent: UserAgent) => {
    setEditingAgent(agent);
    setForm(fromAgent(agent));
    setFormOpen(true);
  };

  const saveForm = () => {
    const payload = {
      name: form.name.trim(),
      avatar: form.avatar,
      avatarBg: form.avatarBg,
      role: form.role,
      model: form.model,
      provider: form.provider,
      baseURL: form.provider === "inherit" ? "" : form.baseURL.trim(),
      apiKey: form.provider === "inherit" ? "" : form.apiKey.trim(),
      hasApiKey: form.hasApiKey,
      apiKeyHint: form.apiKeyHint,
      systemPrompt: form.systemPrompt.trim(),
      tools: form.tools,
    };
    if (!payload.name) return;

    if (editingAgent) {
      updateAgent(editingAgent.id, payload);
    } else {
      addAgent(payload);
    }
    setFormOpen(false);
    setEditingAgent(null);
    setForm(emptyForm());
  };

  const testAgentConnection = async (agent: UserAgent) => {
    setTestingAgentId(agent.id);
    setConnectionStatus(null);
    try {
      const result = await api.post<AgentConnectionTestResult>(`/api/user-agents/${agent.id}/test`, {});
      setConnectionStatus({
        agentId: agent.id,
        ok: true,
        text: `连接正常 · ${result.model || agent.model} · ${result.latencyMs}ms`,
      });
    } catch (error) {
      setConnectionStatus({
        agentId: agent.id,
        ok: false,
        text: error instanceof Error ? error.message : "连接测试失败",
      });
    } finally {
      setTestingAgentId(null);
    }
  };

  const applyDescription = () => {
    if (!description.trim()) return;
    startCreate(parseDescription(description));
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 py-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>用户自建 Agent</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--fg-primary)" }}>我的 Agent</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--fg-tertiary)", lineHeight: 1.7 }}>
              创建可以加入聊天列表的专属 Agent。每个 Agent 都有头像、名称、角色、模型和能力标签。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActiveNav("agents")} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.16)" }}>
              <Icon path="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
              查看平台 Agent
            </button>
            <button type="button" onClick={() => startCreate()} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white" style={{ background: "#174ea6" }}>
              <Icon path="M12 5v14M5 12h14" />
              手动创建
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>{stat.label}</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: "var(--fg-primary)" }}>{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
            <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>描述式创建</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>用一句话描述你需要的 Agent，系统会生成初始配置，你可以再编辑。</p>
            <div className="mt-3 flex gap-2">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：我需要一个 UX Reviewer，负责检查页面是否有 AI 味，并输出验收修改建议。"
                rows={3}
                className="min-w-0 flex-1 resize-none rounded-md px-3 py-2 text-sm outline-none"
                style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)", lineHeight: 1.6 }}
              />
              <button type="button" onClick={applyDescription} disabled={!description.trim()} className="w-24 rounded-md text-xs font-semibold text-white" style={{ background: description.trim() ? "#174ea6" : "var(--surface-mid)", color: description.trim() ? "#fff" : "var(--fg-disabled)" }}>
                生成配置
              </button>
            </div>
          </div>

          <aside className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
            <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>常用模板</h2>
            <div className="mt-3 space-y-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => startCreate({ ...emptyForm(), name: template.name, avatar: template.avatar, avatarBg: template.color, role: template.role, model: template.model, systemPrompt: template.prompt, tools: template.tools })}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-[var(--surface-low)]"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md text-xs font-bold text-white" style={{ background: template.color }}>{template.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{template.name}</span>
                    <span className="block truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{template.tools.length} 个工具</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </section>

        {formOpen && (
          <AgentForm
            value={form}
            onChange={setForm}
            onSubmit={saveForm}
            onCancel={() => { setFormOpen(false); setEditingAgent(null); }}
            editing={!!editingAgent}
          />
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold" style={{ color: "var(--fg-primary)" }}>Agent 列表</h2>
            <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{agents.length} 个</span>
          </div>
          {agents.length === 0 ? (
            <div className="rounded-lg px-6 py-12 text-center" style={{ background: "var(--surface-white)", border: "1px dashed var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>还没有自建 Agent</h3>
              <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--fg-tertiary)", lineHeight: 1.7 }}>
                从模板创建一个 UX Reviewer，或用描述式创建生成自己的 Agent。
              </p>
              <button type="button" onClick={() => startCreate({ ...emptyForm(), name: TEMPLATES[0].name, avatar: TEMPLATES[0].avatar, avatarBg: TEMPLATES[0].color, role: TEMPLATES[0].role, model: TEMPLATES[0].model, systemPrompt: TEMPLATES[0].prompt, tools: TEMPLATES[0].tools })} className="mt-4 h-9 rounded-md px-4 text-xs font-semibold text-white" style={{ background: "#174ea6" }}>
                创建 UX Reviewer
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={startEdit}
                  onDelete={removeAgent}
                  onTest={testAgentConnection}
                  testing={testingAgentId === agent.id}
                  connectionStatus={connectionStatus?.agentId === agent.id ? connectionStatus : null}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
