import type { Server as HTTPServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IAdapter } from "@agenthub/adapter";
import type { AgentExecutionContextSummary, AgentExecutionRequest, AgentRole, ConversationListItem, PlanNode, WorkflowNodeType, WorkflowReferencePayload } from "@agenthub/shared";
import { messageRepo } from "../db/repositories/message";
import { conversationRepo } from "../db/repositories/conversation";
import { conversationAgentRepo } from "../db/repositories/conversation-agent";
import { fileRepo } from "../db/repositories/file";
import { conversationGroupRepo } from "../db/repositories/conversation-group";
import { userRepo } from "../db/repositories/user";
import { getQueue } from "../queue/index";
import { matchByKeywords } from "../agents/matching";
import {
  CORE_AGENT_NAMES,
  buildInitialConversationAgentNames,
  getEffectiveEnabledAgentNames,
  isCoordinatorAgent,
  normalizeAgentKey,
  resolveConversationMentions,
  selectEnabledAgentsForTask,
} from "../agents/conversation-routing";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { chooseRuntimeAdapterOverrides, resolveAgentRuntimeProfiles } from "../agents/runtime-profile";
import { logger } from "../utils/logger";
import { prisma } from "../db/index";
import { deployManager } from "../deploy/index";
import type { DeployArtifact, DeployConfig } from "../deploy/index";
import { deploymentTargetRepo } from "../db/repositories/deployment-target";
import { decryptSecret } from "../deploy/credentials";
import { validateConversationId, validateWorkspaceId, validateMessageText, validateConversationTitle, validateConversationType, validateParticipants, validateSearchQuery, validateString } from "../utils/validators";
import { validateSession } from "../auth/session";
import { isArtifactGenerationTask, isContextualQuoteChat, isDeliverableGenerationTask, isLightweightMentionChat, isSimpleChat, parseComposerQuoteIntent } from "../utils/task-classifier";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userName?: string;
}

const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(conversationId: string, ws: WebSocket) {
  if (!rooms.has(conversationId)) rooms.set(conversationId, new Set());
  rooms.get(conversationId)!.add(ws);
}

function leaveRoom(conversationId: string, ws: WebSocket) {
  const clients = rooms.get(conversationId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(conversationId);
  }
}

function broadcast(conversationId: string, data: unknown) {
  const clients = rooms.get(conversationId);
  if (!clients) return;
  const json = JSON.stringify(scopeConversationEvent(conversationId, data));
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

function emitToRequesterAndRoom(conversationId: string, requester: WebSocket, data: unknown) {
  broadcast(conversationId, data);
  const clients = rooms.get(conversationId);
  if (!clients?.has(requester) && requester.readyState === WebSocket.OPEN) {
    requester.send(JSON.stringify(scopeConversationEvent(conversationId, data)));
  }
}

function scopeConversationEvent(conversationId: string, data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const event = data as Record<string, unknown>;
  return {
    conversationId,
    timestamp: Date.now(),
    ...event,
  };
}

function toListItem(conv: {
  id: string; workspaceId: string; title: string; type: string;
  status: string; pinned: boolean; pinnedAt: Date | null;
  participants: string; lastMessage: string | null;
  lastMessageAt: Date | null; createdAt: Date; updatedAt: Date;
}): ConversationListItem {
  return {
    id: conv.id,
    workspaceId: conv.workspaceId,
    title: conv.title,
    type: conv.type,
    status: conv.status,
    pinned: conv.pinned,
    pinnedAt: conv.pinnedAt ? conv.pinnedAt.getTime() : null,
    participants: conv.participants,
    lastMessage: conv.lastMessage,
    lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.getTime() : null,
    createdAt: conv.createdAt.getTime(),
    updatedAt: conv.updatedAt.getTime(),
  };
}

function sendError(ws: WebSocket, code: string, message: string) {
  ws.send(JSON.stringify({ type: "error", code, message, timestamp: Date.now() }));
}

function getParticipants(conv: { participants: string | string[] }): string[] {
  if (Array.isArray(conv.participants)) return conv.participants;
  try { return JSON.parse(conv.participants); } catch { return []; }
}

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_START_MARKER = "[AGENT_START]";
const AGENT_END_MARKER = "[AGENT_END]";
const GROUP_AGENT_CONTROL_NAME = "__all__";

function compactSummaryLine(value: unknown, maxLength = 140) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function sanitizeSummaryList(value: unknown, maxItems = 6) {
  return Array.isArray(value)
    ? value.map((item) => compactSummaryLine(item)).filter(Boolean).slice(0, maxItems)
    : [];
}

function normalizeAgentExecution(value: unknown): AgentExecutionRequest | null {
  if (!isObjectRecord(value) || value.mode !== "execute") return null;
  const rawSummary = isObjectRecord(value.contextSummary) ? value.contextSummary : null;
  const contextSummary = rawSummary ? {
    goal: compactSummaryLine(rawSummary.goal, 180),
    confirmed: sanitizeSummaryList(rawSummary.confirmed),
    constraints: sanitizeSummaryList(rawSummary.constraints),
    references: sanitizeSummaryList(rawSummary.references),
    openQuestions: sanitizeSummaryList(rawSummary.openQuestions),
    sourceMessageCount: typeof rawSummary.sourceMessageCount === "number" ? Math.max(0, Math.min(200, rawSummary.sourceMessageCount)) : 0,
    generatedAt: typeof rawSummary.generatedAt === "number" ? rawSummary.generatedAt : Date.now(),
  } satisfies AgentExecutionContextSummary : undefined;

  return {
    mode: "execute",
    task: compactSummaryLine(value.task, 220) || contextSummary?.goal,
    contextSummary,
  };
}

async function countRealUsers(participants: string[]) {
  const userIds = participants.filter((participant) => UUID_RE.test(participant));
  if (userIds.length === 0) return 0;
  const users = await userRepo.getByIds(userIds);
  return users.length;
}

function isConstraintLine(text: string) {
  return /必须|需要|不要|不能|支持|轻量|简洁|简约|移动端|响应式|部署|导出|权限|本地|数据库/i.test(text);
}

function isQuestionLine(text: string) {
  return /[?？]$/.test(text.trim()) || /是否|还是|要不要|能不能|可以吗|怎么/.test(text);
}

function pushUnique(list: string[], item: string, maxItems = 6) {
  const value = compactSummaryLine(item, 140);
  if (!value || list.includes(value) || list.length >= maxItems) return;
  list.push(value);
}

function buildExecutionSummaryFromMessages(
  messages: Array<{ type: string; sender: string; content: string }>,
  fallbackTask: string,
  clientSummary?: AgentExecutionContextSummary,
): AgentExecutionContextSummary {
  const humanLines = messages
    .filter((message) => message.type === "user_message" || message.sender === "user")
    .slice(-16)
    .map((message) => compactSummaryLine(message.content, 160))
    .filter(Boolean);
  const confirmed = [...(clientSummary?.confirmed ?? [])].map((item) => compactSummaryLine(item)).filter(Boolean);
  const constraints = [...(clientSummary?.constraints ?? [])].map((item) => compactSummaryLine(item)).filter(Boolean);
  const references = [...(clientSummary?.references ?? [])].map((item) => compactSummaryLine(item)).filter(Boolean);
  const openQuestions = [...(clientSummary?.openQuestions ?? [])].map((item) => compactSummaryLine(item)).filter(Boolean);

  for (const line of humanLines) {
    if (line.includes("附件") || line.includes("图片") || line.includes("文件") || line.includes("工作流")) pushUnique(references, line);
    if (isQuestionLine(line)) {
      pushUnique(openQuestions, line);
      continue;
    }
    if (isConstraintLine(line)) pushUnique(constraints, line);
    pushUnique(confirmed, line);
  }

  const goal = compactSummaryLine(clientSummary?.goal, 180)
    || compactSummaryLine(fallbackTask, 180)
    || humanLines.at(-1)
    || "根据群聊讨论继续执行当前任务";

  return {
    goal,
    confirmed: confirmed.slice(-4),
    constraints: constraints.slice(-4),
    references: references.slice(-4),
    openQuestions: openQuestions.slice(-4),
    sourceMessageCount: humanLines.length,
    generatedAt: Date.now(),
  };
}

function formatSummarySection(title: string, items: string[], empty: string) {
  const lines = items.length > 0 ? items : [empty];
  return [`- ${title}：`, ...lines.map((item) => `  - ${item}`)].join("\n");
}

function formatExecutionSummaryMessage(summary: AgentExecutionContextSummary, realUserCount: number) {
  return [
    `PMO 已整理多人讨论上下文（${realUserCount} 位成员）：`,
    `- 目标：${summary.goal}`,
    formatSummarySection("已确认", summary.confirmed, "暂无明确确认项"),
    formatSummarySection("约束", summary.constraints, "暂无额外约束"),
    formatSummarySection("引用", summary.references, "暂无引用资料"),
    formatSummarySection("待确认", summary.openQuestions, "暂无冲突问题"),
    "已进入执行模式，Agent 将基于以上摘要处理任务。",
  ].join("\n");
}

function formatExecutionTask(summary: AgentExecutionContextSummary) {
  return [
    "请基于以下多人群聊过滤后的上下文执行任务。",
    `目标：${summary.goal}`,
    summary.confirmed.length ? `已确认：${summary.confirmed.join("；")}` : "",
    summary.constraints.length ? `约束：${summary.constraints.join("；")}` : "",
    summary.references.length ? `引用：${summary.references.join("；")}` : "",
    summary.openQuestions.length ? `待确认但不阻塞：${summary.openQuestions.join("；")}` : "",
  ].filter(Boolean).join("\n");
}

function isAgentBoundaryMessage(message: { content: string }) {
  return message.content === AGENT_START_MARKER || message.content === AGENT_END_MARKER;
}

function getAgentScopedMessages<T extends { content: string }>(messages: T[]): T[] {
  const scoped: T[] = [];
  let active = false;

  for (const message of messages) {
    if (message.content === AGENT_START_MARKER) {
      active = true;
      continue;
    }
    if (message.content === AGENT_END_MARKER) {
      active = false;
      continue;
    }
    if (active) scoped.push(message);
  }

  return scoped;
}

function hasEnabledAgent(agents: Array<{ enabled: boolean }>) {
  return agents.some((agent) => agent.enabled);
}

async function listRecentMessagesForAgentContext(conversationId: string, take = 120) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: "desc" },
    take,
  });
  return rows.reverse();
}

async function createAgentBoundaryMessage(conversationId: string, boundary: "start" | "end", userId: string) {
  await messageRepo.create({
    conversationId,
    type: "system",
    sender: "system",
    content: boundary === "start" ? AGENT_START_MARKER : AGENT_END_MARKER,
    payload: { kind: "agent_boundary", boundary, controlledBy: userId },
  });
}

async function setConversationAgentsEnabled(conversationId: string, participants: string[], convType: string, enabled: boolean) {
  const agentNames = buildInitialConversationAgentNames(participants, convType);
  for (const agentName of agentNames) {
    await conversationAgentRepo.setEnabled(conversationId, agentName, enabled);
  }
  return agentNames;
}

async function checkConversationAccess(ws: WebSocket, conversationId: string, userId: string): Promise<boolean> {
  const conv = await conversationRepo.getById(conversationId);
  if (!conv) {
    sendError(ws, "NOT_FOUND", "Conversation not found");
    return false;
  }
  const participants = getParticipants(conv);
  if (participants.length === 0) return true;
  if (!participants.includes(userId)) {
    sendError(ws, "FORBIDDEN", "Not a participant of this conversation");
    return false;
  }
  return true;
}

const DEFAULT_WORKSPACE = "default";
const AGENT_NAMES: string[] = [...CORE_AGENT_NAMES];
const AGENT_ROLES: AgentRole[] = ["planner", "worker", "critic", "researcher", "refiner", "coder", "reviewer", "frontend", "backend", "design", "custom"];
const WORKFLOW_NODE_TYPES: WorkflowNodeType[] = ["agent", "code", "condition", "loop", "variable"];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = "", maxLength = 300) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function normalizeInviteIdentifier(raw: unknown) {
  if (!isObjectRecord(raw)) return "";
  const candidates = [raw.email, raw.userId, raw.invitee];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function normalizeAgentAddNames(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = item.trim().slice(0, 100);
    if (!name || name === GROUP_AGENT_CONTROL_NAME) continue;
    const key = normalizeAgentKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function lightweightMentionFallback(agentName: string, userText = "") {
  const displayName = agentName || "Agent";
  const normalized = userText.trim().toLowerCase();
  if (/^(谢谢|感谢|辛苦了|thanks|thank you)/i.test(normalized)) return "不客气。";
  if (/^(好的|收到|ok|okay|嗯|可以|可以了)$/i.test(normalized)) return "收到。";
  if (/先别动|别执行|暂停|先暂停|等一下|hold on|wait|pause/i.test(normalized)) return "好，我先不执行。";
  if (/可以吗|行吗|这样可以吗|这样行吗|你怎么看|怎么说|有思路吗/i.test(normalized)) {
    return "我看到了，方向可以先聊清楚；要我执行时再把具体要求发我。";
  }
  return `${displayName} 在，我先听你说。把具体要处理的内容发来就行。`;
}

function compactLightweightMentionReply(raw: string, agentName: string, userText = "") {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return lightweightMentionFallback(agentName, userText);
  if (/任务完成总览|完成状态|原始需求|交付内容|步骤\d|###|^- /m.test(cleaned)) {
    return lightweightMentionFallback(agentName, userText);
  }

  const sentence = cleaned.split(/(?<=[。！？!?])\s+/)[0]?.trim() ?? cleaned;
  if (sentence.length <= 90) return sentence;
  return `${sentence.slice(0, 88)}…`;
}

async function buildLightweightMentionReply(agentName: string, userId: string, userText = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let adapter: IAdapter | null = null;

  try {
    const profiles = await resolveAgentRuntimeProfiles(userId, [agentName]);
    adapter = createAdapterFromEnv(chooseRuntimeAdapterOverrides(profiles));
    await adapter.connect();
    const hasUserText = Boolean(userText.trim());
    const reply = await adapter.sendMessage(
      hasUserText
        ? `用户刚刚在群聊里 @ 你并说：${userText.trim()}`
        : `用户刚刚在群聊里只点名了你：@${agentName}`,
      {
        temperature: 0.8,
        maxTokens: 120,
        signal: controller.signal,
        systemPrompt: [
          `你是群聊中的智能体「${agentName}」。`,
          hasUserText
            ? "用户只是在和你进行轻量对话、确认、寒暄或暂停提醒，还没有提出明确交付任务。"
            : "用户只是 @ 了你，还没有提出明确任务。",
          "请像真实团队成员一样自然回应，最多一句话。",
          "不要输出标题、列表、任务总结、能力清单、代码或 Markdown。",
          "如果没有明确目标、交付物、代码、部署、分析或修复要求，不要进入计划模式。",
          "根据用户语气随机应变：问候就问候，感谢就简短回应，犹豫就给一句自然确认，暂停就表示先不执行。",
        ].join("\n"),
      }
    );
    return compactLightweightMentionReply(reply, agentName, userText);
  } catch (err) {
    logger.warn(`Lightweight mention reply fallback for ${agentName}: ${err}`, "WebSocket");
    return lightweightMentionFallback(agentName, userText);
  } finally {
    clearTimeout(timeout);
    await adapter?.disconnect().catch(() => undefined);
  }
}

async function resolveInvitee(raw: unknown) {
  const invitee = normalizeInviteIdentifier(raw);
  if (!invitee) return null;

  if (invitee.includes("@")) {
    const exact = await userRepo.getByEmail(invitee);
    if (exact) return exact;
    const lowered = invitee.toLowerCase();
    return lowered === invitee ? null : userRepo.getByEmail(lowered);
  }

  return userRepo.getById(invitee);
}

function normalizeStringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, limit);
}

function normalizeWorkflowRole(value: unknown): AgentRole | undefined {
  if (typeof value !== "string") return undefined;
  return AGENT_ROLES.includes(value as AgentRole) ? value as AgentRole : undefined;
}

function normalizeWorkflowNodeType(value: unknown): WorkflowNodeType | undefined {
  if (typeof value !== "string") return undefined;
  return WORKFLOW_NODE_TYPES.includes(value as WorkflowNodeType) ? value as WorkflowNodeType : undefined;
}

function normalizeWorkflowReference(raw: unknown): WorkflowReferencePayload | undefined {
  if (!isObjectRecord(raw)) return undefined;
  const planSource = Array.isArray(raw.plan) ? raw.plan : [];
  const plan = planSource
    .slice(0, 24)
    .map((item, index): PlanNode | null => {
      if (!isObjectRecord(item)) return null;
      const id = normalizeString(item.id, `step-${index + 1}`, 80);
      const task = normalizeString(item.task, "", 1200).trim();
      if (!id || !task) return null;
      const config = isObjectRecord(item.config) ? item.config : undefined;
      return {
        id,
        task,
        dependsOn: normalizeStringArray(item.dependsOn, 12),
        agentRole: normalizeWorkflowRole(item.agentRole),
        type: normalizeWorkflowNodeType(item.type),
        config,
      };
    })
    .filter((item): item is PlanNode => Boolean(item));

  if (plan.length === 0) return undefined;

  const edges: Array<{ source: string; target: string; label?: string }> = [];
  const edgesSource = Array.isArray(raw.edges) ? raw.edges : [];
  for (const edge of edgesSource.slice(0, 48)) {
    if (!isObjectRecord(edge)) continue;
    const source = normalizeString(edge.source, "", 80);
    const target = normalizeString(edge.target, "", 80);
    if (!source || !target) continue;
    const label = normalizeString(edge.label, "", 80);
    edges.push({ source, target, label: label || undefined });
  }

  return {
    id: normalizeString(raw.id, `workflow-${Date.now()}`, 120),
    name: normalizeString(raw.name, "未命名工作流", 120),
    task: normalizeString(raw.task, "", 1200) || undefined,
    templateId: normalizeString(raw.templateId, "", 120) || undefined,
    templateTitle: normalizeString(raw.templateTitle, "", 120) || undefined,
    outputHint: normalizeString(raw.outputHint, "", 300) || undefined,
    plan,
    edges,
  };
}

function getWorkflowAgentMentions(workflowRef: WorkflowReferencePayload) {
  const roles = workflowRef.plan
    .map((step) => step.agentRole)
    .filter((role): role is AgentRole => Boolean(role));
  return [...new Set(roles.filter((role) => AGENT_NAMES.includes(role)))];
}

function compactWorkflowReference(workflowRef: WorkflowReferencePayload) {
  return {
    id: workflowRef.id,
    name: workflowRef.name,
    templateTitle: workflowRef.templateTitle,
    nodeCount: workflowRef.plan.length,
    edgeCount: workflowRef.edges.length,
  };
}

function safeDeployPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean);
  const safeParts = normalized.filter((part) => part !== "." && part !== "..");
  return safeParts.join("/") || "index.html";
}

async function resolveDeployConfig(rawConfig: Record<string, unknown>, providerId: string, projectName: string, userId: string): Promise<DeployConfig> {
  const deployConfig = {
    ...rawConfig,
    projectName,
    deploymentUserId: userId,
  } as DeployConfig;

  if (providerId !== "self-hosted") return deployConfig;

  const targetId = typeof rawConfig.deploymentTargetId === "string" ? rawConfig.deploymentTargetId : "";
  if (!targetId || targetId === "platform-default") {
    return {
      ...deployConfig,
      selfHostedScope: "platform-default",
    };
  }

  const target = await deploymentTargetRepo.getById(targetId);
  if (!target || target.userId !== userId) {
    throw new Error("部署目标不存在或无权访问");
  }

  return {
    ...deployConfig,
    deploymentTargetId: target.id,
    selfHostedScope: "user-target",
    sshHost: target.host,
    sshPort: target.port,
    sshUser: target.username,
    sshKeyContent: decryptSecret(target.privateKeyEncrypted),
    deployPath: target.deployPath,
    selfHostedPublicUrl: target.publicUrl,
    selfHostedPostDeployCommand: target.postDeployCommand || undefined,
  };
}

type DeployCardStatus = "deploying" | "done" | "failed";

interface DeployIntent {
  providerId: string;
}

interface DeployCardState {
  status: DeployCardStatus;
  providerId: string;
  url?: string;
  error?: string;
  deployId: string;
  artifactId?: string;
  files?: string[];
  progress?: number;
  verified?: boolean;
  verificationStatus?: number;
}

function getDeployProviderLabel(providerId: string) {
  const labels: Record<string, string> = {
    "self-hosted": "静态站点部署",
    "mock-preview": "预览 URL",
    "static-download": "源码打包下载",
    "container-package": "容器化部署包",
    vercel: "Vercel",
    miaoda: "Miaoda",
  };
  return labels[providerId] ?? providerId;
}

function deployCardMessageId(deployId: string) {
  return `deploy-card-${deployId}`;
}

function deployCardContent(state: DeployCardState) {
  const label = getDeployProviderLabel(state.providerId);
  if (state.status === "done") {
    return `部署完成。${label} 已返回访问链接${state.url ? `：${state.url}` : "。"}`;
  }
  if (state.status === "failed") {
    return `部署失败。${label} 返回错误：${state.error || "未知错误"}`;
  }
  return `已向 ${label} 提交部署任务，正在准备产物与发布环境。`;
}

async function upsertDeployCardMessage(conversationId: string, state: DeployCardState) {
  const content = deployCardContent(state);
  const platformLabel = getDeployProviderLabel(state.providerId);
  const payload = {
    status: state.status,
    platform: state.providerId,
    platformLabel,
    url: state.url,
    error: state.error,
    deployId: state.deployId,
    artifactId: state.artifactId,
    verified: state.verified,
    verificationStatus: state.verificationStatus,
    progress: state.progress,
    files: state.files,
  };

  return prisma.$transaction(async (tx) => {
    await tx.conversation.upsert({
      where: { id: conversationId },
      create: {
        id: conversationId,
        workspaceId: DEFAULT_WORKSPACE,
        title: content.slice(0, 40),
        lastMessage: content.slice(0, 200),
        lastMessageAt: new Date(),
      },
      update: {
        lastMessage: content.slice(0, 200),
        lastMessageAt: new Date(),
      },
    });

    return tx.message.upsert({
      where: { id: deployCardMessageId(state.deployId) },
      create: {
        id: deployCardMessageId(state.deployId),
        conversationId,
        type: "deploy_card",
        sender: state.status === "deploying" ? "system" : "Open Code",
        senderId: state.status === "deploying" ? "deploy" : "open-code",
        content,
        payload: JSON.stringify(payload),
        mentions: "[]",
      },
      update: {
        sender: state.status === "deploying" ? "system" : "Open Code",
        senderId: state.status === "deploying" ? "deploy" : "open-code",
        content,
        payload: JSON.stringify(payload),
      },
    });
  });
}

function extractDeployFilesFromConfig(rawConfig: Record<string, unknown>): DeployArtifact[] {
  const files = Array.isArray(rawConfig.files) ? rawConfig.files : [];
  const artifacts: DeployArtifact[] = [];
  for (const file of files) {
    if (!isObjectRecord(file)) continue;
    const path = typeof file.path === "string" ? file.path : "";
    const content = typeof file.content === "string" ? file.content : "";
    if (!path || !content.trim()) continue;
    artifacts.push({ path: safeDeployPath(path), content });
  }
  return artifacts;
}

function filePathWithSuffix(path: string, suffix: number) {
  if (suffix <= 1) return path;
  const slashIndex = path.lastIndexOf("/");
  const dir = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
  return `${dir}${stem}-${suffix}${ext}`;
}

function uniqueDeployPath(path: string, seen: Map<string, number>) {
  let suffix = (seen.get(path) ?? 0) + 1;
  let candidate = filePathWithSuffix(path, suffix);
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = filePathWithSuffix(path, suffix);
  }
  seen.set(path, suffix);
  seen.set(candidate, 1);
  return candidate;
}

function deployPathForArtifact(
  artifact: { type: string; filename: string | null; metadata: string | null; content: string },
  index: number
) {
  const metadata = parseJsonField<Record<string, unknown> | undefined>(artifact.metadata, undefined);
  const metadataPath =
    typeof metadata?.path === "string" ? metadata.path :
    typeof metadata?.filename === "string" ? metadata.filename :
    "";
  const htmlLike = artifact.type === "html" || /<!doctype\s+html|<html[\s>]/i.test(artifact.content);
  const fallback = htmlLike ? "index.html" : `${artifact.type || "artifact"}-${index + 1}.txt`;
  let path = safeDeployPath(metadataPath || artifact.filename || fallback);
  if (htmlLike && !/\.html?$/i.test(path)) path = "index.html";
  return path;
}

async function collectLatestConversationDeployArtifacts(conversationId: string): Promise<DeployArtifact[]> {
  const jobs = await prisma.job.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      artifacts: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const seen = new Map<string, number>();
  for (const job of jobs) {
    const deployable = job.artifacts
      .filter((artifact) => artifact.content.trim().length > 0)
      .filter((artifact) => !["deploy_url", "preview_url", "image"].includes(artifact.type));
    if (deployable.length === 0) continue;

    return deployable.map((artifact, index) => ({
      path: uniqueDeployPath(deployPathForArtifact(artifact, index), seen),
      content: artifact.content,
    }));
  }

  return [];
}

function parseDeployIntent(text: string): DeployIntent | null {
  const source = text.trim();
  if (!source) return null;
  const compact = source.replace(/\s+/g, "");
  const lowered = source.toLowerCase();
  const hasDeployWord = /(部署|发布|上线|预览|打包|下载|容器|镜像|deploy|publish|preview|docker|container|package|zip)/i.test(source);
  if (!hasDeployWord) return null;

  const commandLike =
    /^(请)?(帮我)?(一键)?((把|将)(当前|这个|最新|刚生成的|产物|网站|源码|代码))?(部署|发布|上线|预览|打包|下载)/.test(compact) ||
    /^(生成|一键生成).*(预览|URL|url|下载|部署包|容器包)/.test(compact) ||
    /^(deploy|publish|preview|docker|container|package)\b/i.test(source);
  const asksForAdvice = /(怎么|如何|为什么|是否|能不能|可以吗|方案|文档|教程|说明|配置|失败|问题|修复|实现|设计)/.test(source);
  if (!commandLike || asksForAdvice) return null;

  if (/vercel/i.test(source)) return { providerId: "vercel" };
  if (/(miaoda|妙搭)/i.test(source)) return { providerId: "miaoda" };
  if (/(容器|镜像|docker|container)/i.test(source)) return { providerId: "container-package" };
  if (/(源码|源代码|打包|下载|压缩|zip|package)/i.test(source)) return { providerId: "static-download" };
  if (/(预览|preview|url)/i.test(source)) return { providerId: "mock-preview" };
  if (/(静态|站点|网站|服务器|上线|发布|部署|deploy|publish)/i.test(source) || lowered === "deploy") {
    return { providerId: "self-hosted" };
  }
  return null;
}

async function runDeployRequest(options: {
  conversationId: string;
  ws: WebSocket;
  providerId: string;
  deployId: string;
  rawConfig: Record<string, unknown>;
  userId: string;
  artifacts: DeployArtifact[];
  artifactId?: string;
  allowPlaceholder?: boolean;
}) {
  const projectName = typeof options.rawConfig.projectName === "string" && options.rawConfig.projectName.trim()
    ? options.rawConfig.projectName.trim()
    : `agenthub-${options.conversationId.slice(0, 8)}`;
  const artifacts = options.artifacts.length > 0
    ? options.artifacts
    : await collectLatestConversationDeployArtifacts(options.conversationId);
  const effectiveArtifacts = artifacts.length > 0
    ? artifacts
    : options.allowPlaceholder
      ? [{ path: "index.html", content: "<!DOCTYPE html><html><body>AgentHub Deploy</body></html>" }]
      : [];
  const files = effectiveArtifacts.map((artifact) => artifact.path);

  await upsertDeployCardMessage(options.conversationId, {
    status: "deploying",
    providerId: options.providerId,
    deployId: options.deployId,
    artifactId: options.artifactId,
    files,
    progress: 0,
  });
  emitToRequesterAndRoom(options.conversationId, options.ws, {
    type: "deploy:progress",
    deployId: options.deployId,
    status: "deploying",
    progress: 0,
    providerId: options.providerId,
    logs: ["初始化部署..."],
    timestamp: Date.now(),
  });

  if (effectiveArtifacts.length === 0) {
    const error = "当前会话还没有可部署产物，请先生成网页、代码或静态站点文件。";
    await upsertDeployCardMessage(options.conversationId, {
      status: "failed",
      providerId: options.providerId,
      deployId: options.deployId,
      artifactId: options.artifactId,
      files,
      progress: 100,
      error,
    });
    emitToRequesterAndRoom(options.conversationId, options.ws, {
      type: "deploy:failed",
      deployId: options.deployId,
      error,
      providerId: options.providerId,
      timestamp: Date.now(),
    });
    return;
  }

  try {
    const deployConfig = await resolveDeployConfig(options.rawConfig, options.providerId, projectName, options.userId);
    const result = await deployManager.deploy(
      options.providerId,
      options.deployId,
      effectiveArtifacts,
      deployConfig,
      (progress, log) => {
        emitToRequesterAndRoom(options.conversationId, options.ws, {
          type: "deploy:progress",
          deployId: options.deployId,
          status: "deploying",
          progress,
          providerId: options.providerId,
          logs: [log],
          timestamp: Date.now(),
        });
      }
    );

    if (result.success) {
      await upsertDeployCardMessage(options.conversationId, {
        status: "done",
        providerId: options.providerId,
        deployId: options.deployId,
        artifactId: options.artifactId,
        files,
        progress: 100,
        url: result.url || "",
        verified: result.verified ?? options.providerId === "self-hosted",
        verificationStatus: result.verificationStatus,
      });
      emitToRequesterAndRoom(options.conversationId, options.ws, {
        type: "deploy:completed",
        deployId: options.deployId,
        url: result.url || "",
        providerId: options.providerId,
        verified: result.verified ?? options.providerId === "self-hosted",
        verificationStatus: result.verificationStatus,
        timestamp: Date.now(),
      });
    } else {
      const error = result.error || "部署失败";
      await upsertDeployCardMessage(options.conversationId, {
        status: "failed",
        providerId: options.providerId,
        deployId: options.deployId,
        artifactId: options.artifactId,
        files,
        progress: 100,
        error,
      });
      emitToRequesterAndRoom(options.conversationId, options.ws, {
        type: "deploy:failed",
        deployId: options.deployId,
        error,
        providerId: options.providerId,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await upsertDeployCardMessage(options.conversationId, {
      status: "failed",
      providerId: options.providerId,
      deployId: options.deployId,
      artifactId: options.artifactId,
      files,
      progress: 100,
      error,
    });
    emitToRequesterAndRoom(options.conversationId, options.ws, {
      type: "deploy:failed",
      deployId: options.deployId,
      error,
      providerId: options.providerId,
      timestamp: Date.now(),
    });
  }
}

export function setupWebSocket(server: HTTPServer, _adapter?: IAdapter) {
  const wss = new WebSocketServer({ noServer: true });
  const queue = getQueue();

  // Handle HTTP upgrade — no token in URL, auth happens via first message
  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let authenticated = false;
    let userId = "";
    let userName = "";
    let currentRoom: string | null = null;
    const subscribedRooms = new Set<string>();

    // 10 second auth timeout
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, "Auth timeout");
      }
    }, 10_000);

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Before auth, only accept "auth" messages
        if (!authenticated) {
          if (msg.type === "auth" && msg.token) {
            const user = await validateSession(msg.token);
            if (!user) {
              ws.close(4001, "Invalid token");
              clearTimeout(authTimeout);
              return;
            }
            authenticated = true;
            userId = user.id;
            userName = user.name;
            clearTimeout(authTimeout);
            (ws as AuthenticatedWebSocket).userId = userId;
            (ws as AuthenticatedWebSocket).userName = userName;
            logger.info(`Client authenticated: ${userName} (${userId})`, 'WebSocket');
            ws.send(JSON.stringify({ type: "connected", clientId: `client-${Date.now()}`, userId, userName, timestamp: Date.now() }));
          }
          // Ignore all non-auth messages before authentication
          return;
        }

        switch (msg.type) {
          // ══�?Conversation CRUD ══�?
          case "conversation:subscribe": {
            const error = validateConversationId(msg.conversationId);
            if (error) { sendError(ws, "VALIDATION", error); break; }
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const room = msg.conversationId;
            currentRoom = room;
            if (!subscribedRooms.has(room)) {
              joinRoom(room, ws);
              subscribedRooms.add(room);
            }
            ws.send(JSON.stringify({ type: "agent:status", conversationId: room, agentId: "system", status: "joined", lastOutput: room }));
            break;
          }

          case "conversation:unsubscribe": {
            const targetRoom = msg.conversationId || currentRoom;
            if (targetRoom) {
              leaveRoom(targetRoom, ws);
              subscribedRooms.delete(targetRoom);
              if (currentRoom === targetRoom) currentRoom = subscribedRooms.size ? Array.from(subscribedRooms).at(-1) ?? null : null;
            }
            break;
          }

          case "conversation:list": {
            const workspaceId = msg.workspaceId ?? DEFAULT_WORKSPACE;
            const convs = await conversationRepo.listByWorkspace(workspaceId, userId);
            ws.send(JSON.stringify({ type: "conversation:list:results", conversations: convs.map(toListItem), timestamp: Date.now() }));
            break;
          }

          case "conversation:create": {
            const workspaceError = validateWorkspaceId(msg.workspaceId);
            if (workspaceError) { sendError(ws, "VALIDATION", workspaceError); break; }
            const titleError = validateConversationTitle(msg.title);
            if (titleError) { sendError(ws, "VALIDATION", titleError); break; }
            const typeError = validateConversationType((msg as { convType?: string }).convType);
            if (typeError) { sendError(ws, "VALIDATION", typeError); break; }
            const participantsError = validateParticipants(msg.participants);
            if (participantsError) { sendError(ws, "VALIDATION", participantsError); break; }

            const convType = (msg as { convType?: string }).convType ?? "group";
            const participants = msg.participants ?? [];
            // Ensure creator is in participants
            if (!participants.includes(userId)) participants.push(userId);
            const initialRealUserCount = convType === "group" ? await countRealUsers(participants) : 0;
            const startAgentsEnabled = !(convType === "group" && initialRealUserCount >= 2);

            const newConv = await prisma.$transaction(async (tx) => {
              const conv = await tx.conversation.create({
                data: {
                  workspaceId: msg.workspaceId ?? DEFAULT_WORKSPACE,
                  title: msg.title ?? "新对话",
                  type: convType,
                  participants: JSON.stringify(participants),
                  createdBy: userId,
                  status: "active",
                },
              });

              // For group chats, enable only the coordinator plus agents selected in the conversation.
              if (convType === "group" || convType === "task_room") {
                for (const agentName of buildInitialConversationAgentNames(participants, convType)) {
                  await tx.conversationAgent.create({
                    data: { conversationId: conv.id, agentName, enabled: startAgentsEnabled },
                  });
                }
                await tx.message.create({
                  data: {
                    conversationId: conv.id,
                    type: "system",
                    sender: "system",
                    content: "群聊已创建，智能体团队已就绪",
                  },
                });
                if (!startAgentsEnabled) {
                  await tx.message.create({
                    data: {
                      conversationId: conv.id,
                      type: "system",
                      sender: "system",
                      content: "群聊已进入讨论模式，Agent 已静音。点击确认执行后，PMO 将读取过滤后的上下文。",
                    },
                  });
                }
              }

              return conv;
            });

            const clientId = (msg as { clientId?: string }).clientId;
            ws.send(JSON.stringify({ type: "conversation:created", conversation: toListItem({ ...newConv, participants: newConv.participants ?? "[]", lastMessage: newConv.lastMessage ?? null, lastMessageAt: newConv.lastMessageAt ?? null }), clientId, timestamp: Date.now() }));
            break;
          }

          case "conversation:search": {
            const workspaceError = validateWorkspaceId(msg.workspaceId);
            if (workspaceError) { sendError(ws, "VALIDATION", workspaceError); break; }
            const queryError = validateSearchQuery(msg.query);
            if (queryError) { sendError(ws, "VALIDATION", queryError); break; }
            const workspaceId = msg.workspaceId ?? DEFAULT_WORKSPACE;
            const convs = await conversationRepo.search(workspaceId, msg.query, userId);
            ws.send(JSON.stringify({ type: "conversation:search:results", conversations: convs.map(toListItem), timestamp: Date.now() }));
            break;
          }

          case "conversation:pin": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.pin(msg.conversationId);
            ws.send(JSON.stringify({ type: "conversation:pinned", conversationId: conv.id, timestamp: Date.now() }));
            broadcast(conv.id, { type: "conversation:updated", conversation: toListItem({ ...conv, participants: conv.participants ?? "[]", lastMessage: conv.lastMessage ?? null, lastMessageAt: conv.lastMessageAt ?? null }), timestamp: Date.now() });
            break;
          }

          case "conversation:unpin": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.unpin(msg.conversationId);
            ws.send(JSON.stringify({ type: "conversation:unpinned", conversationId: conv.id, timestamp: Date.now() }));
            broadcast(conv.id, { type: "conversation:updated", conversation: toListItem({ ...conv, participants: conv.participants ?? "[]", lastMessage: conv.lastMessage ?? null, lastMessageAt: conv.lastMessageAt ?? null }), timestamp: Date.now() });
            break;
          }

          case "conversation:archive": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.archive(msg.conversationId);
            ws.send(JSON.stringify({ type: "conversation:archived", conversationId: conv.id, timestamp: Date.now() }));
            broadcast(conv.id, { type: "conversation:updated", conversation: toListItem({ ...conv, participants: conv.participants ?? "[]", lastMessage: conv.lastMessage ?? null, lastMessageAt: conv.lastMessageAt ?? null }), timestamp: Date.now() });
            break;
          }

          case "conversation:history": {
            const conversationIdError = validateConversationId(msg.conversationId);
            if (conversationIdError) { sendError(ws, "VALIDATION", conversationIdError); break; }
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const take = msg.take ?? 50;
            const before = msg.before;
            const messages = await messageRepo.listByConversation(msg.conversationId, { take, before });
            ws.send(JSON.stringify({ type: "conversation:history", conversationId: msg.conversationId, messages: messages.map(m => ({
              id: m.id,
              conversationId: m.conversationId,
              type: m.type,
              sender: m.sender,
              senderId: m.senderId,
              content: m.content,
              payload: parseJsonField<Record<string, unknown> | undefined>(m.payload, undefined),
              mentions: parseJsonField<string[]>(m.mentions, []),
              timestamp: m.timestamp.getTime(),
            })), timestamp: Date.now() }));
            break;
          }

          case "conversation:unarchive": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.unarchive(msg.conversationId);
            ws.send(JSON.stringify({ type: "conversation:unarchived", conversationId: conv.id, timestamp: Date.now() }));
            broadcast(conv.id, { type: "conversation:updated", conversation: toListItem({ ...conv, participants: conv.participants ?? "[]", lastMessage: conv.lastMessage ?? null, lastMessageAt: conv.lastMessageAt ?? null }), timestamp: Date.now() });
            break;
          }

          case "conversation:delete": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.delete(msg.conversationId);
            ws.send(JSON.stringify({ type: "conversation:deleted", conversationId: conv.id, timestamp: Date.now() }));
            if (subscribedRooms.has(conv.id)) {
              leaveRoom(conv.id, ws);
              subscribedRooms.delete(conv.id);
            }
            if (currentRoom === conv.id) currentRoom = subscribedRooms.size ? Array.from(subscribedRooms).at(-1) ?? null : null;
            break;
          }

          case "conversation:rename": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const title = (msg as { title: string }).title?.trim();
            if (!title || title.length > 100) { sendError(ws, "VALIDATION", "Title must be 1-100 characters"); break; }
            const conv = await conversationRepo.update(msg.conversationId, { title });
            const updated = toListItem({ ...conv, participants: conv.participants ?? "[]", lastMessage: conv.lastMessage ?? null, lastMessageAt: conv.lastMessageAt ?? null });
            ws.send(JSON.stringify({ type: "conversation:renamed", conversationId: msg.conversationId, title, timestamp: Date.now() }));
            broadcast(msg.conversationId, { type: "conversation:updated", conversation: updated });
            break;
          }

          // ══�?Message Send ══�?
          case "message:send":
          case "task:submit": {
            const textError = validateMessageText(msg.text ?? msg.input);
            if (textError) { sendError(ws, "VALIDATION", textError); break; }
            const conversationIdError = validateConversationId(msg.conversationId);
            if (conversationIdError) { sendError(ws, "VALIDATION", conversationIdError); break; }
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;

            const text: string = msg.text ?? msg.input ?? "";
            const conversationId: string = msg.conversationId ?? "default";
            const clientMsgId: string | undefined = (msg as { clientMsgId?: string }).clientMsgId;
            const workflowRef = normalizeWorkflowReference((msg as { workflowRef?: unknown }).workflowRef);
            const agentExecution = normalizeAgentExecution((msg as { agentExecution?: unknown }).agentExecution);

            let convType = "group";
            let agentName = "planner";
            let convParticipants: string[] = [];
            try {
              const conv = await conversationRepo.getById(conversationId);
              if (conv) {
                convType = conv.type ?? "group";
                convParticipants = getParticipants(conv);
                if (convType === "direct") {
                  // 查找对话中实际的智能体名称
                  const convAgents = await conversationAgentRepo.listByConversation(conversationId);
                  const enabledAgent = convAgents.find(a => a.enabled);
                  agentName = enabledAgent?.agentName ?? "planner";
                }
              }
            } catch (err) {
              logger.warn(`Failed to parse conversation participants: ${err}`, 'WebSocket');
            }

            const realUserCount = convType === "group" ? await countRealUsers(convParticipants) : 0;
            const isMultiUserGroup = convType === "group" && realUserCount >= 2;
            const convAgents = await conversationAgentRepo.listByConversation(conversationId);
            const groupAgentsEnabled = isMultiUserGroup && hasEnabledAgent(convAgents);

            if (isMultiUserGroup && !agentExecution && !groupAgentsEnabled) {
              const userMsg = await messageRepo.createAndUpdateConv({
                conversationId,
                type: "user_message",
                sender: userName,
                senderId: userId,
                content: text,
                mentions: [],
                id: clientMsgId,
                payload: { kind: "human_discussion", agentMuted: true, realUserCount },
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: userMsg.id,
                  conversationId,
                  type: userMsg.type,
                  sender: userMsg.sender,
                  senderId: userId,
                  content: userMsg.content,
                  mentions: [],
                  payload: { kind: "human_discussion", agentMuted: true, realUserCount },
                  timestamp: userMsg.timestamp.getTime(),
                },
              });
              break;
            }

            const deployIntent = !workflowRef ? parseDeployIntent(text) : null;
            if (deployIntent) {
              const userMsg = await messageRepo.createAndUpdateConv({
                conversationId, type: "user_message", sender: userName, senderId: userId, content: text, mentions: [],
                id: clientMsgId,
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: userMsg.id,
                  conversationId,
                  type: userMsg.type,
                  sender: userMsg.sender,
                  senderId: userId,
                  content: userMsg.content,
                  mentions: [],
                  timestamp: userMsg.timestamp.getTime(),
                },
              });

              await runDeployRequest({
                conversationId,
                ws,
                providerId: deployIntent.providerId,
                deployId: `chat-deploy-${Date.now()}`,
                rawConfig: { projectName: `agenthub-${conversationId.slice(0, 8)}` },
                userId,
                artifacts: [],
                allowPlaceholder: false,
              });
              break;
            }

            const isDirectConv = convType === "direct";
            const enabledAgentNames = agentExecution
              ? buildInitialConversationAgentNames(convParticipants, convType)
              : getEffectiveEnabledAgentNames(convParticipants, convType, convAgents);
            const hasEnabledAgents = enabledAgentNames.length > 0;
            const originalMentionParse = resolveConversationMentions(text, enabledAgentNames);
            const simpleChat = !workflowRef && !originalMentionParse.hasMention && isSimpleChat(text);
            const artifactTask = isArtifactGenerationTask(text) || isDeliverableGenerationTask(text);
            const mentionCleanText = originalMentionParse.cleanText.trim();
            const isMentionOnlyInput = originalMentionParse.hasMention && !mentionCleanText && !workflowRef && !agentExecution;
            const isLightweightMentionInput = originalMentionParse.hasMention && !workflowRef && !agentExecution && isLightweightMentionChat(mentionCleanText);
            const quoteIntent = parseComposerQuoteIntent(text);
            const contextualQuoteChat = !workflowRef && !agentExecution && isContextualQuoteChat(text);

            if (contextualQuoteChat && !originalMentionParse.hasMention) {
              const payload = {
                kind: quoteIntent.quoteOnly ? "context_quote" : "context_quote_chat",
                quoteOnly: quoteIntent.quoteOnly,
                quotedText: quoteIntent.quotedText.slice(0, 1200),
                promptText: quoteIntent.promptText.slice(0, 500),
              };
              const userMsg = await messageRepo.createAndUpdateConv({
                conversationId,
                type: "user_message",
                sender: userName,
                senderId: userId,
                content: text,
                mentions: [],
                id: clientMsgId,
                payload,
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: userMsg.id,
                  conversationId,
                  type: userMsg.type,
                  sender: userMsg.sender,
                  senderId: userId,
                  content: userMsg.content,
                  mentions: [],
                  payload,
                  timestamp: userMsg.timestamp.getTime(),
                },
              });

              const sender = isDirectConv ? agentName : "planner";
              let reply = "已把这段引用加入当前对话，我会把它作为后续上下文，不会直接启动任务流程。";
              if (!quoteIntent.quoteOnly) {
                let adapter: IAdapter | null = null;
                try {
                  adapter = createAdapterFromEnv();
                  await adapter.connect();
                  reply = await adapter.sendMessage(
                    [
                      "用户引用了一段会话内容，并希望你基于这段引用做轻量解释或回应。",
                      `引用内容：${quoteIntent.quotedText || "（无可见引用内容）"}`,
                      `用户补充：${quoteIntent.promptText}`,
                    ].join("\n"),
                    {
                      temperature: 0.5,
                      maxTokens: 220,
                      systemPrompt: [
                        "你是 AgentHub 群聊助手。",
                        "当前消息是引用上下文，不是执行任务。除非用户明确要求生成、修改、部署或执行，否则不要进入任务流程。",
                        "请自然解释或回应，最多 120 字。",
                        "不要输出标题、步骤列表、任务完成总览、代码块或 Markdown 表格。",
                      ].join("\n"),
                    }
                  );
                  reply = reply
                    .replace(/```[\s\S]*?```/g, "")
                    .replace(/^#+\s*/gm, "")
                    .replace(/\*\*/g, "")
                    .split(/\n{2,}/)[0]
                    .trim()
                    .slice(0, 240);
                  if (!reply || /任务完成总览|完成状态|交付内容|步骤\d|技术方案/i.test(reply)) {
                    reply = "这段引用已经放进上下文了。你可以继续问它的含义，或者说明希望我怎么处理它。";
                  }
                } catch (err) {
                  logger.warn(`Failed to answer contextual quote chat: ${err}`, "WebSocket");
                  reply = "这段引用已经放进上下文了。你可以继续问它的含义，或者说明希望我怎么处理它。";
                } finally {
                  await adapter?.disconnect().catch(() => undefined);
                }
              }

              const agentMsg = await messageRepo.createAndUpdateConv({
                conversationId,
                type: "agent_message",
                sender,
                senderId: sender,
                content: reply,
                mentions: [],
                payload: { kind: "context_quote_ack", quoteOnly: quoteIntent.quoteOnly },
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: agentMsg.id,
                  conversationId: agentMsg.conversationId,
                  type: agentMsg.type,
                  sender: agentMsg.sender,
                  senderId: agentMsg.senderId ?? undefined,
                  content: agentMsg.content,
                  mentions: [],
                  payload: { kind: "context_quote_ack", quoteOnly: quoteIntent.quoteOnly },
                  timestamp: agentMsg.timestamp.getTime(),
                },
              });
              break;
            }

            const shouldUseSimpleChat = !artifactTask && (simpleChat || !hasEnabledAgents || isDirectConv);
            if (!agentExecution && !groupAgentsEnabled && !originalMentionParse.hasMention && shouldUseSimpleChat) {
              const userMsg = await messageRepo.createAndUpdateConv({
                conversationId, type: "user_message", sender: userName, senderId: userId, content: text, mentions: [],
                id: clientMsgId,
              });
              broadcast(conversationId, { type: "message:created", message: { id: userMsg.id, conversationId, type: userMsg.type, sender: userMsg.sender, senderId: userId, content: userMsg.content, mentions: [], timestamp: userMsg.timestamp.getTime() } });

              // Get LLM response with conversation history
              {
                try {
                  const recentMsgs = await messageRepo.listByConversation(conversationId, { take: 20 });
                  const history = recentMsgs
                    .filter(m => !isAgentBoundaryMessage(m))
                    .map(m => ({
                      role: (m.type === "user_message" || m.sender === "user") ? "user" as const : "assistant" as const,
                      content: m.content.slice(0, 500),
                    }));

                  const adapter = createAdapterFromEnv();
                  await adapter.connect();
                  const systemPrompt = simpleChat
                    ? "你是 AgentHub 智能助手。简洁友好地回复用户。打招呼时简短回应，不要列出团队信息，不要重复用户的话。"
                    : "你是 AgentHub 智能助手。简短友好地回复用户，不超过100字。";
                  const reply = await adapter.sendMessage(
                    text,
                    { temperature: 0.7, maxTokens: 4096, history, systemPrompt }
                  );
                  await adapter.disconnect();
                  const sender = isDirectConv ? agentName : "planner";
                  const agentMsg = await messageRepo.createAndUpdateConv({
                    conversationId, type: "agent_message", sender, content: reply, mentions: [],
                  });
                  broadcast(conversationId, { type: "message:created", message: { id: agentMsg.id, conversationId, type: agentMsg.type, sender: agentMsg.sender, content: agentMsg.content, mentions: [], timestamp: agentMsg.timestamp.getTime() } });
                } catch (err) {
                  logger.error(`Failed to get LLM response for simple chat: ${err}`, err as Error, 'WebSocket');
                  const fallback = await messageRepo.createAndUpdateConv({
                    conversationId, type: "agent_message", sender: isDirectConv ? agentName : "planner", content: "你好！我是 AgentHub 智能助手，有什么任务需要我帮忙吗？", mentions: [],
                  });
                  broadcast(conversationId, { type: "message:created", message: { id: fallback.id, conversationId, type: fallback.type, sender: fallback.sender, content: fallback.content, mentions: [], timestamp: fallback.timestamp.getTime() } });
                }
              }
              break;
            }

            let executionSummary: AgentExecutionContextSummary | null = null;
            let routingText = text;
            let shouldBroadcastExecutionSummary = false;
            const shouldBuildExecutionSummary = (agentExecution || groupAgentsEnabled) && !isMentionOnlyInput && !isLightweightMentionInput;
            if (shouldBuildExecutionSummary) {
              const recentMsgs = await listRecentMessagesForAgentContext(conversationId);
              const scopedMsgs = isMultiUserGroup ? getAgentScopedMessages(recentMsgs) : recentMsgs;
              const messagesForSummary = [
                ...scopedMsgs,
                { type: "user_message", sender: userName, content: text },
              ];
              executionSummary = buildExecutionSummaryFromMessages(
                messagesForSummary,
                agentExecution?.task || text,
                agentExecution?.contextSummary,
              );
              routingText = formatExecutionTask(executionSummary);
              shouldBroadcastExecutionSummary = Boolean(agentExecution);

              if (agentExecution) {
                if (isMultiUserGroup && !groupAgentsEnabled) {
                  await createAgentBoundaryMessage(conversationId, "start", userId);
                }
                for (const agentName of await setConversationAgentsEnabled(conversationId, convParticipants, convType, true)) {
                  broadcast(conversationId, { type: "agent:enabled", conversationId, agentName, timestamp: Date.now() });
                }
              }
            }

            // Agents are enabled - proceed with orchestrator
            const routingMentionParse = resolveConversationMentions(routingText, enabledAgentNames);
            const mentionParse = routingMentionParse.hasMention ? routingMentionParse : originalMentionParse;
            const cleanText = routingMentionParse.hasMention
              ? routingMentionParse.cleanText
              : mentionParse.hasMention
                ? mentionParse.cleanText
                : routingMentionParse.cleanText;
            const { isAllAgents } = mentionParse;

            let matchedAgents = mentionParse.agents;
            let matchSummary = "";
            if (executionSummary && shouldBroadcastExecutionSummary) {
              const matched = matchByKeywords(executionSummary.goal || routingText);
              matchedAgents = mentionParse.agents.length > 0 ? mentionParse.agents : matched.map((m) => m.agentId);
              matchSummary = `多人讨论已确认 · 已过滤 ${executionSummary.sourceMessageCount} 条上下文`;
            } else if (workflowRef) {
              matchedAgents = getWorkflowAgentMentions(workflowRef);
              matchSummary = `引用工作流「${workflowRef.name}」 · ${workflowRef.plan.length} 个节点`;
            } else if (isAllAgents) {
              matchedAgents = AGENT_NAMES;
              matchSummary = "已启用全部智能体";
            } else if (mentionParse.hasMention && matchedAgents.length > 0) {
              matchSummary = `已点名 ${matchedAgents.join("、")}`;
            } else if (matchedAgents.length === 0) {
              const matched = matchByKeywords(cleanText || routingText);
              matchedAgents = matched.map((m) => m.agentId);
              matchSummary = artifactTask
                ? "产物型任务 · 已切换为 PMO 编排流程"
                : matched.length > 0
                ? `AI 自动匹配: ${matched.map((m) => m.label).join("、")}`
                : "完整流水线";
            }

            // Route only to agents that belong to this conversation. Custom agents can satisfy
            // built-in roles, e.g. "Frontend Agent" can receive a worker/code task.
            matchedAgents = selectEnabledAgentsForTask(matchedAgents, enabledAgentNames);
            const isMentionOnlyTask = isMentionOnlyInput && !executionSummary;
            const isLightweightMentionTask = isLightweightMentionInput && !executionSummary;

            const userMsg = await messageRepo.createAndUpdateConv({
              conversationId, type: "user_message", sender: userName, senderId: userId, content: text, mentions: matchedAgents,
              id: clientMsgId,
              payload: {
                ...(workflowRef ? { workflowRef: compactWorkflowReference(workflowRef) } : {}),
                ...(executionSummary ? { agentExecution: { mode: "execute", task: executionSummary.goal, contextSummary: executionSummary } } : {}),
              },
            });

            broadcast(conversationId, {
              type: "message:created",
              message: {
                id: userMsg.id, conversationId: userMsg.conversationId,
                type: userMsg.type, sender: userMsg.sender, senderId: userId, content: userMsg.content,
                mentions: matchedAgents,
                payload: {
                  ...(workflowRef ? { workflowRef: compactWorkflowReference(workflowRef) } : {}),
                  ...(executionSummary ? { agentExecution: { mode: "execute", task: executionSummary.goal, contextSummary: executionSummary } } : {}),
                },
                timestamp: userMsg.timestamp.getTime(),
              },
            });

            if (isMentionOnlyTask || isLightweightMentionTask) {
              const sender = matchedAgents[0] ?? mentionParse.agents[0] ?? "planner";
              const payloadKind = isMentionOnlyTask ? "mention_ack" : "mention_chat";
              const reply = await buildLightweightMentionReply(sender, userId, isLightweightMentionTask ? mentionCleanText : "");
              const agentMsg = await messageRepo.createAndUpdateConv({
                conversationId,
                type: "agent_message",
                sender,
                senderId: sender,
                content: reply,
                mentions: [],
                payload: { kind: payloadKind, targetAgent: sender },
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: agentMsg.id,
                  conversationId: agentMsg.conversationId,
                  type: agentMsg.type,
                  sender: agentMsg.sender,
                  senderId: agentMsg.senderId ?? undefined,
                  content: agentMsg.content,
                  mentions: [],
                  payload: { kind: payloadKind, targetAgent: sender },
                  timestamp: agentMsg.timestamp.getTime(),
                },
              });
              break;
            }

            if (executionSummary) {
              const summaryMsg = await messageRepo.create({
                conversationId,
                type: "system",
                sender: "system",
                content: formatExecutionSummaryMessage(executionSummary, realUserCount),
                payload: { kind: "context_filter_summary", contextSummary: executionSummary, realUserCount },
              });
              broadcast(conversationId, {
                type: "message:created",
                message: {
                  id: summaryMsg.id,
                  conversationId: summaryMsg.conversationId,
                  type: summaryMsg.type,
                  sender: summaryMsg.sender,
                  content: summaryMsg.content,
                  payload: { kind: "context_filter_summary", contextSummary: executionSummary, realUserCount },
                  mentions: [],
                  timestamp: summaryMsg.timestamp.getTime(),
                },
              });
            }

            const queueTask = workflowRef?.task
              || cleanText
              || routingText;
            const jobId = await queue.enqueue({
              workspaceId: DEFAULT_WORKSPACE,
              conversationId,
              userId,
              task: queueTask,
              mentions: matchedAgents,
              plan: workflowRef?.plan,
              edges: workflowRef?.edges,
              workflowRef,
              broadcast: (data) => broadcast(conversationId, data),
            });

            broadcast(conversationId, { type: "task:created", jobId, timestamp: Date.now() });

            // 通知前端各 Agent 将要执行的任务
            for (const agentName of matchedAgents) {
              broadcast(conversationId, {
                type: "task:assigned",
                jobId,
                targetAgent: agentName,
                task: workflowRef
                  ? `按工作流「${workflowRef.name}」执行：${queueTask.slice(0, 60)}`
                  : `执行：${queueTask.slice(0, 60)}`,
                timestamp: Date.now(),
              });
            }

            const ackMsg = await messageRepo.create({
              conversationId,
              type: "system",
              sender: "system",
              content: matchSummary
                ? `任务已提交 · ${matchSummary} (Job: ${jobId.slice(0, 8)})`
                : `任务已派发到 @${matchedAgents.join(", @")}`,
            });

            broadcast(conversationId, {
              type: "message:created",
              message: {
                id: ackMsg.id, conversationId: ackMsg.conversationId,
                type: ackMsg.type, sender: ackMsg.sender, content: ackMsg.content,
                timestamp: ackMsg.timestamp.getTime(),
              },
            });
            break;
          }

          // ══�?Agent Control ══�?
          case "agent:enable": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            const participants = getParticipants(conv);
            const realUserCount = conv.type === "group" ? await countRealUsers(participants) : 0;
            const isMultiUserGroup = conv.type === "group" && realUserCount >= 2;
            const currentAgents = await conversationAgentRepo.listByConversation(msg.conversationId);

            if (isMultiUserGroup) {
              if (conv.createdBy !== userId) {
                sendError(ws, "FORBIDDEN", "Only the group owner can enable agents in a multi-user group");
                break;
              }
              if (!hasEnabledAgent(currentAgents)) {
                await createAgentBoundaryMessage(msg.conversationId, "start", userId);
              }
              await setConversationAgentsEnabled(msg.conversationId, participants, conv.type, true);
              broadcast(msg.conversationId, { type: "agent:enabled", conversationId: msg.conversationId, agentName: GROUP_AGENT_CONTROL_NAME, timestamp: Date.now() });
              break;
            }

            await conversationAgentRepo.setEnabled(msg.conversationId, msg.agentName, true);
            broadcast(msg.conversationId, { type: "agent:enabled", conversationId: msg.conversationId, agentName: msg.agentName, timestamp: Date.now() });
            break;
          }

          case "agent:disable": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            const participants = getParticipants(conv);
            const realUserCount = conv.type === "group" ? await countRealUsers(participants) : 0;
            const isMultiUserGroup = conv.type === "group" && realUserCount >= 2;
            const currentAgents = await conversationAgentRepo.listByConversation(msg.conversationId);

            if (isMultiUserGroup) {
              if (conv.createdBy !== userId) {
                sendError(ws, "FORBIDDEN", "Only the group owner can mute agents in a multi-user group");
                break;
              }
              if (hasEnabledAgent(currentAgents)) {
                await createAgentBoundaryMessage(msg.conversationId, "end", userId);
              }
              await setConversationAgentsEnabled(msg.conversationId, participants, conv.type, false);
              broadcast(msg.conversationId, { type: "agent:disabled", conversationId: msg.conversationId, agentName: GROUP_AGENT_CONTROL_NAME, timestamp: Date.now() });
              break;
            }

            await conversationAgentRepo.setEnabled(msg.conversationId, msg.agentName, false);
            broadcast(msg.conversationId, { type: "agent:disabled", conversationId: msg.conversationId, agentName: msg.agentName, timestamp: Date.now() });
            break;
          }

          case "agent:add": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            if (conv.type !== "group" && conv.type !== "task_room") {
              sendError(ws, "VALIDATION", "Only group conversations can add agents");
              break;
            }

            const requestedAgentNames = normalizeAgentAddNames((msg as { agentNames?: unknown }).agentNames);
            if (requestedAgentNames.length === 0) {
              sendError(ws, "VALIDATION", "agentNames is required");
              break;
            }

            const participants = getParticipants(conv);
            const participantKeys = new Set(participants.map(normalizeAgentKey));
            const additions = requestedAgentNames.filter((agentName) => !participantKeys.has(normalizeAgentKey(agentName)));
            if (additions.length === 0) {
              sendError(ws, "ALREADY_MEMBER", "Selected agents are already in this conversation");
              break;
            }

            const nextParticipants = [...participants, ...additions];
            const realUserCount = conv.type === "group" ? await countRealUsers(nextParticipants) : 0;
            const currentAgents = await conversationAgentRepo.listByConversation(msg.conversationId);
            const newAgentEnabled = conv.type === "group" && realUserCount >= 2 ? hasEnabledAgent(currentAgents) : true;
            await conversationRepo.update(msg.conversationId, { participants: JSON.stringify(nextParticipants) });

            for (const agentName of additions) {
              await conversationAgentRepo.setEnabled(msg.conversationId, agentName, newAgentEnabled);
            }

            const notice = await messageRepo.createAndUpdateConv({
              conversationId: msg.conversationId,
              type: "system",
              sender: "system",
              content: `已添加智能体：${additions.join("、")}`,
              payload: { kind: "member_update", addedAgents: additions },
              mentions: additions,
            });
            const latestConv = await conversationRepo.getById(msg.conversationId);
            if (latestConv) {
              const updated = toListItem({ ...latestConv, participants: latestConv.participants ?? "[]", lastMessage: latestConv.lastMessage ?? null, lastMessageAt: latestConv.lastMessageAt ?? null });
              emitToRequesterAndRoom(msg.conversationId, ws, { type: "conversation:updated", conversation: updated, timestamp: Date.now() });
            }
            emitToRequesterAndRoom(msg.conversationId, ws, {
              type: "message:created",
              message: {
                id: notice.id,
                conversationId: notice.conversationId,
                type: notice.type,
                sender: notice.sender,
                content: notice.content,
                payload: { kind: "member_update", addedAgents: additions },
                mentions: additions,
                timestamp: notice.timestamp.getTime(),
              },
            });
            for (const agentName of additions) {
              emitToRequesterAndRoom(msg.conversationId, ws, {
                type: newAgentEnabled ? "agent:enabled" : "agent:disabled",
                conversationId: msg.conversationId,
                agentName,
                timestamp: Date.now(),
              });
            }
            break;
          }

          case "agent:list": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            const agents = await conversationAgentRepo.listByConversation(msg.conversationId);
            const participants = getParticipants(conv);
            const realUserCount = conv.type === "group" ? await countRealUsers(participants) : 0;
            const defaultAgentEnabled = !(conv.type === "group" && realUserCount >= 2);
            const initialAgentNames = buildInitialConversationAgentNames(participants, conv.type);
            const hasExplicitParticipantAgents = initialAgentNames.some((name) => !isCoordinatorAgent(name));
            const visibleAgentNames = hasExplicitParticipantAgents
              ? initialAgentNames
              : agents.map((agent) => agent.agentName);
            const agentMap = new Map(agents.map((agent) => [agent.agentName, agent]));
            ws.send(JSON.stringify({
              type: "agent:list:results",
              conversationId: msg.conversationId,
              agents: visibleAgentNames.map((agentName) => {
                const entry = agentMap.get(agentName);
                return {
                  agentName,
                  enabled: entry?.enabled ?? defaultAgentEnabled,
                  addedAt: entry?.addedAt.getTime() ?? conv.createdAt.getTime(),
                };
              }),
              timestamp: Date.now(),
            }));
            break;
          }

          // ══�?Member Management ══�?
          case "member:invite": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const beforeConv = await conversationRepo.getById(msg.conversationId);
            const beforeParticipants = beforeConv ? getParticipants(beforeConv) : [];
            const beforeRealUserCount = beforeConv?.type === "group" ? await countRealUsers(beforeParticipants) : 0;
            const invitedUser = await resolveInvitee(msg);
            if (!normalizeInviteIdentifier(msg)) {
              sendError(ws, "VALIDATION", "User email or user id is required");
              break;
            }
            if (!invitedUser) { sendError(ws, "NOT_FOUND", "User not found"); break; }
            const added = await conversationRepo.addParticipant(msg.conversationId, invitedUser.id);
            if (!added) { sendError(ws, "ALREADY_MEMBER", "User is already a member or conversation not found"); break; }
            const afterConv = await conversationRepo.getById(msg.conversationId);
            const afterParticipants = afterConv ? getParticipants(afterConv) : [];
            const afterRealUserCount = afterConv?.type === "group" ? await countRealUsers(afterParticipants) : 0;
            if (afterConv?.type === "group" && beforeRealUserCount < 2 && afterRealUserCount >= 2) {
              await setConversationAgentsEnabled(msg.conversationId, afterParticipants, afterConv.type, false);
              broadcast(msg.conversationId, { type: "agent:disabled", conversationId: msg.conversationId, agentName: GROUP_AGENT_CONTROL_NAME, timestamp: Date.now() });
            }
            broadcast(msg.conversationId, { type: "member:added", conversationId: msg.conversationId, userId: invitedUser.id, userName: invitedUser.name, timestamp: Date.now() });
            break;
          }

          case "member:remove": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            // Only creator can remove others; users can remove themselves
            if (msg.userId !== userId) {
              const conv = await conversationRepo.getById(msg.conversationId);
              if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
              if (conv.createdBy !== userId) {
                sendError(ws, "FORBIDDEN", "Only the conversation creator can remove other members");
                break;
              }
            }
            const removed = await conversationRepo.removeParticipant(msg.conversationId, msg.userId);
            if (!removed) { sendError(ws, "NOT_FOUND", "User is not a member or cannot remove last member"); break; }
            broadcast(msg.conversationId, { type: "member:removed", conversationId: msg.conversationId, userId: msg.userId, timestamp: Date.now() });
            break;
          }

          case "member:list": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            const participants = getParticipants(conv);
            const agentNames = buildInitialConversationAgentNames(participants, conv.type);
            const agentNameSet = new Set(agentNames);
            const userIds = participants.filter((p) => !isCoordinatorAgent(p) && !AGENT_NAMES.includes(p) && !agentNameSet.has(p));
            const users = await userRepo.getByIds(userIds);
            const userMap = new Map(users.map((u) => [u.id, u]));
            const agentMembers = agentNames.map((agentName) => ({ userId: agentName, userName: agentName, role: "agent", joinedAt: 0 }));
            const userMembers = participants.map((pid) => {
              const u = userMap.get(pid);
              return u ? { userId: u.id, userName: u.name, role: u.id === conv.createdBy ? "owner" : "member", joinedAt: u.createdAt.getTime() } : null;
            }).filter(Boolean);
            const members = [...agentMembers, ...userMembers];
            ws.send(JSON.stringify({ type: "member:list:results", conversationId: msg.conversationId, members, timestamp: Date.now() }));
            break;
          }

          // ══�?File Management ══�?
          case "file:list": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const files = await fileRepo.listByConversation(msg.conversationId);
            ws.send(JSON.stringify({
              type: "file:list:results",
              conversationId: msg.conversationId,
              files: files.map(f => ({ id: f.id, conversationId: f.conversationId, uploaderId: f.uploaderId, name: f.name, size: f.size, mimeType: f.mimeType, createdAt: f.createdAt.getTime() })),
              timestamp: Date.now(),
            }));
            break;
          }

          case "file:delete": {
            const fileIdError = validateString(msg.fileId, 'fileId', { required: true, maxLength: 100 });
            if (fileIdError) { sendError(ws, "VALIDATION", fileIdError); break; }
            const file = await fileRepo.getById(msg.fileId);
            if (!file) { sendError(ws, "NOT_FOUND", "File not found"); break; }
            if (!await checkConversationAccess(ws, file.conversationId, userId)) break;
            await fileRepo.delete(msg.fileId);
            broadcast(file.conversationId, { type: "file:deleted", fileId: msg.fileId, timestamp: Date.now() });
            break;
          }

          // ══�?Conversation Groups ══�?
          case "group:create": {
            const group = await conversationGroupRepo.create({
              workspaceId: msg.workspaceId ?? DEFAULT_WORKSPACE,
              name: msg.name,
              description: msg.description,
              ownerId: userId,
            });
            ws.send(JSON.stringify({
              type: "group:created",
              group: { id: group.id, workspaceId: group.workspaceId, name: group.name, description: group.description, ownerId: group.ownerId, conversationIds: [], createdAt: group.createdAt.getTime(), updatedAt: group.updatedAt.getTime() },
              timestamp: Date.now(),
            }));
            break;
          }

          case "group:update": {
            const group = await conversationGroupRepo.update(msg.groupId, { name: msg.name, description: msg.description });
            ws.send(JSON.stringify({
              type: "group:updated",
              group: { id: group.id, workspaceId: group.workspaceId, name: group.name, description: group.description, ownerId: group.ownerId, conversationIds: group.items?.map(i => i.conversationId) ?? [], createdAt: group.createdAt.getTime(), updatedAt: group.updatedAt.getTime() },
              timestamp: Date.now(),
            }));
            break;
          }

          case "group:delete": {
            await conversationGroupRepo.delete(msg.groupId);
            ws.send(JSON.stringify({ type: "group:deleted", groupId: msg.groupId, timestamp: Date.now() }));
            break;
          }

          case "group:list": {
            const groups = await conversationGroupRepo.listByWorkspace(msg.workspaceId ?? DEFAULT_WORKSPACE);
            ws.send(JSON.stringify({
              type: "group:list:results",
              groups: groups.map(g => ({ id: g.id, workspaceId: g.workspaceId, name: g.name, description: g.description, ownerId: g.ownerId, conversationIds: g.items?.map(i => i.conversationId) ?? [], createdAt: g.createdAt.getTime(), updatedAt: g.updatedAt.getTime() })),
              timestamp: Date.now(),
            }));
            break;
          }

          case "group:addConversation": {
            await conversationGroupRepo.addConversation(msg.groupId, msg.conversationId);
            ws.send(JSON.stringify({ type: "group:updated", groupId: msg.groupId, conversationId: msg.conversationId, timestamp: Date.now() }));
            break;
          }

          case "group:removeConversation": {
            await conversationGroupRepo.removeConversation(msg.groupId, msg.conversationId);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "group:updated", groupId: msg.groupId, conversationId: msg.conversationId, timestamp: Date.now() }));
            }
            break;
          }

          // ═══ MCP Server Management ═══
          case "mcp:list": {
            try {
              const { mcpRepo } = await import("../db/repositories/mcp");
              const servers = await mcpRepo.listByUser(userId);
              const { mcpManager } = await import("../mcp/manager");
              const infos = servers.map(s => ({
                id: s.id, name: s.name, protocol: s.protocol, command: s.command ?? undefined,
                url: s.url ?? undefined,
                status: mcpManager.getStatus(s.id),
                tools: mcpManager.listServerTools().find(t => t.serverId === s.id)?.tools ?? [],
                lastSeen: s.lastSeen?.getTime(),
              }));
              ws.send(JSON.stringify({ type: "mcp:list:results", servers: infos, timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_ERROR", `Failed to list MCP servers: ${err}`); }
            break;
          }

          case "mcp:add": {
            try {
              const { mcpRepo } = await import("../db/repositories/mcp");
              const server = await mcpRepo.create({
                userId, name: msg.server.name, protocol: msg.server.protocol,
                command: msg.server.command, url: msg.server.url,
              });
              ws.send(JSON.stringify({ type: "mcp:added", server: { id: server.id, name: server.name, protocol: server.protocol, command: server.command ?? undefined, url: server.url ?? undefined, status: "disconnected", tools: [] }, timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_ERROR", `Failed to add MCP server: ${err}`); }
            break;
          }

          case "mcp:remove": {
            try {
              const { mcpManager } = await import("../mcp/manager");
              await mcpManager.removeServer(msg.serverId);
              ws.send(JSON.stringify({ type: "mcp:removed", serverId: msg.serverId, timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_ERROR", `Failed to remove MCP server: ${err}`); }
            break;
          }

          case "mcp:connect": {
            try {
              const { mcpManager } = await import("../mcp/manager");
              const { toolNames } = await mcpManager.connectServer(msg.serverId);
              ws.send(JSON.stringify({ type: "mcp:connected", serverId: msg.serverId, toolNames, timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_CONNECT", `Failed to connect: ${err}`); }
            break;
          }

          case "mcp:disconnect": {
            try {
              const { mcpManager } = await import("../mcp/manager");
              await mcpManager.disconnectServer(msg.serverId);
              ws.send(JSON.stringify({ type: "mcp:disconnected", serverId: msg.serverId, timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_ERROR", `Failed to disconnect: ${err}`); }
            break;
          }

          case "mcp:tools": {
            try {
              const { mcpManager } = await import("../mcp/manager");
              const serverTools = mcpManager.listServerTools().find(s => s.serverId === msg.serverId);
              ws.send(JSON.stringify({ type: "mcp:tools:results", serverId: msg.serverId, tools: serverTools?.tools.map(t => ({ name: t, description: "" })) ?? [], timestamp: Date.now() }));
            } catch (err) { sendError(ws, "MCP_ERROR", `Failed to list tools: ${err}`); }
            break;
          }

          // ═══ Agent Coordination (Phase 1) ═══
          case "agent:assign": {
            const targetConvId = msg.conversationId || currentRoom;
            if (!targetConvId) { sendError(ws, "NO_CONVERSATION", "No conversation selected"); break; }
            if (!await checkConversationAccess(ws, targetConvId, userId)) break;
            const conv = await conversationRepo.getById(targetConvId);
            const convAgents = await conversationAgentRepo.listByConversation(targetConvId);
            const participants = conv ? getParticipants(conv) : [];
            const enabledAgentNames = getEffectiveEnabledAgentNames(participants, conv?.type ?? "group", convAgents);
            const targetAgents = selectEnabledAgentsForTask([msg.agentId], enabledAgentNames);
            const userMsg = {
              id: msg.clientMsgId || crypto.randomUUID(),
              conversationId: targetConvId,
              type: "user_message",
              sender: "user",
              content: msg.content,
              mentions: targetAgents,
              timestamp: Date.now(),
            };
            await messageRepo.create(userMsg);
            broadcast(targetConvId, { type: "message:created", message: userMsg });
            if (!subscribedRooms.has(targetConvId)) {
              joinRoom(targetConvId, ws);
              subscribedRooms.add(targetConvId);
            }
            currentRoom = targetConvId;
            for (const agentId of targetAgents) {
              broadcast(targetConvId, { type: "agent:typing", conversationId: targetConvId, agentId, agentName: agentId, isTyping: true });
            }
            try {
              const queue = getQueue();
              queue.enqueue({ workspaceId: "default", conversationId: targetConvId, userId: "system", task: msg.content, mentions: targetAgents, broadcast: (event) => {
                broadcast(targetConvId, event);
              }});
            } catch (err) { sendError(ws, "AGENT_ERROR", `Failed to assign agent: ${err}`); }
            break;
          }

          case "agent:cancel": {
            const targetConvId = msg.conversationId || currentRoom;
            if (!targetConvId) { sendError(ws, "NO_CONVERSATION", "No conversation selected"); break; }
            try {
              broadcast(targetConvId, { type: "agent:typing", conversationId: targetConvId, agentId: msg.agentId, agentName: msg.agentId, isTyping: false });
              const queue = getQueue() as unknown as Record<string, (...args: unknown[]) => void>;
              if (queue && typeof queue.cancel === "function") {
                queue.cancel(targetConvId);
              }
            } catch (err) { sendError(ws, "AGENT_ERROR", `Failed to cancel agent: ${err}`); }
            break;
          }

          case "artifact:update": {
            const targetConvId = msg.conversationId || currentRoom;
            if (!targetConvId) { sendError(ws, "NO_CONVERSATION", "No conversation selected"); break; }
            const artifact = {
              id: msg.artifactId,
              jobId: targetConvId,
              type: "code",
              content: msg.content,
              createdAt: Date.now(),
              version: (Date.now() % 100000),
              createdBy: (ws as AuthenticatedWebSocket).userName || "user",
            };
            broadcast(targetConvId, { type: "artifact:updated", conversationId: targetConvId, artifact, timestamp: Date.now() });
            break;
          }

          case "artifact:deploy": {
            const targetConvId = msg.conversationId || currentRoom;
            if (!targetConvId) { sendError(ws, "NO_CONVERSATION", "No conversation selected"); break; }
            const requestedDeployId = typeof msg.deployId === "string" && /^[a-zA-Z0-9_.-]+$/.test(msg.deployId)
              ? msg.deployId
              : "";
            const deployId = requestedDeployId || msg.artifactId + "-" + Date.now();
            const rawConfig = (msg.config && typeof msg.config === "object" ? msg.config : {}) as Record<string, unknown>;
            await runDeployRequest({
              conversationId: targetConvId,
              ws,
              providerId: msg.providerId,
              deployId,
              rawConfig,
              userId,
              artifacts: extractDeployFilesFromConfig(rawConfig),
              artifactId: msg.artifactId,
              allowPlaceholder: true,
            });
            break;
          }

          case "conversation:mode": {
            const targetConvId = msg.conversationId || currentRoom;
            if (!targetConvId) { sendError(ws, "NO_CONVERSATION", "No conversation selected"); break; }
            broadcast(targetConvId, {
              type: "conversation:updated",
              conversation: { id: targetConvId, updatedAt: Date.now() },
            });
            break;
          }

          default:
            break;
        }
      } catch (err) {
        logger.error("WS handler error", err as Error, 'WebSocket');
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "error",
            code: "INTERNAL",
            message: "Internal server error",
            timestamp: Date.now(),
          }));
        }
      }
    });

    ws.on("close", () => {
      for (const room of subscribedRooms) leaveRoom(room, ws);
      subscribedRooms.clear();
      logger.info(`Client disconnected: ${userName}`, 'WebSocket');
    });
  });

  logger.info("WebSocket server ready at /api/ws", 'WebSocket');
  return wss;
}
