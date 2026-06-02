import type { Server as HTTPServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IAdapter } from "@agenthub/adapter";
import type { ConversationListItem } from "@agenthub/shared";
import { parseMentions } from "@agenthub/shared";
import { messageRepo } from "../db/repositories/message";
import { conversationRepo } from "../db/repositories/conversation";
import { conversationAgentRepo } from "../db/repositories/conversation-agent";
import { fileRepo } from "../db/repositories/file";
import { conversationGroupRepo } from "../db/repositories/conversation-group";
import { userRepo } from "../db/repositories/user";
import { getQueue } from "../queue/index";
import { matchByKeywords } from "../agents/matching";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { logger } from "../utils/logger";
import { prisma } from "../db/index";
import { deployManager } from "../deploy/index";
import type { DeployConfig } from "../deploy/index";
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
  const json = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

function emitToRequesterAndRoom(conversationId: string, requester: WebSocket, data: unknown) {
  broadcast(conversationId, data);
  const clients = rooms.get(conversationId);
  if (!clients?.has(requester) && requester.readyState === WebSocket.OPEN) {
    requester.send(JSON.stringify(data));
  }
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
const AGENT_NAMES = ["planner", "worker", "critic", "researcher", "refiner"];

function safeDeployPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean);
  const safeParts = normalized.filter((part) => part !== "." && part !== "..");
  return safeParts.join("/") || "index.html";
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
            if (currentRoom) leaveRoom(currentRoom, ws);
            currentRoom = msg.conversationId;
            if (currentRoom) joinRoom(currentRoom, ws);
            ws.send(JSON.stringify({ type: "agent:status", agentId: "system", status: "joined", lastOutput: currentRoom }));
            break;
          }

          case "conversation:unsubscribe": {
            if (currentRoom) { leaveRoom(currentRoom, ws); currentRoom = null; }
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

              // For group chats, create default agent entries (enabled)
              if (convType === "group" || convType === "task_room") {
                for (const agentName of AGENT_NAMES) {
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
              mentions: m.mentions ? JSON.parse(m.mentions as string) : [],
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
            if (currentRoom === conv.id) { leaveRoom(conv.id, ws); currentRoom = null; }
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

            let convType = "group";
            let agentName = "planner";
            try {
              const conv = await conversationRepo.getById(conversationId);
              if (conv) {
                convType = conv.type ?? "group";
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
            const simpleChat = isSimpleChat(text);
            const artifactTask = isArtifactGenerationTask(text);

            const convAgents = await conversationAgentRepo.listByConversation(conversationId);
            const hasEnabledAgents = convAgents.some(a => a.enabled);

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
                  ws.send(JSON.stringify({ type: "agent:stream", agentId: sender, chunk: reply, messageId: agentMsg.id }));
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
            if (isAllAgents) {
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

            // Filter to only enabled agents
            const enabledAgentNames = convAgents.filter(a => a.enabled).map(a => a.agentName);
            matchedAgents = matchedAgents.filter(a => enabledAgentNames.includes(a));
            if (matchedAgents.length === 0) {
              matchedAgents = enabledAgentNames.length > 0 ? [enabledAgentNames[0]] : ["planner"];
            }

            const userMsg = await messageRepo.createAndUpdateConv({
              conversationId, type: "user_message", sender: userName, senderId: userId, content: text, mentions: matchedAgents,
              id: clientMsgId,
            });

            broadcast(conversationId, {
              type: "message:created",
              message: {
                id: userMsg.id, conversationId: userMsg.conversationId,
                type: userMsg.type, sender: userMsg.sender, senderId: userId, content: userMsg.content,
                mentions: matchedAgents, timestamp: userMsg.timestamp.getTime(),
              },
            });

            const jobId = await queue.enqueue({
              workspaceId: DEFAULT_WORKSPACE,
              conversationId,
              userId,
              task: cleanText || text,
              mentions: matchedAgents,
              broadcast: (data) => broadcast(conversationId, data),
            });

            broadcast(conversationId, { type: "task:created", jobId, timestamp: Date.now() });

            // 通知前端各 Agent 将要执行的任务
            for (const agentName of matchedAgents) {
              broadcast(conversationId, {
                type: "task:assigned",
                targetAgent: agentName,
                task: `执行：${(cleanText || text).slice(0, 60)}`,
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
            const agents = await conversationAgentRepo.listByConversation(msg.conversationId);
            ws.send(JSON.stringify({
              type: "agent:list:results",
              conversationId: msg.conversationId,
              agents: agents.map(a => ({ agentName: a.agentName, enabled: a.enabled, addedAt: a.addedAt.getTime() })),
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
            const userIds = participants.filter((p) => !AGENT_NAMES.includes(p));
            const users = await userRepo.getByIds(userIds);
            const userMap = new Map(users.map((u) => [u.id, u]));
            const members = participants.map((pid) => {
              if (AGENT_NAMES.includes(pid)) return { userId: pid, userName: pid, role: "agent", joinedAt: 0 };
              const u = userMap.get(pid);
              return u ? { userId: u.id, userName: u.name, role: "member", joinedAt: u.createdAt.getTime() } : null;
            }).filter(Boolean);
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
            const userMsg = {
              id: msg.clientMsgId || crypto.randomUUID(),
              conversationId: targetConvId,
              type: "user_message",
              sender: "user",
              content: msg.content,
              mentions: [msg.agentId],
              timestamp: Date.now(),
            };
            await messageRepo.create(userMsg);
            broadcast(targetConvId, { type: "message:created", message: userMsg });
            joinRoom(targetConvId, ws);
            currentRoom = targetConvId;
            broadcast(targetConvId, { type: "agent:typing", conversationId: targetConvId, agentId: msg.agentId, agentName: msg.agentId, isTyping: true });
            try {
              const queue = getQueue();
              queue.enqueue({ workspaceId: "default", conversationId: targetConvId, userId: "system", task: msg.content, mentions: [msg.agentId], broadcast: (event) => {
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
            const deployId = msg.artifactId + "-" + Date.now();
            emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress: 0, providerId: msg.providerId, logs: ["初始化部署..."], timestamp: Date.now() });
            try {
              const artifacts: Array<{ path: string; content: string }> = [];
              if (msg.config && typeof msg.config === "object") {
                const config = msg.config as Record<string, unknown>;
                if (Array.isArray(config.files)) {
                  for (const f of config.files as Array<{ path?: string; content?: string }>) {
                    if (f.path && f.content) artifacts.push({ path: safeDeployPath(f.path), content: f.content });
                  }
                }
              }

              if (artifacts.length === 0) {
                const result = await deployManager.deploy(
                  msg.providerId, deployId,
                  [{ path: "index.html", content: "<!DOCTYPE html><html><body>AgentHub Deploy</body></html>" }],
                  { ...(msg.config as Record<string, unknown> || {}), projectName: targetConvId } as DeployConfig,
                  (progress, log) => {
                    emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress, providerId: msg.providerId, logs: [log], timestamp: Date.now() });
                  }
                );
                if (result.success) {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:completed", deployId, url: result.url || "", providerId: msg.providerId, timestamp: Date.now() });
                } else {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:failed", deployId, error: result.error || "部署失败", providerId: msg.providerId, timestamp: Date.now() });
                }
              } else {
                const result = await deployManager.deploy(
                  msg.providerId, deployId, artifacts,
                  { ...(msg.config as Record<string, unknown> || {}), projectName: targetConvId } as DeployConfig,
                  (progress, log) => {
                    emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:progress", deployId, status: "deploying", progress, providerId: msg.providerId, logs: [log], timestamp: Date.now() });
                  }
                );
                if (result.success) {
                  emitToRequesterAndRoom(targetConvId, ws, { type: "deploy:completed", deployId, url: result.url || "", providerId: msg.providerId, timestamp: Date.now() });
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
      if (currentRoom) leaveRoom(currentRoom, ws);
      logger.info(`Client disconnected: ${userName}`, 'WebSocket');
    });
  });

  logger.info("WebSocket server ready at /api/ws", 'WebSocket');
  return wss;
}
