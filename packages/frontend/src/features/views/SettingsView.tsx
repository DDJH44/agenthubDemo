"use client";

import { useState, useEffect } from "react";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { useSettingsStore } from "@/stores/settings-store";
import { api } from "@/lib/api-client";

interface ConfigStatus {
  adapter: {
    type: string;
    model: string;
    baseURL: string | null;
    apiKeyConfigured: boolean;
    apiKeyPrefix: string | null;
  };
}

const LLM_PRESETS = [
  { key: "volc-doubao", label: "火山引擎 · 豆包", baseURL: "https://ark.cn-beijing.volces.com/api/v3", model: "ep-20260508214225-g6x7g" },
  { key: "mimo", label: "MiMo", baseURL: "https://token-plan-cn.xiaomimimo.com/v1", model: "mimo" },
  { key: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { key: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { key: "custom", label: "自定义", baseURL: "", model: "" },
];

export function SettingsView() {
  const [tab, setTab] = useState("general");
  const { theme, toggleTheme } = useSettingsStore();
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseURLInput, setBaseURLInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("volc-doubao");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (tab === "api") {
      api.get<ConfigStatus>("/api/config/status").then((status) => {
        setConfigStatus(status);
        if (status.adapter.baseURL) setBaseURLInput(status.adapter.baseURL);
        if (status.adapter.model) setModelInput(status.adapter.model);
        const matched = LLM_PRESETS.find((p) => p.baseURL && status.adapter.baseURL?.startsWith(p.baseURL.replace(/\/v\d+$/, "")));
        setSelectedPreset(matched ? matched.key : "custom");
      }).catch(() => setConfigStatus(null));
    }
  }, [tab]);

  const TABS = [
    { key: "general", label: "通用设置", icon: "M14.7 3.3a1 1 0 010 1.4l-1.6 1.6a1 1 0 01-1.4 0L10 4.7a1 1 0 011.4-1.4l.3.3.9-.9a1 1 0 011.4 0zm0 9.4a1 1 0 010 1.4l-1.6 1.6a1 1 0 01-1.4 0L10 14.1a1 1 0 011.4-1.4l.3.3.9-.9a1 1 0 011.4 0zM6 10a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z M12 19a2 2 0 100-4 2 2 0 000 4z" },
    { key: "api", label: "API 密钥", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
    { key: "team", label: "团队管理", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75 M9 11a4 4 0 100-8 4 4 0 000 8z" },
    { key: "export", label: "数据导出", icon: "M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2 M7 11l5 5 5-5 M12 4v12" },
  ];

  return (
    <div className="flex h-full" style={{ background: "var(--page-bg)" }}>
      <div className="shrink-0 py-6 px-4" style={{ width: 220, borderRight: "1px solid var(--divider)", background: "var(--surface-white)" }}>
        <h3 style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 8px 12px" }}>设置</h3>
        <div className="space-y-0.5">
          {TABS.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className="w-full text-left flex items-center gap-2.5 rounded-lg px-2 py-2 transition-all"
              style={{
                fontSize: "var(--text-sm)", fontWeight: tab === item.key ? 550 : 400,
                color: tab === item.key ? "var(--fg-primary)" : "var(--fg-secondary)",
                background: tab === item.key ? "var(--bg-hover)" : "transparent",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6" style={{ background: "var(--surface-white)" }}>
        {tab === "general" && (
          <div style={{ maxWidth: 960 }}>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", marginBottom: 16 }}>通用设置</h2>
            <div className="space-y-4">
              <SettingRow label="外观主题">
                <button onClick={toggleTheme}
                  className="rounded-lg px-4 flex items-center gap-2 transition-colors"
                  style={{ height: 32, fontSize: "var(--text-sm)", border: "1px solid var(--border)", color: "var(--fg-primary)", background: "var(--surface-white)" }}>
                  {theme === "light" ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> 浅色</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> 深色</>
                  )}
                </button>
              </SettingRow>
              <SettingRow label="界面语言">
                <select defaultValue="zh"
                  className="rounded-lg px-3 outline-none" style={{ height: 32, fontSize: "var(--text-sm)", border: "1px solid var(--border)", color: "var(--fg-primary)", background: "var(--surface-white)" }}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </SettingRow>
              <SettingRow label="通知偏好">
                <label className="flex items-center gap-2" style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} /> 启用桌面通知
                </label>
              </SettingRow>
              <SettingRow label="自动保存">
                <label className="flex items-center gap-2" style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} /> 每 5 分钟自动保存草稿
                </label>
              </SettingRow>
            </div>
          </div>
        )}

        {tab === "api" && (
          <div style={{ maxWidth: 960 }}>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", marginBottom: 16 }}>LLM 模型配置</h2>

            <div className="rounded-xl p-4 mb-3" style={{ background: configStatus?.adapter.apiKeyConfigured ? "var(--accent-subtle)" : "var(--surface-low)", border: `1px solid ${configStatus?.adapter.apiKeyConfigured ? "var(--accent-border)" : "var(--border)"}` }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>当前状态</span>
                <span className="rounded px-2 py-0.5" style={{ fontSize: 9, color: configStatus?.adapter.apiKeyConfigured ? "var(--success)" : "var(--fg-disabled)", background: configStatus?.adapter.apiKeyConfigured ? "var(--success-subtle)" : "var(--surface-low)" }}>
                  {configStatus?.adapter.apiKeyConfigured ? "已配置" : "未配置"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 10, color: "var(--fg-secondary)" }}>
                <span>API Key: <code>{configStatus?.adapter.apiKeyPrefix ?? "—"}</code></span>
                <span>Base URL: <code>{configStatus?.adapter.baseURL ?? "默认"}</code></span>
                <span>模型: <strong>{configStatus?.adapter.model ?? "—"}</strong></span>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)", display: "block", marginBottom: 8 }}>
                选择模型提供商
              </label>
              <div className="flex flex-wrap gap-2 mb-4">
                {LLM_PRESETS.map((p) => (
                  <button key={p.key} onClick={() => {
                    setSelectedPreset(p.key);
                    if (p.baseURL) setBaseURLInput(p.baseURL);
                    if (p.model) setModelInput(p.model);
                    setSaveMsg(null);
                  }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                    style={{
                      background: selectedPreset === p.key ? "var(--accent)" : "var(--surface-low)",
                      color: selectedPreset === p.key ? "#fff" : "var(--fg-secondary)",
                      border: `1px solid ${selectedPreset === p.key ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", display: "block", marginBottom: 4 }}>API 密钥</label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => { setApiKeyInput(e.target.value); setSaveMsg(null); }}
                    placeholder={selectedPreset === "volc-doubao" ? "火山引擎 API Key" : "sk-..."}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", display: "block", marginBottom: 4 }}>Base URL</label>
                  <input
                    type="text"
                    value={baseURLInput}
                    onChange={(e) => { setBaseURLInput(e.target.value); setSaveMsg(null); }}
                    placeholder="https://ark.cn-beijing.volces.com/api/v3"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", display: "block", marginBottom: 4 }}>
                    {selectedPreset === "volc-doubao" ? "接入点 ID (Endpoint ID)" : "模型名称"}
                  </label>
                  <input
                    type="text"
                    value={modelInput}
                    onChange={(e) => { setModelInput(e.target.value); setSaveMsg(null); }}
                    placeholder={selectedPreset === "volc-doubao" ? "ep-20250530xxxxx-xxxxx" : "gpt-4o-mini"}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setSaveMsg(null);
                    try {
                      const payload: Record<string, string> = {};
                      if (apiKeyInput.trim()) payload.key = apiKeyInput.trim();
                      if (baseURLInput.trim()) payload.baseURL = baseURLInput.trim();
                      if (modelInput.trim()) payload.model = modelInput.trim();
                      if (Object.keys(payload).length === 0) {
                        setSaveMsg({ ok: false, text: "请至少填写一项配置" });
                        setSaving(false);
                        return;
                      }
                      const res = await api.post<{ success: boolean; apiKeyPrefix?: string; baseURL?: string; model?: string }>("/api/config/api-key", payload);
                      setSaveMsg({ ok: true, text: `保存成功 — ${res.model ?? ""}` });
                      setApiKeyInput("");
                      const status = await api.get<ConfigStatus>("/api/config/status");
                      setConfigStatus(status);
                    } catch (err) {
                      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "保存失败" });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity"
                  style={{ background: "var(--accent)", opacity: saving ? 0.5 : 1 }}
                >
                  {saving ? "保存中..." : "保存配置"}
                </button>
                {saveMsg && (
                  <span style={{ fontSize: "var(--text-2xs)", color: saveMsg.ok ? "var(--success)" : "var(--danger)" }}>
                    {saveMsg.text}
                  </span>
                )}
              </div>
              <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 8 }}>
                配置将写入 .env.local 并立即生效，无需重启服务
              </p>
            </div>
          </div>
        )}

        {tab === "team" && (
          <div style={{ maxWidth: 960 }}>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", marginBottom: 16 }}>团队成员</h2>
            <div className="space-y-1.5">
              {[
                { name: "管理员", role: "owner" as const, email: "admin@agenthub.dev" },
                { name: "张三", role: "admin" as const, email: "zhangsan@agenthub.dev" },
                { name: "李四", role: "member" as const, email: "lisi@agenthub.dev" },
              ].map((m) => (
                <div key={m.email} className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white shrink-0"
                    style={{ background: "var(--accent)", fontSize: 10 }}>{m.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>{m.name}</p>
                    <p style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{m.email}</p>
                  </div>
                  <span className="rounded px-2 py-0.5 shrink-0" style={{ fontSize: 9, color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                    {m.role === "owner" ? "所有者" : m.role === "admin" ? "管理员" : "成员"}
                  </span>
                </div>
              ))}
            </div>
            <button className="rounded-lg font-medium text-white mt-3 transition-all"
              onClick={() => { const email = prompt("请输入要邀请的成员邮箱："); if (email?.includes("@")) alert(`已向 ${email} 发送邀请`); }}
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
              + 邀请成员
            </button>
          </div>
        )}

        {tab === "export" && (
          <div style={{ maxWidth: 960 }}>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)", marginBottom: 16 }}>数据导出</h2>
            <div className="space-y-3">
              {[
                { label: "对话历史", desc: "导出所有会话和消息记录", format: "JSON" },
                { label: "任务报告", desc: "导出任务执行统计和结果", format: "CSV" },
                { label: "智能体配置", desc: "导出智能体设置和参数", format: "JSON" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
                  <div>
                    <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>{item.label}</p>
                    <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 1 }}>{item.desc}</p>
                  </div>
                  <button className="rounded-lg px-3 py-1.5 font-medium shrink-0 transition-all"
                    onClick={() => {
                      const data = item.label === "智能体配置"
                        ? { agents: useUserAgentStore.getState().agents, exportedAt: new Date().toISOString() }
                        : { exportTime: new Date().toISOString(), type: item.label };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `agenthub-${item.label}-${Date.now()}.${item.format.toLowerCase()}`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    style={{ fontSize: "var(--text-2xs)", background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                    导出 {item.format}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)" }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}
