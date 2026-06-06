"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore, type Theme } from "@/stores/settings-store";
import { useUserAgentStore } from "@/stores/user-agent-store";
import { useT } from "@/hooks/useT";
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
  isDeploymentTargetConfigured,
  type DeploymentTargetsResponse,
} from "@/features/deployment/deployment-targets";

type SettingsTab = "general" | "model" | "deployment" | "team" | "export";
type ReadinessTone = "success" | "warning" | "neutral";

interface HealthStatus {
  status: string;
  service?: string;
}

interface ReadinessItem {
  label: string;
  detail: string;
  tone: ReadinessTone;
}

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
  { key: "custom", label: "custom", baseURL: "", model: "" },
];

const TABS: Array<{ key: SettingsTab; labelKey: string; descKey: string; icon: string }> = [
  { key: "general", labelKey: "settings.tab.general", descKey: "settings.tab.general.desc", icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" },
  { key: "model", labelKey: "settings.tab.model", descKey: "settings.tab.model.desc", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { key: "deployment", labelKey: "settings.tab.deployment", descKey: "settings.tab.deployment.desc", icon: "M12 3v12 M7 8l5-5 5 5 M5 21h14a2 2 0 002-2v-4 M3 15v4a2 2 0 002 2" },
  { key: "team", labelKey: "settings.tab.team", descKey: "settings.tab.team.desc", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
  { key: "export", labelKey: "settings.tab.export", descKey: "settings.tab.export.desc", icon: "M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2 M7 11l5 5 5-5 M12 4v12" },
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
  const t = useT();
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
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [backendHealth, setBackendHealth] = useState<ReadinessItem>({
    label: "Backend API",
    detail: "Not checked yet",
    tone: "neutral",
  });

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
      setDeploymentError(error instanceof Error ? error.message : t("settings.deployment.loadFailed"));
    } finally {
      setDeploymentLoading(false);
    }
  }, [t]);

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
        setDeploymentError(error instanceof Error ? error.message : t("settings.deployment.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setDeploymentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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
        setDeploymentError(error instanceof Error ? error.message : t("settings.deployment.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setDeploymentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, t]);

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
  const defaultTargetLabel = deploymentLoading
    ? t("settings.readiness.pending")
    : deploymentError
    ? t("common.error")
    : defaultTargetConfigured
    ? t("settings.readiness.ok")
    : t("settings.readiness.warn");
  const defaultTargetTone = deploymentLoading ? "neutral" : defaultTargetConfigured ? "success" : "warning";
  const readinessItems = useMemo<ReadinessItem[]>(() => {
    const clientMode = typeof window !== "undefined" && window.innerWidth < 768 ? t("settings.readiness.mobileMode") : t("settings.readiness.desktopMode");
    const modelReady = Boolean(configStatus?.adapter.apiKeyConfigured);
    return [
      {
        label: t("settings.readiness.frontend"),
        detail: `${t("settings.readiness.entered")} ${clientMode}`,
        tone: "success",
      },
      {
        ...backendHealth,
        label: t("settings.readiness.backend"),
      },
      {
        label: t("settings.readiness.model"),
        detail: configStatus
          ? `${configStatus.adapter.model || t("settings.readiness.modelUnread")} · ${modelReady ? t("settings.readiness.apiKeyReady") : t("settings.readiness.apiKeyMissing")}`
          : t("settings.readiness.modelLoading"),
        tone: configStatus ? modelReady ? "success" : "warning" : "neutral",
      },
      {
        label: t("settings.readiness.deploy"),
        detail: deploymentLoading
          ? t("settings.readiness.deployLoading")
          : deploymentError || defaultTarget?.publicUrl || defaultTargetLabel,
        tone: defaultTargetTone,
      },
      {
        label: t("settings.readiness.workspace"),
        detail: `${stats.conversations} ${t("settings.stats.conversations")} · ${stats.messages} ${t("settings.stats.messages")} · ${stats.agents} ${t("settings.stats.agents")}`,
        tone: stats.conversations > 0 || stats.agents > 0 ? "success" : "warning",
      },
    ];
  }, [backendHealth, configStatus, defaultTarget?.publicUrl, defaultTargetLabel, defaultTargetTone, deploymentError, deploymentLoading, stats.agents, stats.conversations, stats.messages, t]);

  const runReadinessCheck = useCallback(async () => {
    setCheckingReadiness(true);
    setBackendHealth({
      label: t("settings.readiness.backend"),
      detail: t("settings.readiness.apiChecking"),
      tone: "neutral",
    });
    try {
      const health = await api.get<HealthStatus>("/api/health");
      setBackendHealth({
        label: t("settings.readiness.backend"),
        detail: health.status === "ok" ? `${health.service || "agenthub-server"} ${t("settings.readiness.apiNormal")}` : `${t("settings.readiness.status")}：${health.status}`,
        tone: health.status === "ok" ? "success" : "warning",
      });
    } catch (error) {
      setBackendHealth({
        label: t("settings.readiness.backend"),
        detail: error instanceof Error ? error.message : t("settings.readiness.apiUnavailable"),
        tone: "warning",
      });
    } finally {
      setCheckingReadiness(false);
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runReadinessCheck();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runReadinessCheck]);

  const handleSaveModel = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (apiKeyInput.trim()) payload.key = apiKeyInput.trim();
      if (baseURLInput.trim()) payload.baseURL = baseURLInput.trim();
      if (modelInput.trim()) payload.model = modelInput.trim();
      if (Object.keys(payload).length === 0) {
        setSaveMsg({ ok: false, text: t("settings.model.needOne") });
        return;
      }
      const result = await api.post<{ success: boolean; model?: string }>("/api/config/api-key", payload);
      setSaveMsg({ ok: true, text: `${t("settings.model.saved")} ${result.model || modelInput || t("settings.model.config")}` });
      setApiKeyInput("");
      const status = await api.get<ConfigStatus>("/api/config/status");
      setConfigStatus(status);
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : t("settings.model.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleInviteMember = (emailValue = inviteEmail, nameValue = inviteName) => {
    const contact = upsertContact({
      email: emailValue,
      name: nameValue,
      role: t("settings.team.member"),
      source: "invite",
      invitedAt: Date.now(),
    });
    if (!contact.ok) {
      setInviteMsg({ ok: false, text: t("settings.team.invalidEmail") });
      return;
    }
    const result = addPendingTeamInvite(contact.contact.email, "settings", {
      name: contact.contact.name,
      contactId: contact.contact.id,
    });
    if (!result.ok) {
      setInviteMsg({ ok: false, text: t("settings.team.invalidEmail") });
      return;
    }
    setInviteMsg({
      ok: true,
      text: result.duplicate ? t("settings.team.duplicate") : `${t("settings.team.invited")} ${contact.contact.name}`,
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
          <h1 className="mt-1 text-base font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>{t("settings.shell")}</h1>
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
                <span className="block text-sm font-semibold">{t(item.labelKey)}</span>
                <span className="block truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{t(item.descKey)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar p-6" style={{ background: "var(--surface-white)" }}>
        {tab === "general" ? (
          <div className="max-w-5xl">
            <Header title={t("settings.general.title")} desc={t("settings.general.desc")} />
            <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <Metric label={t("settings.stats.conversations")} value={stats.conversations} />
              <Metric label={t("settings.stats.messages")} value={stats.messages} />
              <Metric label={t("settings.stats.agents")} value={stats.agents} />
              <Metric label={t("settings.stats.pendingInvites")} value={stats.pendingInvites} />
            </div>
            <Panel>
              <SettingRow label={t("settings.theme.label")} desc={t("settings.theme.desc")}>
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
                      {mode === "light" ? t("settings.theme.light") : mode === "dark" ? t("settings.theme.dark") : t("settings.theme.cozeDark")}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow label={t("settings.language.label")} desc={t("settings.language.desc")}>
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
              <SettingRow label={t("settings.notification.label")} desc={t("settings.notification.desc")}>
                <button type="button" onClick={handleNotification} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}>
                  {notificationPermission === "granted" ? t("settings.notification.granted") : notificationPermission === "denied" ? t("settings.notification.denied") : notificationPermission === "unsupported" ? t("settings.notification.unsupported") : t("settings.notification.request")}
                </button>
              </SettingRow>
              <SettingRow label={t("settings.mobile.label")} desc={t("settings.mobile.desc")}>
                <StatusPill tone="success">{t("settings.enabled")}</StatusPill>
              </SettingRow>
            </Panel>
            <ReadinessPanel items={readinessItems} checking={checkingReadiness} onCheck={runReadinessCheck} t={t} />
          </div>
        ) : null}

        {tab === "model" ? (
          <div className="max-w-5xl">
            <Header title={t("settings.model.title")} desc={t("settings.model.desc")} />
            <Panel>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusPill tone={configStatus?.adapter.apiKeyConfigured ? "success" : "warning"}>
                  {configStatus?.adapter.apiKeyConfigured ? t("settings.model.keyConfigured") : t("settings.model.keyMissing")}
                </StatusPill>
                <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
                  {t("settings.model.current")}：{configStatus?.adapter.model || t("settings.model.unread")} · {configStatus?.adapter.baseURL || t("settings.model.defaultUrl")}
                </span>
              </div>
              <FieldLabel label={t("settings.model.provider")} />
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
                    {preset.key === "custom" ? t("settings.model.custom") : preset.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3">
                <TextInput label="API Key" type="password" value={apiKeyInput} onChange={setApiKeyInput} placeholder="sk-... / ark-..." />
                <TextInput label="Base URL" value={baseURLInput} onChange={setBaseURLInput} placeholder="https://ark.cn-beijing.volces.com/api/v3" />
                <TextInput label={selectedPreset === "volc-doubao" ? t("settings.model.endpoint") : t("settings.model.name")} value={modelInput} onChange={setModelInput} placeholder={selectedPreset === "volc-doubao" ? "ep-xxxxxxxx" : "gpt-4o-mini"} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" disabled={saving} onClick={handleSaveModel} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-55" style={{ background: "var(--accent)" }}>
                  {saving ? t("settings.model.saving") : t("settings.model.save")}
                </button>
                {saveMsg ? <span className="text-xs" style={{ color: saveMsg.ok ? "var(--success)" : "var(--danger)" }}>{saveMsg.text}</span> : null}
              </div>
            </Panel>
          </div>
        ) : null}

        {tab === "deployment" ? (
          <div className="max-w-5xl">
            <Header title={t("settings.deployment.title")} desc={t("settings.deployment.desc")} />
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{defaultTarget?.name || t("settings.deployment.defaultServer")}</h2>
                    <StatusPill tone={defaultTargetTone}>
                      {defaultTargetLabel}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs leading-5" style={{ color: "var(--fg-secondary)" }}>
                    {deploymentLoading ? t("settings.deployment.loading") : deploymentError ? deploymentError : defaultTarget?.host ? `${defaultTarget.username}@${defaultTarget.host}:${defaultTarget.port}` : t("settings.deployment.noHost")}
                  </p>
                  <p className="mt-1 break-all text-xs" style={{ color: "var(--fg-tertiary)" }}>
                    {defaultTarget?.publicUrl || t("settings.deployment.noPublicUrl")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={refreshDeploymentStatus} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--fg-primary)" }}>
                    {t("common.refresh")}
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
                    {t("settings.deployment.openPanel")}
                  </button>
                </div>
              </div>
              {!deploymentLoading && !defaultTargetConfigured && defaultTarget?.missingEnv?.length ? (
                <div className="mt-4 rounded-lg p-3" style={{ background: "var(--warning-subtle)", border: "1px solid var(--warning-border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--warning)" }}>{t("settings.deployment.missingEnv")}：{defaultTarget.missingEnv.join(" / ")}</p>
                  <button type="button" onClick={copyDeploymentTemplate} className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}>
                    {copied ? t("settings.deployment.copied") : t("settings.deployment.copyTemplate")}
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
                  <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{t("settings.deployment.noPersonal")}</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>{t("settings.deployment.noPersonalHint")}</p>
                </Panel>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "team" ? (
          <TeamSettingsPanel
            t={t}
            userName={user?.name || t("settings.team.currentUser")}
            userEmail={user?.email || t("settings.team.notLoggedIn")}
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
                setInviteMsg({ ok: false, text: t("settings.team.selectFirst") });
                return;
              }
              handleInviteMember(contact.email, contact.name);
            }}
            onInviteManual={() => handleInviteMember()}
            onOpenContacts={() => navigateTo("contacts")}
            onRemoveInvite={removePendingTeamInvite}
          />
        ) : null}

        {tab === "export" ? (
          <div className="max-w-5xl">
            <Header title={t("settings.export.title")} desc={t("settings.export.desc")} />
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <ExportCard title={t("settings.export.workspace")} desc={t("settings.export.workspaceDesc")} format="JSON" actionLabel={t("common.export")} onClick={() => exportBundle("workspace")} />
              <ExportCard title={t("settings.export.agents")} desc={t("settings.export.agentsDesc")} format="JSON" actionLabel={t("common.export")} onClick={() => exportBundle("agents")} />
              <ExportCard title={t("settings.export.settings")} desc={t("settings.export.settingsDesc")} format="JSON" actionLabel={t("common.export")} onClick={() => exportBundle("settings")} />
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

function ReadinessPanel({
  items,
  checking,
  onCheck,
  t,
}: {
  items: ReadinessItem[];
  checking: boolean;
  onCheck: () => void;
  t: (key: string) => string;
}) {
  const readyCount = items.filter((item) => item.tone === "success").length;
  return (
    <Panel className="mt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{t("settings.readiness.title")}</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>{t("settings.readiness.desc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={readyCount === items.length ? "success" : "warning"}>{readyCount}/{items.length} {t("settings.readiness.ready")}</StatusPill>
          <button
            type="button"
            disabled={checking}
            onClick={onCheck}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-55"
            style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
          >
            {checking ? t("settings.readiness.checking") : t("settings.readiness.recheck")}
          </button>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {items.map((item) => (
          <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>{item.label}</p>
              <StatusPill tone={item.tone}>{item.tone === "success" ? t("settings.readiness.ok") : item.tone === "warning" ? t("settings.readiness.warn") : t("settings.readiness.pending")}</StatusPill>
            </div>
            <p className="truncate text-xs" title={item.detail} style={{ color: "var(--fg-tertiary)" }}>{item.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TeamSettingsPanel({
  t,
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
  t: (key: string) => string;
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
      <Header title={t("settings.team.title")} desc={t("settings.team.desc")} />
      <Panel>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MemberCard name={userName} email={userEmail} role={t("settings.team.owner")} />
          <MemberCard name={t("settings.team.pmoAgent")} email="system@agenthub.local" role={t("settings.team.systemAgent")} />
        </div>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>{t("settings.team.fromContacts")}</p>
            <div className="flex gap-2">
              <select
                value={selectedContactEmail}
                onChange={(event) => onSelectContact(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
              >
                <option value="">{t("settings.team.selectContact")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.email}>{contact.name} · {contact.email}</option>
                ))}
              </select>
              <button type="button" onClick={onInviteContact} className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                {t("settings.team.invite")}
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenContacts}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ border: "1px solid var(--border)", background: "var(--surface-white)", color: "var(--fg-primary)" }}
            >
              {t("settings.team.openContacts")}
            </button>
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>{t("settings.team.manualInvite")}</p>
            <div className="grid gap-2">
              <input
                value={inviteName}
                onChange={(event) => onInviteNameChange(event.target.value)}
                placeholder={t("settings.team.namePlaceholder")}
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
                  {t("settings.team.addInvite")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {inviteMsg ? <p className="mt-3 text-xs" style={{ color: inviteMsg.ok ? "var(--success)" : "var(--danger)" }}>{inviteMsg.text}</p> : null}
      </Panel>

      <Panel className="mt-3">
        <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{t("settings.team.pending")}</h2>
        <div className="space-y-2">
          {pendingInvites.length > 0 ? pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-low)" }}>
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--fg-primary)" }}>
                {invite.name ? `${invite.name} · ` : ""}{invite.email}
              </span>
              <StatusPill tone="warning">{t("settings.team.pendingBadge")}</StatusPill>
              <button type="button" onClick={() => onRemoveInvite(invite.id)} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ color: "var(--danger)" }}>
                {t("settings.team.remove")}
              </button>
            </div>
          )) : <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>{t("settings.team.noPending")}</p>}
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

function ExportCard({
  title,
  desc,
  format,
  actionLabel,
  onClick,
}: {
  title: string;
  desc: string;
  format: string;
  actionLabel: string;
  onClick: () => void;
}) {
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
        {actionLabel}
      </button>
    </Panel>
  );
}
