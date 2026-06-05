"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore, type Theme } from "@/stores/settings-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { api } from "@/lib/api-client";
import {
  addPendingTeamInvite,
  getPendingTeamInvites,
  removePendingTeamInvite,
  subscribeTeamInvites,
  type TeamInvite,
} from "@/features/team/team-invites";
import { getContacts, subscribeContacts, upsertContact, type ContactEntry } from "@/features/team/contact-book";
import {
  deploymentTargetStatusLabel,
  isDeploymentTargetConfigured,
  type DeploymentTargetsResponse,
} from "@/features/deployment/deployment-targets";

type SettingsTab = "general" | "model" | "deployment" | "team" | "export";

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
  { key: "volc-doubao", label: "火山引擎 · 豆包", baseURL: "https://ark.cn-beijing.volces.com/api/v3", model: "your-volcengine-endpoint-id" },
  { key: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { key: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { key: "mimo", label: "MiMo", baseURL: "https://token-plan-cn.xiaomimimo.com/v1", model: "mimo" },
  { key: "custom", label: "自定义", baseURL: "", model: "" },
];

const TABS: Array<{ key: SettingsTab; label: string; desc: string; icon: string }> = [
  { key: "general", label: "通用", desc: "界面与偏好", icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" },
  { key: "model", label: "模型", desc: "LLM 接入", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { key: "deployment", label: "部署", desc: "默认服务器", icon: "M12 3v12 M7 8l5-5 5 5 M5 21h14a2 2 0 002-2v-4 M3 15v4a2 2 0 002 2" },
  { key: "team", label: "团队", desc: "成员邀请", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
  { key: "export", label: "导出", desc: "备份数据", icon: "M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2 M7 11l5 5 5-5 M12 4v12" },
];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function navigateTo(key: string) {
  window.dispatchEvent(new CustomEvent("agenthub:navigate", { detail: { key } }));
}

function openRightPanel(tab: string) {
  window.dispatchEvent(new CustomEvent("right-panel:open", { detail: { tab } }));
  window.dispatchEvent(new CustomEvent("right-panel:tab", { detail: { tab } }));
}

export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>("general");
  const { locale, setLocale, theme, setTheme } = useSettingsStore();
  const user = useAuthStore((state) => state.user);
  const chat = useChatStore();
  const userAgents = useUserAgentStore((state) => state.agents);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentTargetsResponse | null>(null);
  const [deploymentLoading, setDeploymentLoading] = useState(true);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseURLInput, setBaseURLInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("volc-doubao");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [selectedContactEmail, setSelectedContactEmail] = useState("");
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPendingInvites(getPendingTeamInvites());
      setContacts(getContacts());
    }, 0);
    const unsubscribe = subscribeTeamInvites(setPendingInvites);
    const unsubscribeContacts = subscribeContacts(setContacts);
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      unsubscribeContacts();
    };
  }, []);

  useEffect(() => {
    api.get<ConfigStatus>("/api/config/status")
      .then((status) => {
        setConfigStatus(status);
        setBaseURLInput(status.adapter.baseURL ?? "");
        setModelInput(status.adapter.model ?? "");
        const matched = LLM_PRESETS.find((preset) => preset.baseURL && status.adapter.baseURL?.startsWith(preset.baseURL.replace(/\/v\d+$/, "")));
        setSelectedPreset(matched?.key ?? "custom");
      })
      .catch(() => setConfigStatus(null));
  }, []);

  const refreshDeploymentStatus = useCallback(async () => {
    setDeploymentLoading(true);
    setDeploymentError(null);
    try {
      const status = await api.get<DeploymentTargetsResponse>("/api/deployment-targets");
      setDeploymentStatus(status);
    } catch (error) {
      setDeploymentStatus(null);
      setDeploymentError(error instanceof Error ? error.message : "部署配置读取失败");
    } finally {
      setDeploymentLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<DeploymentTargetsResponse>("/api/deployment-targets")
      .then((status) => {
        if (cancelled) return;
        setDeploymentStatus(status);
        setDeploymentError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setDeploymentStatus(null);
        setDeploymentError(error instanceof Error ? error.message : "部署配置读取失败");
      })
      .finally(() => {
        if (!cancelled) setDeploymentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "deployment") return;
    let cancelled = false;
    api.get<DeploymentTargetsResponse>("/api/deployment-targets")
      .then((status) => {
        if (cancelled) return;
        setDeploymentStatus(status);
        setDeploymentError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setDeploymentStatus(null);
        setDeploymentError(error instanceof Error ? error.message : "部署配置读取失败");
      })
      .finally(() => {
        if (!cancelled) setDeploymentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const stats = useMemo(() => {
    const messageCount = Object.values(chat.messages).reduce((total, messages) => total + messages.length, 0);
    return {
      conversations: chat.conversations.length,
      messages: messageCount,
      agents: userAgents.length,
      pendingInvites: pendingInvites.length,
    };
  }, [chat.conversations.length, chat.messages, pendingInvites.length, userAgents.length]);

  const defaultTarget = deploymentStatus?.defaultTarget;
  const defaultTargetConfigured = isDeploymentTargetConfigured(defaultTarget);
  const defaultTargetLabel = deploymentTargetStatusLabel(defaultTarget, deploymentLoading, deploymentError);
  const defaultTargetTone = deploymentLoading ? "neutral" : defaultTargetConfigured ? "success" : "warning";

  const handleSaveModel = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (apiKeyInput.trim()) payload.key = apiKeyInput.trim();
      if (baseURLInput.trim()) payload.baseURL = baseURLInput.trim();
      if (modelInput.trim()) payload.model = modelInput.trim();
      if (Object.keys(payload).length === 0) {
        setSaveMsg({ ok: false, text: "至少填写一项配置" });
        return;
      }
      const result = await api.post<{ success: boolean; model?: string }>("/api/config/api-key", payload);
      setSaveMsg({ ok: true, text: `已保存 ${result.model || modelInput || "模型配置"}` });
      setApiKeyInput("");
      const status = await api.get<ConfigStatus>("/api/config/status");
      setConfigStatus(status);
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleInviteMember = (emailValue = inviteEmail, nameValue = inviteName) => {
    const contact = upsertContact({
      email: emailValue,
      name: nameValue,
      role: "成员",
      source: "invite",
      invitedAt: Date.now(),
    });
    if (!contact.ok) {
      setInviteMsg({ ok: false, text: "请输入有效邮箱" });
      return;
    }
    const result = addPendingTeamInvite(contact.contact.email, "settings", {
      name: contact.contact.name,
      contactId: contact.contact.id,
    });
    if (!result.ok) {
      setInviteMsg({ ok: false, text: "请输入有效邮箱" });
      return;
    }
    setInviteMsg({
      ok: true,
      text: result.duplicate ? "该联系人已在待确认邀请中" : `已邀请 ${contact.contact.name}`,
    });
    setInviteEmail("");
    setInviteName("");
    setSelectedContactEmail("");
  };

  const handleNotification = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const copyDeploymentTemplate = async () => {
    if (!defaultTarget?.envTemplate) return;
    await navigator.clipboard.writeText(defaultTarget.envTemplate);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const exportBundle = (kind: "workspace" | "agents" | "settings") => {
    const exportedAt = new Date().toISOString();
    if (kind === "workspace") {
      downloadJson(`agenthub-workspace-${Date.now()}.json`, {
        exportedAt,
        conversations: chat.conversations,
        messages: chat.messages,
        conversationTasks: chat.conversationTasks,
      });
      return;
    }
    if (kind === "agents") {
      downloadJson(`agenthub-agents-${Date.now()}.json`, {
        exportedAt,
        agents: userAgents,
      });
      return;
    }
    downloadJson(`agenthub-settings-${Date.now()}.json`, {
      exportedAt,
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      locale,
      theme,
      model: configStatus?.adapter ?? null,
      deployment: deploymentStatus ?? null,
    });
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--page-bg)" }}>
      <aside className="shrink-0 p-4" style={{ width: 230, borderRight: "1px solid var(--divider)", background: "var(--surface-white)" }}>
        <div className="mb-4 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--fg-tertiary)" }}>Settings</p>
          <h1 className="mt-1 text-base font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>系统设置</h1>
        </div>
        <div className="space-y-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
              style={{
                background: tab === item.key ? "var(--bg-hover)" : "transparent",
                border: `1px solid ${tab === item.key ? "var(--accent-border)" : "transparent"}`,
                color: tab === item.key ? "var(--fg-primary)" : "var(--fg-secondary)",
              }}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: tab === item.key ? "var(--accent-subtle)" : "var(--surface-low)", color: tab === item.key ? "var(--accent)" : "var(--fg-tertiary)" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{item.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar p-6" style={{ background: "var(--surface-white)" }}>
        {tab === "general" ? (
          <div className="max-w-5xl">
            <Header title="通用设置" desc="管理工作台显示、语言和通知权限。" />
            <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <Metric label="会话" value={stats.conversations} />
              <Metric label="消息" value={stats.messages} />
              <Metric label="自建智能体" value={stats.agents} />
              <Metric label="待确认邀请" value={stats.pendingInvites} />
            </div>
            <Panel>
              <SettingRow label="外观主题" desc="切换当前工作台视觉模式。">
                <div className="flex rounded-lg p-1" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
                  {(["light", "dark", "coze-dark"] as Theme[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTheme(mode)}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold"
                      style={{
                        background: theme === mode ? "var(--surface-white)" : "transparent",
                        color: theme === mode ? "var(--accent)" : "var(--fg-secondary)",
                        boxShadow: theme === mode ? "var(--shadow-xs)" : "none",
                      }}
                    >
                      {mode === "light" ? "浅色" : mode === "dark" ? "深色" : "深色工作台"}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow label="界面语言" desc="侧边栏和基础控件会跟随语言切换。">
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value === "en" ? "en" : "zh")}
                  className="h-9 rounded-lg px-3 text-sm outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
                >
                  <option value="zh">简体中文</option>
                  <option value="en">English</option>
                </select>
              </SettingRow>
              <SettingRow label="桌面通知" desc="任务完成或部署完成时可弹出浏览器通知。">
                <button type="button" onClick={handleNotification} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}>
                  {notificationPermission === "granted" ? "已允许" : notificationPermission === "denied" ? "已拒绝" : notificationPermission === "unsupported" ? "不支持" : "请求权限"}
                </button>
              </SettingRow>
              <SettingRow label="手机端模式" desc="窄屏访问时自动进入 Remote 遥控器视图。">
                <StatusPill tone="success">已启用</StatusPill>
              </SettingRow>
            </Panel>
          </div>
        ) : null}

        {tab === "model" ? (
          <div className="max-w-5xl">
            <Header title="模型接入" desc="配置主 Agent 和自建智能体默认使用的大模型接口。" />
            <Panel>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusPill tone={configStatus?.adapter.apiKeyConfigured ? "success" : "warning"}>
                  {configStatus?.adapter.apiKeyConfigured ? "API Key 已配置" : "API Key 未配置"}
                </StatusPill>
                <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
                  当前模型：{configStatus?.adapter.model || "未读取"} · {configStatus?.adapter.baseURL || "默认地址"}
                </span>
              </div>
              <FieldLabel label="模型提供方" />
              <div className="mb-4 flex flex-wrap gap-2">
                {LLM_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset.key);
                      if (preset.baseURL) setBaseURLInput(preset.baseURL);
                      if (preset.model) setModelInput(preset.model);
                      setSaveMsg(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: selectedPreset === preset.key ? "var(--accent)" : "var(--surface-low)",
                      color: selectedPreset === preset.key ? "#fff" : "var(--fg-secondary)",
                      border: `1px solid ${selectedPreset === preset.key ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3">
                <TextInput label="API Key" type="password" value={apiKeyInput} onChange={setApiKeyInput} placeholder="sk-... / ark-..." />
                <TextInput label="Base URL" value={baseURLInput} onChange={setBaseURLInput} placeholder="https://ark.cn-beijing.volces.com/api/v3" />
                <TextInput label={selectedPreset === "volc-doubao" ? "接入点 ID" : "模型名称"} value={modelInput} onChange={setModelInput} placeholder={selectedPreset === "volc-doubao" ? "ep-xxxxxxxx" : "gpt-4o-mini"} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" disabled={saving} onClick={handleSaveModel} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-55" style={{ background: "var(--accent)" }}>
                  {saving ? "保存中..." : "保存模型配置"}
                </button>
                {saveMsg ? <span className="text-xs" style={{ color: saveMsg.ok ? "var(--success)" : "var(--danger)" }}>{saveMsg.text}</span> : null}
              </div>
            </Panel>
          </div>
        ) : null}

        {tab === "deployment" ? (
          <div className="max-w-5xl">
            <Header title="部署设置" desc="查看 AgentHub 默认服务器与个人部署目标状态。" />
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{defaultTarget?.name || "AgentHub 默认服务器"}</h2>
                    <StatusPill tone={defaultTargetTone}>
                      {defaultTargetLabel}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs leading-5" style={{ color: "var(--fg-secondary)" }}>
                    {deploymentLoading ? "正在读取默认服务器配置..." : deploymentError ? deploymentError : defaultTarget?.host ? `${defaultTarget.username}@${defaultTarget.host}:${defaultTarget.port}` : "未读取到服务器地址"}
                  </p>
                  <p className="mt-1 break-all text-xs" style={{ color: "var(--fg-tertiary)" }}>
                    {defaultTarget?.publicUrl || "暂无公开访问模板"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={refreshDeploymentStatus} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--fg-primary)" }}>
                    刷新
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigateTo("chat");
                      openRightPanel("deploy");
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    打开部署面板
                  </button>
                </div>
              </div>
              {!deploymentLoading && !defaultTargetConfigured && defaultTarget?.missingEnv?.length ? (
                <div className="mt-4 rounded-lg p-3" style={{ background: "var(--warning-subtle)", border: "1px solid var(--warning-border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--warning)" }}>缺少环境变量：{defaultTarget.missingEnv.join(" / ")}</p>
                  <button type="button" onClick={copyDeploymentTemplate} className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}>
                    {copied ? "已复制" : "复制环境变量模板"}
                  </button>
                </div>
              ) : null}
            </Panel>
            <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {(deploymentStatus?.targets ?? []).map((target) => (
                <Panel key={target.id}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{target.name}</h3>
                    <StatusPill tone="neutral">{target.type}</StatusPill>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--fg-secondary)" }}>{target.username}@{target.host}:{target.port}</p>
                  <p className="mt-1 truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{target.publicUrl}</p>
                </Panel>
              ))}
              {deploymentStatus && deploymentStatus.targets.length === 0 ? (
                <Panel>
                  <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>暂无个人服务器目标</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>当前会优先使用 AgentHub 默认服务器，适合答辩演示和轻量静态产物发布。</p>
                </Panel>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "team" ? (
          <TeamSettingsPanel
            userName={user?.name || "当前用户"}
            userEmail={user?.email || "未登录"}
            contacts={contacts}
            pendingInvites={pendingInvites}
            selectedContactEmail={selectedContactEmail}
            inviteName={inviteName}
            inviteEmail={inviteEmail}
            inviteMsg={inviteMsg}
            onSelectContact={(value) => {
              setSelectedContactEmail(value);
              setInviteMsg(null);
            }}
            onInviteNameChange={(value) => {
              setInviteName(value);
              setInviteMsg(null);
            }}
            onInviteEmailChange={(value) => {
              setInviteEmail(value);
              setInviteMsg(null);
            }}
            onInviteContact={() => {
              const contact = contacts.find((item) => item.email === selectedContactEmail);
              if (!contact) {
                setInviteMsg({ ok: false, text: "请先选择联系人" });
                return;
              }
              handleInviteMember(contact.email, contact.name);
            }}
            onInviteManual={() => handleInviteMember()}
            onOpenContacts={() => navigateTo("contacts")}
            onRemoveInvite={removePendingTeamInvite}
          />
        ) : null}

        {false ? (
          <div className="max-w-5xl">
            <Header title="团队管理" desc="管理本地待确认邀请，用于演示多人协作流程。" />
            <Panel>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <MemberCard name={user?.name || "当前用户"} email={user?.email || "未登录"} role="所有者" />
                <MemberCard name="PMO 主 Agent" email="system@agenthub.local" role="系统智能体" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value);
                    setInviteMsg(null);
                  }}
                  placeholder="member@example.com"
                  className="h-9 min-w-[240px] flex-1 rounded-lg px-3 text-sm outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--surface-low)", color: "var(--fg-primary)" }}
                />
                <button type="button" onClick={() => handleInviteMember()} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
                  添加邀请
                </button>
                {inviteMsg ? <span className="text-xs" style={{ color: inviteMsg?.ok ? "var(--success)" : "var(--danger)" }}>{inviteMsg?.text}</span> : null}
              </div>
            </Panel>
            <Panel className="mt-3">
              <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>待确认邀请</h2>
              <div className="space-y-2">
                {pendingInvites.length > 0 ? pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-low)" }}>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--fg-primary)" }}>{invite.email}</span>
                    <StatusPill tone="warning">待确认</StatusPill>
                    <button type="button" onClick={() => removePendingTeamInvite(invite.id)} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ color: "var(--danger)" }}>
                      移除
                    </button>
                  </div>
                )) : <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>暂无待确认邀请</p>}
              </div>
            </Panel>
          </div>
        ) : null}

        {tab === "export" ? (
          <div className="max-w-5xl">
            <Header title="数据导出" desc="导出会话、智能体和设置快照，方便备份或答辩展示。" />
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <ExportCard title="工作区快照" desc="会话列表、消息记录、任务状态。" format="JSON" onClick={() => exportBundle("workspace")} />
              <ExportCard title="智能体配置" desc="自建智能体名称、能力标签和配置。" format="JSON" onClick={() => exportBundle("agents")} />
              <ExportCard title="系统设置" desc="语言、主题、模型和部署状态。" format="JSON" onClick={() => exportBundle("settings")} />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Header({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>{title}</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
    </div>
  );
}

function TeamSettingsPanel({
  userName,
  userEmail,
  contacts,
  pendingInvites,
  selectedContactEmail,
  inviteName,
  inviteEmail,
  inviteMsg,
  onSelectContact,
  onInviteNameChange,
  onInviteEmailChange,
  onInviteContact,
  onInviteManual,
  onOpenContacts,
  onRemoveInvite,
}: {
  userName: string;
  userEmail: string;
  contacts: ContactEntry[];
  pendingInvites: TeamInvite[];
  selectedContactEmail: string;
  inviteName: string;
  inviteEmail: string;
  inviteMsg: { ok: boolean; text: string } | null;
  onSelectContact: (value: string) => void;
  onInviteNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onInviteContact: () => void;
  onInviteManual: () => void;
  onOpenContacts: () => void;
  onRemoveInvite: (id: string) => void;
}) {
  return (
    <div className="max-w-5xl">
      <Header title="团队管理" desc="从通讯录选择成员或手动输入邮箱，邀请会同步沉淀到通讯录。" />
      <Panel>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MemberCard name={userName} email={userEmail} role="所有者" />
          <MemberCard name="PMO 主 Agent" email="system@agenthub.local" role="系统智能体" />
        </div>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>从通讯录邀请</p>
            <div className="flex gap-2">
              <select
                value={selectedContactEmail}
                onChange={(event) => onSelectContact(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
              >
                <option value="">选择联系人</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.email}>{contact.name} · {contact.email}</option>
                ))}
              </select>
              <button type="button" onClick={onInviteContact} className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                邀请
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenContacts}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
            >
              打开通讯录
            </button>
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>手动邀请</p>
            <div className="grid gap-2">
              <input
                value={inviteName}
                onChange={(event) => onInviteNameChange(event.target.value)}
                placeholder="姓名，如 张三"
                className="h-9 rounded-lg px-3 text-sm outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
              />
              <div className="flex gap-2">
                <input
                  value={inviteEmail}
                  onChange={(event) => onInviteEmailChange(event.target.value)}
                  placeholder="member@example.com"
                  className="h-9 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
                />
                <button type="button" onClick={onInviteManual} className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                  添加邀请
                </button>
              </div>
            </div>
          </div>
        </div>

        {inviteMsg ? <p className="mt-3 text-xs" style={{ color: inviteMsg.ok ? "var(--success)" : "var(--danger)" }}>{inviteMsg.text}</p> : null}
      </Panel>

      <Panel className="mt-3">
        <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>待确认邀请</h2>
        <div className="space-y-2">
          {pendingInvites.length > 0 ? pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-low)" }}>
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--fg-primary)" }}>
                {invite.name ? `${invite.name} · ` : ""}{invite.email}
              </span>
              <StatusPill tone="warning">待确认</StatusPill>
              <button type="button" onClick={() => onRemoveInvite(invite.id)} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ color: "var(--danger)" }}>
                移除
              </button>
            </div>
          )) : <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>暂无待确认邀请</p>}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg p-4 ${className}`} style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg px-4 py-3" style={{ border: "1px solid var(--border)", background: "var(--surface-white)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>{value}</p>
    </div>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{label}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "success" | "warning" | "neutral" }) {
  const color = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--fg-secondary)";
  const background = tone === "success" ? "var(--success-subtle)" : tone === "warning" ? "var(--warning-subtle)" : "var(--surface-low)";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background }}>
      {children}
    </span>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>{label}</p>;
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <label className="block">
      <FieldLabel label={label} />
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg px-3 text-sm outline-none"
        style={{ border: "1px solid var(--border)", background: "var(--surface-low)", color: "var(--fg-primary)" }}
      />
    </label>
  );
}

function MemberCard({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--surface-low)" }}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{name}</p>
        <p className="truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{email}</p>
      </div>
      <StatusPill tone="neutral">{role}</StatusPill>
    </div>
  );
}

function ExportCard({ title, desc, format, onClick }: { title: string; desc: string; format: string; onClick: () => void }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{title}</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
        </div>
        <StatusPill tone="neutral">{format}</StatusPill>
      </div>
      <button type="button" onClick={onClick} className="mt-4 rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--accent-border)", background: "var(--accent-subtle)", color: "var(--accent)" }}>
        导出
      </button>
    </Panel>
  );
}
