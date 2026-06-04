import type { Server as HTTPServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IAdapter } from "@agenthub/adapter";
import type { AgentRole, ConversationListItem, PlanNode, WorkflowNodeType, WorkflowReferencePayload } from "@agenthub/shared";
import { parseMentions } from "@agenthub/shared";
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
  selectEnabledAgentsForTask,
} from "../agents/conversation-routing";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { logger } from "../utils/logger";
import { prisma } from "../db/index";
import { deployManager } from "../deploy/index";
import type { DeployConfig } from "../deploy/index";
import { deploymentTargetRepo } from "../db/repositories/deployment-target";
import { decryptSecret } from "../deploy/credentials";
import { validateConversationId, validateWorkspaceId, validateMessageText, validateConversationTitle, validateConversationType, validateParticipants, validateSearchQuery, validateString } from "../utils/validators";
import { validateSession } from "../auth/session";
import { isArtifactGenerationTask, isSimpleChat } from "../utils/task-classifier";

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
                    data: { conversationId: conv.id, agentName, enabled: true },
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

            const isDirectConv = convType === "direct";
            const simpleChat = !workflowRef && isSimpleChat(text);
            const artifactTask = isArtifactGenerationTask(text);

            const convAgents = await conversationAgentRepo.listByConversation(conversationId);
            const enabledAgentNames = getEffectiveEnabledAgentNames(convParticipants, convType, convAgents);
            const hasEnabledAgents = enabledAgentNames.length > 0;

            if (simpleChat || ((!hasEnabledAgents || isDirectConv) && !artifactTask)) {
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
                    .filter(m => m.content !== "[AGENT_START]" && m.content !== "[AGENT_END]")
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

            // Agents are enabled - proceed with orchestrator
            const { agents, cleanText, isAllAgents } = parseMentions(text);

            let matchedAgents = agents;
            let matchSummary = "";
            if (workflowRef) {
              matchedAgents = getWorkflowAgentMentions(workflowRef);
              matchSummary = `引用工作流「${workflowRef.name}」 · ${workflowRef.plan.length} 个节点`;
            } else if (isAllAgents) {
              matchedAgents = AGENT_NAMES;
              matchSummary = "已启用全部智能体";
            } else if (agents.length === 0) {
              const matched = matchByKeywords(cleanText || text);
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

            const userMsg = await messageRepo.createAndUpdateConv({
              conversationId, type: "user_message", sender: userName, senderId: userId, content: text, mentions: matchedAgents,
              id: clientMsgId,
              payload: workflowRef ? { workflowRef: compactWorkflowReference(workflowRef) } : undefined,
            });

            broadcast(conversationId, {
              type: "message:created",
              message: {
                id: userMsg.id, conversationId: userMsg.conversationId,
                type: userMsg.type, sender: userMsg.sender, senderId: userId, content: userMsg.content,
                mentions: matchedAgents,
                payload: workflowRef ? { workflowRef: compactWorkflowReference(workflowRef) } : undefined,
                timestamp: userMsg.timestamp.getTime(),
              },
            });

            const queueTask = workflowRef?.task || cleanText || text;
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
            await conversationAgentRepo.setEnabled(msg.conversationId, msg.agentName, true);
            // Insert start marker
            await messageRepo.createAndUpdateConv({
              conversationId: msg.conversationId, type: "system", sender: "system", content: "[AGENT_START]",
            });
            broadcast(msg.conversationId, { type: "agent:enabled", conversationId: msg.conversationId, agentName: msg.agentName, timestamp: Date.now() });
            break;
          }

          case "agent:disable": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            await conversationAgentRepo.setEnabled(msg.conversationId, msg.agentName, false);
            // Insert end marker
            await messageRepo.createAndUpdateConv({
              conversationId: msg.conversationId, type: "system", sender: "system", content: "[AGENT_END]",
            });
            broadcast(msg.conversationId, { type: "agent:disabled", conversationId: msg.conversationId, agentName: msg.agentName, timestamp: Date.now() });
            break;
          }

          case "agent:list": {
            if (!await checkConversationAccess(ws, msg.conversationId, userId)) break;
            const conv = await conversationRepo.getById(msg.conversationId);
            if (!conv) { sendError(ws, "NOT_FOUND", "Conversation not found"); break; }
            const agents = await conversationAgentRepo.listByConversation(msg.conversationId);
            const participants = getParticipants(conv);
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
                  enabled: entry?.enabled ?? true,
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
            const invitedUser = await userRepo.getById(msg.userId);
            if (!invitedUser) { sendError(ws, "NOT_FOUND", "User not found"); break; }
            const added = await conversationRepo.addParticipant(msg.conversationId, msg.userId);
            if (!added) { sendError(ws, "ALREADY_MEMBER", "User is already a member or conversation not found"); break; }
            broadcast(msg.conversationId, { type: "member:added", conversationId: msg.conversationId, userId: msg.userId, userName: invitedUser.name, timestamp: Date.now() });
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
              return u ? { userId: u.id, userName: u.name, role: "member", joinedAt: u.createdAt.getTime() } : null;
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
            emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress: 0, providerId: msg.providerId, logs: ["初始化部署..."], timestamp: Date.now() });
            try {
              const artifacts: Array<{ path: string; content: string }> = [];
              const rawConfig = (msg.config && typeof msg.config === "object" ? msg.config : {}) as Record<string, unknown>;
              if (msg.config && typeof msg.config === "object") {
                if (Array.isArray(rawConfig.files)) {
                  for (const f of rawConfig.files as Array<{ path?: string; content?: string }>) {
                    if (f.path && f.content) artifacts.push({ path: safeDeployPath(f.path), content: f.content });
                  }
                }
              }
              const deployConfig = await resolveDeployConfig(rawConfig, msg.providerId, targetConvId, userId);

              if (artifacts.length === 0) {
                const result = await deployManager.deploy(
                  msg.providerId, deployId,
                  [{ path: "index.html", content: "<!DOCTYPE html><html><body>AgentHub Deploy</body></html>" }],
                  deployConfig,
                  (progress, log) => {
                    emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress, providerId: msg.providerId, logs: [log], timestamp: Date.now() });
                  }
                );
                if (result.success) {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:completed", deployId, url: result.url || "", providerId: msg.providerId, verified: result.verified ?? msg.providerId === "self-hosted", verificationStatus: result.verificationStatus, timestamp: Date.now() });
                } else {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:failed", deployId, error: result.error || "部署失败", providerId: msg.providerId, timestamp: Date.now() });
                }
              } else {
                const result = await deployManager.deploy(
                  msg.providerId, deployId, artifacts,
                  deployConfig,
                  (progress, log) => {
                    emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress, providerId: msg.providerId, logs: [log], timestamp: Date.now() });
                  }
                );
                if (result.success) {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:completed", deployId, url: result.url || "", providerId: msg.providerId, verified: result.verified ?? msg.providerId === "self-hosted", verificationStatus: result.verificationStatus, timestamp: Date.now() });
                } else {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:failed", deployId, error: result.error || "部署失败", providerId: msg.providerId, timestamp: Date.now() });
                }
              }
            } catch (err) {
              emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:failed", deployId, error: String(err), providerId: msg.providerId, timestamp: Date.now() });
            }
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
