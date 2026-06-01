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
    label: "Mock Preview",
    desc: "写入本地预览环境并返回可访问链接，适合答辩现场稳定演示。",
    hint: "本地可用，不依赖第三方密钥",
    tags: ["稳定成功", "验收演示"],
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
    tags: ["三方平台", "Webhook"],
    icon: "M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z",
  },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  idle: { label: "等待部署", color: "var(--fg-tertiary)", bg: "var(--surface-low)", border: "var(--border)" },
  deploying: { label: "部署中", color: "var(--accent)", bg: "var(--accent-subtle)", border: "var(--accent-border)" },
  success: { label: "部署成功", color: "var(--success)", bg: "var(--success-subtle)", border: "var(--success-border)" },
  failed: { label: "部署失败", color: "var(--danger)", bg: "var(--danger-subtle)", border: "var(--danger-border)" },
};

const STATUS_MASCOT: Record<string, BrandMascotVariant> = {
  idle: "shield",
  deploying: "rocket",
  success: "complete",
  failed: "thinking",
};

const LIFECYCLE = [
  { label: "准备中", progress: 10 },
  { label: "构建校验", progress: 35 },
  { label: "发布中", progress: 70 },
  { label: "回写消息", progress: 88 },
  { label: "完成", progress: 100 },
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
  const activePlatform = PLATFORMS.find((platform) => platform.key === (deployProvider || selectedPlatform)) ?? PLATFORMS[0];
  const canDeploy = Boolean(activeConversationId && deployableArtifact && deployFiles.length > 0);
  const isDeploying = normalizedStatus === "deploying";

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

    const platformLabel = PLATFORMS.find((item) => item.key === selectedPlatform)?.label ?? selectedPlatform;
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
    <div data-testid="deploy-panel" className="flex flex-col gap-4">
      <section className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>部署到第三方平台</p>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
              选择平台后会进入准备、构建、发布、回写消息的完整生命周期。
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <BrandMascot variant={statusMascot} size={82} />
            <span className="rounded-sm px-2 py-1 text-[10px] font-semibold" style={{ color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-md p-2.5" style={{ background: "var(--surface-low)" }}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>产物文件</p>
            <p className="mt-1 text-lg font-bold" style={{ color: "var(--fg-primary)" }}>{deployFiles.length}</p>
          </div>
          <div className="rounded-md p-2.5" style={{ background: "var(--surface-low)" }}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>当前平台</p>
            <p className="mt-1 truncate text-sm font-bold" style={{ color: "var(--fg-primary)" }}>{activePlatform.label}</p>
          </div>
          <div className="rounded-md p-2.5" style={{ background: "var(--surface-low)" }}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>进度</p>
            <p className="mt-1 text-lg font-bold" style={{ color: statusMeta.color }}>{progress}%</p>
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-sm" style={{ background: "var(--surface-low)" }}>
          <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(0, Math.min(progress, 100))}%`, background: statusMeta.color }} />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>选择平台</p>
          <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deployableArtifact?.filename || deployableArtifact?.type || "暂无产物"}</p>
        </div>
        <div className="grid gap-2">
          {PLATFORMS.map((platform) => {
            const selected = selectedPlatform === platform.key;
            return (
              <button
                key={platform.key}
                type="button"
                data-testid={`deploy-platform-${platform.key}`}
                onClick={() => setSelectedPlatform(platform.key)}
                className="rounded-lg p-3 text-left transition-colors"
                style={{
                  background: selected ? "var(--accent-subtle)" : "var(--surface-white)",
                  border: `1px solid ${selected ? "var(--accent-border)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ color: selected ? "#fff" : "var(--accent)", background: selected ? "var(--accent)" : "var(--accent-subtle)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={platform.icon} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold" style={{ color: selected ? "var(--accent)" : "var(--fg-primary)" }}>{platform.label}</span>
                    <span className="mt-1 block text-[11px]" style={{ color: "var(--fg-tertiary)", lineHeight: 1.55 }}>{platform.desc}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {platform.tags.map((tag) => (
                        <span key={tag} className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[10px]" style={{ color: selected ? "var(--accent)" : "var(--fg-tertiary)" }}>{platform.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPlatform === "miaoda" && (
        <section className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <p className="mb-3 text-xs font-bold" style={{ color: "var(--fg-primary)" }}>Miaoda 配置</p>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Webhook URL</span>
              <input value={miaodaWebhookUrl} onChange={(event) => setMiaodaWebhookUrl(event.target.value)} placeholder="可留空，使用服务端 MIAODA_DEPLOY_WEBHOOK" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Token</span>
              <input value={miaodaToken} onChange={(event) => setMiaodaToken(event.target.value)} placeholder="可选，优先使用服务端 MIAODA_DEPLOY_TOKEN" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>备用应用链接</span>
              <input value={miaodaAppUrl} onChange={(event) => setMiaodaAppUrl(event.target.value)} placeholder="Webhook 未返回 URL 时使用" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
          </div>
        </section>
      )}

      <section data-testid="deploy-lifecycle" className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>部署生命周期</p>
          {deployProvider && <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deployProvider}</span>}
        </div>
        <div className="space-y-2">
          {LIFECYCLE.map((step) => {
            const state = lifecycleState(step.progress, progress, normalizedStatus);
            const color = state === "done" ? "var(--success)" : state === "failed" ? "var(--danger)" : state === "active" ? "var(--accent)" : "var(--fg-disabled)";
            return (
              <div key={step.label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: color, animation: state === "active" ? "pulse-dot 1.4s ease-in-out infinite" : undefined }} />
                <span className="text-xs" style={{ color: state === "pending" ? "var(--fg-tertiary)" : "var(--fg-primary)", fontWeight: state === "active" ? 700 : 500 }}>{step.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {(statusMessage || deployLogs.length > 0 || deployError) && (
        <section className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>最近日志</p>
            {normalizedStatus === "failed" && (
              <button type="button" data-testid="deploy-repair-codex" onClick={handoffFailureToCodex} className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                交给 Codex 修复
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {statusMessage && <p className="text-[11px]" style={{ color: "var(--accent)" }}>{statusMessage}</p>}
            {deployError && <p className="text-[11px]" style={{ color: "var(--danger)" }}>{deployError}</p>}
            {deployLogs.slice(-6).map((log, index) => (
              <p key={`${log}-${index}`} className="rounded-sm px-2 py-1 text-[11px]" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)" }}>
                {log}
              </p>
            ))}
          </div>
        </section>
      )}

      {deployUrl && normalizedStatus === "success" && (
        <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-semibold no-underline" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
          <span className="min-w-0 flex-1 truncate">{deployUrl}</span>
          <span>访问</span>
        </a>
      )}

      <button
        type="button"
        data-testid="deploy-start"
        onClick={submitDeploy}
        disabled={!canDeploy || isDeploying}
        className="flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-bold transition-transform active:scale-[0.98]"
        style={{
          color: "#fff",
          background: !canDeploy || isDeploying ? "var(--fg-disabled)" : "var(--accent)",
          border: "none",
          cursor: !canDeploy || isDeploying ? "not-allowed" : "pointer",
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
