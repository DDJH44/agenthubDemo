import type { Message } from "@agenthub/shared";
import { useChatStore } from "@/stores/chat-store";
import { getDeployProviderLabel } from "./deploy-platforms";

type DeployCardStatus = "deploying" | "done" | "success" | "failed";

interface DeployCardOptions {
  status: DeployCardStatus;
  platform?: string;
  platformLabel?: string;
  url?: string;
  error?: string;
  artifactId?: string;
  verified?: boolean;
  verificationStatus?: number;
  progress?: number;
  files?: string[];
  content?: string;
}

export function deployCardMessageId(deployId: string) {
  return `deploy-card-${deployId}`;
}

function defaultContent(status: DeployCardStatus, platformLabel: string, url?: string, error?: string) {
  if (status === "done" || status === "success") {
    return `部署完成。${platformLabel} 已返回访问链接${url ? `：${url}` : "。"}`;
  }
  if (status === "failed") {
    return `部署失败。${platformLabel} 返回错误：${error || "未知错误"}`;
  }
  return `已向 ${platformLabel} 提交部署任务，当前阶段：准备中。`;
}

export function upsertDeployCard(conversationId: string | undefined, deployId: string, options: DeployCardOptions) {
  if (!conversationId) return;

  const messageId = deployCardMessageId(deployId);
  const existing = useChatStore.getState().messages[conversationId]?.find((message) => message.id === messageId);
  const existingPayload = (existing?.payload ?? {}) as Record<string, unknown>;
  const platform = options.platform ?? (existingPayload.platform as string | undefined);
  const platformLabel = getDeployProviderLabel(
    options.platformLabel || (existingPayload.platformLabel as string | undefined) || platform
  );
  const normalizedStatus = options.status === "success" ? "done" : options.status;
  const message: Message = {
    id: messageId,
    conversationId,
    type: "deploy_card",
    sender: normalizedStatus === "deploying" ? "system" : "worker",
    senderId: "deploy",
    content: options.content ?? defaultContent(normalizedStatus, platformLabel, options.url, options.error),
    mentions: [],
    payload: {
      ...existingPayload,
      status: normalizedStatus,
      platform,
      platformLabel,
      url: options.url ?? existingPayload.url,
      error: options.error ?? (normalizedStatus === "failed" ? existingPayload.error : undefined),
      deployId,
      artifactId: options.artifactId ?? existingPayload.artifactId,
      verified: options.verified ?? existingPayload.verified,
      verificationStatus: options.verificationStatus ?? existingPayload.verificationStatus,
      progress: options.progress ?? existingPayload.progress,
      files: options.files ?? existingPayload.files,
    },
    timestamp: Date.now(),
  };

  useChatStore.getState().upsertMessage(conversationId, message);
}
