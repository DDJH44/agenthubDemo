"use client";

import { useMemo, useState } from "react";
import { getGlobalSend } from "@/lib/ws-client";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Artifact, Message, WSClientMessage } from "@agenthub/shared";

type Platform = "vercel" | "static-download" | "self-hosted";

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
    key: "static-download",
    label: "静态包",
    desc: "生成可下载的静态产物包，适合演示、归档和手动上传。",
    hint: "本地可用，不依赖第三方 Token",
    tags: ["离线交付", "最快验证"],
    icon: "M12 3v12m0 0l-4-4m4 4l4-4M5 21h14",
  },
  {
    key: "vercel",
    label: "Vercel",
    desc: "发布到 Vercel 并返回公网预览地址，适合网页产物验收。",
    hint: "需要服务端配置 VERCEL_TOKEN",
    tags: ["公网预览", "生产部署"],
    icon: "M12 3l9 16H3L12 3z",
  },
  {
    key: "self-hosted",
    label: "自托管",
    desc: "通过 SSH 同步到自己的服务器，适合私有化环境。",
    hint: "需要 SSH 主机、用户和部署目录",
    tags: ["私有服务器", "SSH"],
    icon: "M4 7h16v10H4zM8 11h.01M12 11h.01M16 11h.01",
  },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  idle: { label: "等待部署", color: "var(--fg-tertiary)", bg: "var(--surface-low)", border: "var(--border)" },
  deploying: { label: "部署中", color: "#174ea6", bg: "rgba(23, 78, 166, 0.07)", border: "rgba(23, 78, 166, 0.18)" },
  success: { label: "部署成功", color: "var(--success)", bg: "var(--success-subtle)", border: "var(--success-border)" },
  failed: { label: "部署失败", color: "var(--danger)", bg: "var(--danger-subtle)", border: "var(--danger-border)" },
};

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

function stepState(stepProgress: number, currentProgress: number, status: string) {
  if (status === "failed" && currentProgress >= stepProgress) return "failed";
  if (status === "success" || currentProgress >= stepProgress) return "done";
  if (status === "deploying" && currentProgress >= stepProgress - 25) return "active";
  return "pending";
}

export function DeployPanel() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("static-download");
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("root");
  const [sshPort, setSshPort] = useState("22");
  const [sshKey, setSshKey] = useState("");
  const [deployPath, setDeployPath] = useState("/var/www/app");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeConversationId = useChatStore((state) => state.activeConversationId);
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
    if (selectedPlatform === "self-hosted" && !sshHost.trim()) {
      setStatusMessage("自托管部署需要填写服务器地址。");
      return;
    }

    const projectName = `agenthub-${activeConversationId.slice(0, 8)}`;
    const config: Record<string, unknown> = {
      projectName,
      framework: "static",
      files: deployFiles,
    };

    if (selectedPlatform === "self-hosted") {
      Object.assign(config, {
        sshHost: sshHost.trim(),
        sshUser: sshUser.trim() || "root",
        sshPort: Number.parseInt(sshPort, 10) || 22,
        sshKey: sshKey.trim() || undefined,
        deployPath: deployPath.trim() || "/var/www/app",
      });
    }

    setStatusMessage("部署任务已提交，正在等待平台回调。");
    setDeployStatus("deploying", undefined, {
      progress: 5,
      providerId: selectedPlatform,
      logs: [`已提交 ${PLATFORMS.find((item) => item.key === selectedPlatform)?.label ?? selectedPlatform} 部署任务。`],
      error: null,
    });
    addDeployCard(activeConversationId, `已向 ${selectedPlatform} 提交部署任务，正在收集 ${deployFiles.length} 个产物文件。`, {
      status: "deploying",
      platform: selectedPlatform,
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

  const steps = [
    { label: "收集产物", progress: 5 },
    { label: "构建校验", progress: 25 },
    { label: "上传平台", progress: 55 },
    { label: "等待回调", progress: 80 },
    { label: "发布完成", progress: 100 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>部署到第三方平台</p>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)", lineHeight: 1.6 }}>
              选择平台后会把当前产物打包提交，并在消息流里生成部署状态卡片。
            </p>
          </div>
          <span className="shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold" style={{ color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
            {statusMeta.label}
          </span>
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
                onClick={() => setSelectedPlatform(platform.key)}
                className="rounded-lg p-3 text-left transition-colors"
                style={{
                  background: selected ? "rgba(23, 78, 166, 0.07)" : "var(--surface-white)",
                  border: `1px solid ${selected ? "rgba(23, 78, 166, 0.24)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ color: selected ? "#fff" : "#174ea6", background: selected ? "#174ea6" : "rgba(23, 78, 166, 0.07)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={platform.icon} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold" style={{ color: selected ? "#174ea6" : "var(--fg-primary)" }}>{platform.label}</span>
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
                <p className="mt-2 text-[10px]" style={{ color: selected ? "#174ea6" : "var(--fg-tertiary)" }}>{platform.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPlatform === "self-hosted" && (
        <section className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <p className="mb-3 text-xs font-bold" style={{ color: "var(--fg-primary)" }}>SSH 配置</p>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>服务器地址</span>
              <input value={sshHost} onChange={(event) => setSshHost(event.target.value)} placeholder="192.168.1.100" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>用户名</span>
                <input value={sshUser} onChange={(event) => setSshUser(event.target.value)} placeholder="root" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>端口</span>
                <input value={sshPort} onChange={(event) => setSshPort(event.target.value)} placeholder="22" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>部署目录</span>
              <input value={deployPath} onChange={(event) => setDeployPath(event.target.value)} placeholder="/var/www/app" className="h-8 w-full rounded-md px-2 text-xs outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--fg-secondary)" }}>SSH 私钥路径或内容</span>
              <textarea value={sshKey} onChange={(event) => setSshKey(event.target.value)} rows={3} placeholder="可选" className="w-full resize-y rounded-md px-2 py-1.5 text-[11px] outline-none" style={{ color: "var(--fg-primary)", background: "var(--surface-low)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }} />
            </label>
          </div>
        </section>
      )}

      <section className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>部署时间线</p>
          {deployProvider && <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deployProvider}</span>}
        </div>
        <div className="space-y-2">
          {steps.map((step) => {
            const state = stepState(step.progress, progress, normalizedStatus);
            const color = state === "done" ? "var(--success)" : state === "failed" ? "var(--danger)" : state === "active" ? "#174ea6" : "var(--fg-disabled)";
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
          <p className="mb-2 text-xs font-bold" style={{ color: "var(--fg-primary)" }}>最近日志</p>
          <div className="space-y-1.5">
            {statusMessage && <p className="text-[11px]" style={{ color: "#174ea6" }}>{statusMessage}</p>}
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
        <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-semibold no-underline" style={{ color: "#174ea6", background: "rgba(23, 78, 166, 0.07)", border: "1px solid rgba(23, 78, 166, 0.18)" }}>
          <span className="min-w-0 flex-1 truncate">{deployUrl}</span>
          <span>访问</span>
        </a>
      )}

      <button
        type="button"
        onClick={submitDeploy}
        disabled={!canDeploy || isDeploying}
        className="flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-bold transition-transform active:scale-[0.98]"
        style={{
          color: "#fff",
          background: !canDeploy || isDeploying ? "var(--fg-disabled)" : "#174ea6",
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
