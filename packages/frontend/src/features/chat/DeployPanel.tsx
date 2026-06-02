"use client";

import { useMemo, useState } from "react";
import { BrandMascot, type BrandMascotVariant } from "@/components/BrandMascot";
import { getGlobalSend } from "@/lib/ws-client";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Artifact, Message, WSClientMessage } from "@agenthub/shared";

type Platform = "mock-preview" | "vercel" | "miaoda";

interface PlatformOption {
  key: Platform;
  label: string;
  desc: string;
  hint: string;
  tags: string[];
  icon: string;
}

const PLATFORMS: PlatformOption[] = [
  {
    key: "mock-preview",
    label: "内置预览",
    desc: "通过内置预览适配器写入静态产物并返回可访问链接。",
    hint: "内置可用，不依赖第三方密钥",
    tags: ["内置适配器", "无需密钥"],
    icon: "M4 5h16v12H4z M8 21h8 M12 17v4",
  },
  {
    key: "vercel",
    label: "Vercel",
    desc: "提交到 Vercel 部署 API，返回公网预览地址。",
    hint: "需要服务端配置 VERCEL_TOKEN",
    tags: ["公网预览", "真实平台"],
    icon: "M12 3l9 16H3L12 3z",
  },
  {
    key: "miaoda",
    label: "Miaoda",
    desc: "通过 Miaoda Webhook 提交静态产物包，返回妙搭应用链接。",
    hint: "需要 MIAODA_DEPLOY_WEBHOOK 或手动填写 Webhook",
    tags: ["第三方平台", "Webhook"],
    icon: "M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z",
  },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; tone: string }> = {
  idle: { label: "等待部署", color: "var(--fg-tertiary)", bg: "var(--surface-low)", border: "var(--border)", tone: "产物已就绪后可提交发布" },
  deploying: { label: "部署中", color: "var(--accent)", bg: "var(--accent-subtle)", border: "var(--accent-border)", tone: "正在执行发布流水线" },
  success: { label: "部署成功", color: "var(--success)", bg: "var(--success-subtle)", border: "var(--success-border)", tone: "已回写预览地址和部署卡片" },
  failed: { label: "部署失败", color: "var(--danger)", bg: "var(--danger-subtle)", border: "var(--danger-border)", tone: "可将日志交给 Codex 修复" },
};

const STATUS_MASCOT: Record<string, BrandMascotVariant> = {
  idle: "shield",
  deploying: "rocket",
  success: "complete",
  failed: "thinking",
};

const LIFECYCLE = [
  { label: "准备", desc: "收集产物与平台配置", progress: 10 },
  { label: "构建校验", desc: "校验入口文件和静态资源", progress: 35 },
  { label: "发布", desc: "提交到目标平台", progress: 70 },
  { label: "回写消息", desc: "生成部署状态卡片", progress: 88 },
  { label: "完成", desc: "开放预览访问", progress: 100 },
];

function normalizeStatus(status: string | null) {
  if (status === "done" || status === "completed" || status === "success") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "deploying" || status === "building" || status === "running") return "deploying";
  return "idle";
}

function filePathForArtifact(artifact: Artifact, index: number) {
  const fallback = artifact.type === "html" ? "index.html" : `${artifact.type || "artifact"}-${index + 1}.txt`;
  const value = (artifact.filename || fallback).replace(/\\/g, "/").replace(/^\/+/, "").trim();
  return value || fallback;
}

function collectDeployFiles(artifacts: Artifact[]) {
  return artifacts
    .filter((artifact) => artifact.content?.trim().length > 0)
    .map((artifact, index) => ({
      path: filePathForArtifact(artifact, index),
      content: artifact.content,
    }));
}

function pickDeployArtifact(artifacts: Artifact[]) {
  return (
    artifacts.find((artifact) => artifact.type === "html" || artifact.filename?.endsWith(".html")) ??
    artifacts.find((artifact) => artifact.type === "code") ??
    artifacts.find((artifact) => artifact.content?.trim())
  );
}

function addDeployCard(conversationId: string, content: string, payload: Record<string, unknown>) {
  const message: Message = {
    id: crypto.randomUUID(),
    conversationId,
    type: "deploy_card",
    sender: "system",
    senderId: "deploy",
    content,
    payload,
    timestamp: Date.now(),
  };
  useChatStore.getState().addMessage(conversationId, message);
}

function lifecycleState(stepProgress: number, currentProgress: number, status: string) {
  if (status === "failed" && currentProgress >= stepProgress - 20) return "failed";
  if (status === "success" || currentProgress >= stepProgress) return "done";
  if (status === "deploying" && currentProgress >= stepProgress - 28) return "active";
  return "pending";
}

function formatFileSize(content: string) {
  const kb = Math.max(1, Math.round(content.length / 1024));
  return `${kb} KB`;
}

export function DeployPanel() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("mock-preview");
  const [miaodaWebhookUrl, setMiaodaWebhookUrl] = useState("");
  const [miaodaToken, setMiaodaToken] = useState("");
  const [miaodaAppUrl, setMiaodaAppUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const addTaskAssignment = useChatStore((state) => state.addTaskAssignment);
  const {
    artifacts,
    deployStatus,
    deployUrl,
    deployProgress,
    deployProvider,
    deployLogs,
    deployError,
    setDeployStatus,
  } = useWorkspaceStore();

  const deployFiles = useMemo(() => collectDeployFiles(artifacts), [artifacts]);
  const deployableArtifact = useMemo(() => pickDeployArtifact(artifacts), [artifacts]);
  const normalizedStatus = normalizeStatus(deployStatus);
  const statusMeta = STATUS_META[normalizedStatus];
  const statusMascot = STATUS_MASCOT[normalizedStatus] ?? "shield";
  const progress = deployProgress ?? (normalizedStatus === "success" || normalizedStatus === "failed" ? 100 : normalizedStatus === "deploying" ? 35 : 0);
  const safeProgress = Math.max(0, Math.min(progress, 100));
  const activePlatform = PLATFORMS.find((platform) => platform.key === (deployProvider || selectedPlatform)) ?? PLATFORMS[0];
  const selectedPlatformOption = PLATFORMS.find((platform) => platform.key === selectedPlatform) ?? PLATFORMS[0];
  const canDeploy = Boolean(activeConversationId && deployableArtifact && deployFiles.length > 0);
  const isDeploying = normalizedStatus === "deploying";
  const deployFilePreview = deployFiles.slice(0, 4);

  const submitDeploy = () => {
    if (!activeConversationId) {
      setStatusMessage("请先选择一个会话。");
      return;
    }
    if (!deployableArtifact || deployFiles.length === 0) {
      setStatusMessage("暂无可部署产物，请先让 Agent 生成网页、代码或文档产物。");
      return;
    }

    const projectName = `agenthub-${activeConversationId.slice(0, 8)}`;
    const config: Record<string, unknown> = {
      projectName,
      framework: "static",
      files: deployFiles,
    };

    if (selectedPlatform === "miaoda") {
      Object.assign(config, {
        miaodaWebhookUrl: miaodaWebhookUrl.trim() || undefined,
        miaodaToken: miaodaToken.trim() || undefined,
        miaodaAppUrl: miaodaAppUrl.trim() || undefined,
      });
    }

    const platformLabel = selectedPlatformOption.label;
    setStatusMessage(`${platformLabel} 部署任务已提交，正在进入准备阶段。`);
    setDeployStatus("deploying", undefined, {
      progress: 5,
      providerId: selectedPlatform,
      logs: [`已提交 ${platformLabel} 部署任务。`, `收集 ${deployFiles.length} 个产物文件。`],
      error: null,
    });
    addDeployCard(activeConversationId, `已向 ${platformLabel} 提交部署任务，当前阶段：准备中。`, {
      status: "deploying",
      platform: selectedPlatform,
      platformLabel,
      artifactId: deployableArtifact.id,
      files: deployFiles.map((file) => file.path),
    });

    const send = getGlobalSend();
    send({
      type: "artifact:deploy",
      conversationId: activeConversationId,
      artifactId: deployableArtifact.id,
      providerId: selectedPlatform,
      config,
    } as WSClientMessage);
  };

  const handoffFailureToCodex = () => {
    if (!activeConversationId) return;
    const errorText = deployError || deployLogs.slice(-3).join("\n") || "部署失败，缺少错误日志。";
    useChatStore.getState().addMessage(activeConversationId, {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      type: "user_message",
      sender: "user",
      content: `@codex 请根据部署失败日志修复产物并重新部署：\n\n${errorText}`,
      mentions: ["codex"],
      payload: {
        contextAction: "deploy-failure-handoff",
        providerId: deployProvider || selectedPlatform,
        deployError: errorText,
      },
      timestamp: Date.now(),
    });
    useChatStore.getState().addMessage(activeConversationId, {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      type: "agent_message",
      sender: "coder",
      senderId: "codex",
      content: "Codex 已接收部署失败日志，会优先检查构建配置、平台密钥和产物入口文件。",
      payload: {
        contextAction: "deploy-failure-accepted",
        providerId: deployProvider || selectedPlatform,
      },
      timestamp: Date.now(),
    });
    addTaskAssignment({ targetAgent: "Codex", task: "根据部署失败日志修复并重新部署", status: "pending" });
    setStatusMessage("已把部署失败日志交给 Codex。");
  };

  return (
    <div data-testid="deploy-panel" className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-xl" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusMeta.color }} />
              <span className="text-[10px] font-bold uppercase" style={{ color: statusMeta.color, letterSpacing: 0 }}>
                Release pipeline
              </span>
            </div>
            <h3 className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>部署控制台</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
              选择平台后进入准备、校验、发布、回写消息的完整生命周期。
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <BrandMascot variant={statusMascot} size={66} />
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold"
              style={{ color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusMeta.color }} />
              {statusMeta.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 border-y" style={{ borderColor: "var(--border)", background: "var(--surface-tinted)" }}>
          {[
            { label: "产物文件", value: deployFiles.length },
            { label: "当前平台", value: activePlatform.label },
            { label: "进度", value: `${safeProgress}%`, color: statusMeta.color },
          ].map((item, index) => (
            <div key={item.label} className="min-w-0 px-3 py-2" style={{ borderLeft: index === 0 ? "none" : "1px solid var(--divider)" }}>
              <p className="truncate text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{item.label}</p>
              <p className="mt-0.5 truncate text-sm font-bold" style={{ color: item.color ?? "var(--fg-primary)" }}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="p-3">
          <div className="mb-2 flex items-center justify-between text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
            <span>{statusMeta.tone}</span>
            <span>{deployableArtifact?.filename || deployableArtifact?.type || "暂无产物"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-low)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${safeProgress}%`, background: statusMeta.color }} />
          </div>
        </div>
      </section>

      <section className="rounded-xl p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>发布目标</p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{selectedPlatformOption.hint}</p>
          </div>
          <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
            {selectedPlatformOption.label}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const selected = selectedPlatform === platform.key;
            return (
              <button
                key={platform.key}
                type="button"
                data-testid={`deploy-platform-${platform.key}`}
                onClick={() => setSelectedPlatform(platform.key)}
                className="min-w-0 rounded-lg p-2.5 text-left transition-colors"
                style={{
                  background: selected ? "var(--accent-subtle)" : "var(--surface-low)",
                  border: `1px solid ${selected ? "var(--accent-border)" : "var(--border)"}`,
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: selected ? "#fff" : "var(--accent)", background: selected ? "var(--accent)" : "var(--surface-white)", border: "1px solid var(--border)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={platform.icon} />
                    </svg>
                  </span>
                  {selected && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
                </div>
                <p className="truncate text-xs font-bold" style={{ color: selected ? "var(--accent)" : "var(--fg-primary)" }}>{platform.label}</p>
                <p className="mt-1 line-clamp-2 text-[10px]" style={{ color: "var(--fg-tertiary)", lineHeight: 1.45 }}>{platform.desc}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {platform.tags.map((tag) => (
                    <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-white)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPlatform === "miaoda" && (
        <section className="rounded-xl p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <p className="mb-3 text-xs font-bold" style={{ color: "var(--fg-primary)" }}>Miaoda 配置</p>
          <div className="grid gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Webhook URL</span>
              <input value={miaodaWebhookUrl} onChange={(event) => setMiaodaWebhookUrl(event.target.value)} placeholder="可留空，使用服务端 MIAODA_DEPLOY_WEBHOOK" className="h-8 w-full rounded-lg px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Token</span>
              <input value={miaodaToken} onChange={(event) => setMiaodaToken(event.target.value)} placeholder="可选，优先使用服务端 MIAODA_DEPLOY_TOKEN" className="h-8 w-full rounded-lg px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>备用应用链接</span>
              <input value={miaodaAppUrl} onChange={(event) => setMiaodaAppUrl(event.target.value)} placeholder="Webhook 未返回 URL 时使用" className="h-8 w-full rounded-lg px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
          </div>
        </section>
      )}

      <section className="rounded-xl p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>产物包</p>
          <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deployFiles.length} 个文件</span>
        </div>
        {deployFilePreview.length > 0 ? (
          <div className="space-y-1.5">
            {deployFilePreview.map((file) => (
              <div key={file.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--surface-low)" }}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[9px] font-bold" style={{ color: "var(--accent)", background: "var(--surface-white)" }}>
                  {file.path.split(".").pop()?.slice(0, 3).toUpperCase() || "FILE"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>{file.path}</span>
                <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{formatFileSize(file.content)}</span>
              </div>
            ))}
            {deployFiles.length > deployFilePreview.length && (
              <p className="px-2 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>还有 {deployFiles.length - deployFilePreview.length} 个文件将随包发布。</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg px-3 py-2 text-xs" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
            暂无可部署产物，先让 Agent 生成网页、代码或文档。
          </p>
        )}
      </section>

      <section data-testid="deploy-lifecycle" className="rounded-xl p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>部署生命周期</p>
          {deployProvider && <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deployProvider}</span>}
        </div>
        <div className="relative space-y-2">
          <span className="absolute left-3 top-4 bottom-4 w-px" style={{ background: "var(--divider)" }} />
          {LIFECYCLE.map((step) => {
            const state = lifecycleState(step.progress, safeProgress, normalizedStatus);
            const color = state === "done" ? "var(--success)" : state === "failed" ? "var(--danger)" : state === "active" ? "var(--accent)" : "var(--fg-disabled)";
            return (
              <div key={step.label} className="relative flex items-start gap-2.5 rounded-lg px-1 py-1">
                <span
                  className="relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full"
                  style={{ color: "#fff", background: color, animation: state === "active" ? "pulse-dot 1.4s ease-in-out infinite" : undefined }}
                >
                  {state === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#fff" }} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{ color: state === "pending" ? "var(--fg-tertiary)" : "var(--fg-primary)" }}>{step.label}</span>
                    <span className="text-[10px] font-semibold" style={{ color }}>{step.progress}%</span>
                  </div>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(statusMessage || deployLogs.length > 0 || deployError) && (
        <section className="rounded-xl p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>最近日志</p>
            {normalizedStatus === "failed" && (
              <button type="button" data-testid="deploy-repair-codex" onClick={handoffFailureToCodex} className="rounded-lg px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                交给 Codex 修复
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {statusMessage && <p className="rounded-lg px-2 py-1.5 text-[11px]" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>{statusMessage}</p>}
            {deployError && <p className="rounded-lg px-2 py-1.5 text-[11px]" style={{ color: "var(--danger)", background: "var(--danger-subtle)" }}>{deployError}</p>}
            {deployLogs.slice(-6).map((log, index) => (
              <p key={`${log}-${index}`} className="rounded-lg px-2 py-1.5 text-[11px]" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                {log}
              </p>
            ))}
          </div>
        </section>
      )}

      {deployUrl && normalizedStatus === "success" && (
        <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-semibold no-underline" style={{ color: "var(--success)", background: "var(--success-subtle)", border: "1px solid var(--success-border)" }}>
          <span className="min-w-0 flex-1 truncate">{deployUrl}</span>
          <span>访问</span>
        </a>
      )}

      <button
        type="button"
        data-testid="deploy-start"
        onClick={submitDeploy}
        disabled={!canDeploy || isDeploying}
        className="flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-transform active:scale-[0.98]"
        style={{
          color: "#fff",
          background: !canDeploy || isDeploying ? "var(--fg-disabled)" : "var(--accent)",
          border: "none",
          cursor: !canDeploy || isDeploying ? "not-allowed" : "pointer",
          boxShadow: !canDeploy || isDeploying ? "none" : "var(--accent-glow)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        {isDeploying ? "部署中" : normalizedStatus === "failed" ? "重试部署" : "开始部署"}
      </button>
    </div>
  );
}
