"use client";

import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import { useConversationAgentStore } from "@/stores/conversation-agent-store";
import { useFileStore } from "@/stores/file-store";
import { useConversationGroupStore } from "@/stores/conversation-group-store";
import { useMcpStore } from "@/stores/mcp-store";
import { useTaskTreeStore } from "@/stores/task-tree-store";

const _clientIdToServerId = new Map<string, string>();

function persistClientIdMap() {
  try {
    const entries = Array.from(_clientIdToServerId.entries());
    localStorage.setItem("agenthub-client-id-map", JSON.stringify(entries));
  } catch {}
}

function restoreClientIdMap() {
  try {
    const raw = localStorage.getItem("agenthub-client-id-map");
    if (raw) {
      const entries: Array<[string, string]> = JSON.parse(raw);
      for (const [k, v] of entries) _clientIdToServerId.set(k, v);
    }
  } catch {}
}

restoreClientIdMap();
import { createAgentSocket } from "@/lib/ws-client";
import type { WSServerMessage, Conversation, WSClientMessage, Artifact } from "@agenthub/shared";

function parseParticipants(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function wsConvToStoreConv(c: {
  id: string; workspaceId: string; title: string; type: string;
  status: string; pinned: boolean; pinnedAt: number | null;
  participants: unknown; lastMessage: string | null;
  lastMessageAt: number | null; createdAt: number; updatedAt: number;
}): Conversation {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    title: c.title,
    type: c.type as Conversation["type"],
    status: c.status as Conversation["status"],
    pinned: c.pinned,
    pinnedAt: c.pinnedAt,
    participants: parseParticipants(c.participants),
    lastMessage: c.lastMessage ?? undefined,
    lastMessageAt: c.lastMessageAt ?? undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function useWebSocket(serverUrl?: string, enabled = true) {
  const socketRef = useRef<ReturnType<typeof createAgentSocket> | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!enabled) return;

    const token = useAuthStore.getState().token;
    if (!token) return; // Don't connect without a token

    function connect() {
      const socket = createAgentSocket(serverUrl, token!);
      socketRef.current = socket;

      // Wait for auth to complete before sending messages
      socket.onReady(() => {
        useChatStore.getState().setConnected(true);
        useChatStore.getState().setError(null);
        reconnectAttempts.current = 0;
        socket.send({ type: "conversation:list" } as WSClientMessage);
      });

      socket.ws.addEventListener("close", (event) => {
        useChatStore.getState().setConnected(false);
        // Don't reconnect on auth failure
        if (event.code === 4001) return;
        // Exponential backoff reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 16000);
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(connect, delay);
        }
      });
      socket.ws.addEventListener("error", () => {
        useChatStore.getState().setConnected(false);
      });
    }

    connect();

    socketRef.current?.onEvent((msg: WSServerMessage) => {
      switch (msg.type) {
        case "error": {
          const errMsg = (msg as { code: string; message: string }).message || "Unknown error";
          console.warn("[WS Error]", (msg as { code: string }).code, errMsg);
          useChatStore.getState().setError(errMsg);
          // 如果是 NOT_FOUND，可能是本地临时会话还没被服务器确认
          // pendingMessage 机制会在服务器确认后自动重发
          break;
        }
        case "connected": {
          useChatStore.getState().setError(null);
          break;
        }
        case "task:created": {
          useChatStore.getState().setStreaming(true);
          break;
        }
        case "agent:status": {
          useChatStore.getState().updateAgentState(
            msg.agentId || "system",
            { status: "acting" as const, output: String(msg.lastOutput) }
          );
          break;
        }
        case "plan:created": {
          useChatStore.getState().addPlan(msg.plan.map((p) => ({ id: p.id, task: p.task })));
          useWorkspaceStore.getState().setPlan(msg.plan);
          useTaskTreeStore.getState().buildFromPlan(msg.plan);
          break;
        }
        case "agent:stream": {
          useChatStore.getState().appendStreamChunk(msg.chunk);
          break;
        }
        case "agent:analysis": {
          useChatStore.getState().addAnalysisResult({
            agentId: msg.agentId ?? "system",
            agentName: msg.agentName ?? "PM Agent",
            content: msg.content ?? "",
          });
          break;
        }
        case "task:assigned": {
          useChatStore.getState().addTaskAssignment({
            targetAgent: msg.targetAgent ?? "",
            task: msg.task ?? "",
            status: "pending",
          });
          break;
        }
        case "agent:analysis:done": {
          useChatStore.getState().setIsAnalyzing(false);
          break;
        }
        case "agent:step": {
          useChatStore.getState().setStreaming(true);
          useChatStore.getState().addAgentStep({
            iteration: msg.iteration,
            thought: msg.thought,
            action: msg.action,
            observation: msg.observation,
            isFinal: msg.isFinal,
            timestamp: Date.now(),
          });
          break;
        }
        case "step:started": {
          useWorkspaceStore.getState().updateNodeStatus(msg.stepId, "running");
          useChatStore.getState().updateStepById(msg.stepId, "running");
          useTaskTreeStore.getState().updateStepStatus(msg.stepId, "running");
          break;
        }
        case "step:completed": {
          useWorkspaceStore.getState().updateNodeStatus(msg.stepId, "done");
          useWorkspaceStore.getState().addStepResult({ id: msg.stepId, task: msg.task || msg.stepId, result: msg.result });
          useChatStore.getState().updateStepById(msg.stepId, "done", msg.result);
          useTaskTreeStore.getState().updateStepStatus(msg.stepId, "done");
          useTaskTreeStore.getState().addStepResult({ id: msg.stepId, task: msg.task || msg.stepId, result: msg.result });
          break;
        }
        case "job:completed": {
          useChatStore.getState().setTaskSummary(msg.summary);
          break;
        }
        case "artifact:created": {
          useWorkspaceStore.getState().addArtifact(msg.artifact);
          useTaskTreeStore.getState().addArtifact(msg.artifact);
          break;
        }
        case "deploy:status": {
          useWorkspaceStore.getState().setDeployStatus(msg.status, msg.url);
          break;
        }
        case "message:created": {
          useChatStore.getState().addMessage(msg.message.conversationId, msg.message);
          break;
        }
        case "conversation:created": {
          const conv = wsConvToStoreConv(msg.conversation as Parameters<typeof wsConvToStoreConv>[0]);
          const clientId = msg.clientId;
          if (clientId) { _clientIdToServerId.set(clientId, conv.id); persistClientIdMap(); }
          const store = useChatStore.getState();
          const isClientActive = clientId && store.activeConversationId === clientId;
          const oldMessages = clientId ? store.messages[clientId] : undefined;

          useChatStore.setState((s) => {
            const nextConvs = clientId
              ? [...s.conversations.filter((c) => c.id !== clientId), conv]
              : [...s.conversations, conv];
            const nextMessages = { ...s.messages };
            if (clientId) {
              delete nextMessages[clientId];
              if (oldMessages?.length) nextMessages[conv.id] = oldMessages;
            }
            if (!nextMessages[conv.id]) nextMessages[conv.id] = [];
            const nextActiveId = isClientActive ? conv.id : (s.activeConversationId || conv.id);
            return {
              conversations: nextConvs,
              activeConversationId: nextActiveId,
              messages: nextMessages,
              agentStates: {}, planSteps: [], steps: [], streamBuffer: "", isStreaming: false, taskSummary: "", agentSteps: [], resources: [], conversationDetail: null, taskFlow: [], sessionAgentStatuses: [], taskProgress: null,
            };
          });

          useWorkspaceStore.getState().switchConversation(isClientActive ? conv.id : null);
          useTaskTreeStore.getState().switchConversation(isClientActive ? conv.id : null);

          // ID 迁移后订阅服务端会话房间，确保收到流式事件
          if (isClientActive) {
            socketRef.current?.send({ type: "conversation:subscribe", conversationId: conv.id } as WSClientMessage);
          }

          const pendingMsg = useChatStore.getState().pendingMessage;
          if (pendingMsg) {
            useChatStore.getState().setPendingMessage(null);
            socketRef.current?.send({ type: "message:send", conversationId: conv.id, text: pendingMsg } as WSClientMessage);
          }
          break;
        }
        case "conversation:list:results": {
          const store = useChatStore.getState();
          const newConversations = msg.conversations.map(wsConvToStoreConv);
          const serverIds = new Set(newConversations.map(c => c.id));
          const replacedClientIds = new Set<string>();
          for (const [clientId, serverId] of _clientIdToServerId) {
            if (serverIds.has(serverId)) replacedClientIds.add(clientId);
          }
          const serverSignatures = new Set(newConversations.map(c => `${c.title}::${c.type}::${Math.floor(c.createdAt / 60000)}`));
          const merged = [...newConversations];
          for (const conv of store.conversations) {
            if (!serverIds.has(conv.id) && !replacedClientIds.has(conv.id)) {
              const sig = `${conv.title}::${conv.type}::${Math.floor(conv.createdAt / 60000)}`;
              if (!serverSignatures.has(sig)) {
                merged.push(conv);
              }
            }
          }
          store.setConversations(merged);
          break;
        }
        case "conversation:search:results": {
          const store = useChatStore.getState();
          if (store.conversations.length === 0) {
            store.setConversations(msg.conversations.map(wsConvToStoreConv));
          }
          break;
        }
        case "conversation:pinned": {
          useChatStore.getState().pinConversation(msg.conversationId);
          break;
        }
        case "conversation:unpinned": {
          useChatStore.getState().unpinConversation(msg.conversationId);
          break;
        }
        case "conversation:archived": {
          useChatStore.getState().archiveConversation(msg.conversationId);
          break;
        }
        case "conversation:unarchived": {
          useChatStore.getState().unarchiveConversation(msg.conversationId);
          break;
        }
        case "conversation:deleted": {
          useChatStore.getState().removeConversation(msg.conversationId);
          break;
        }
        case "conversation:updated": {
          useChatStore.getState().updateConversation(wsConvToStoreConv(msg.conversation as Parameters<typeof wsConvToStoreConv>[0]));
          break;
        }
        case "conversation:renamed": {
          useChatStore.getState().updateConversation({
            id: msg.conversationId,
            title: msg.title,
          } as Conversation);
          break;
        }
        case "conversation:history": {
          const historyMessages = msg.messages || [];
          const convId = msg.conversationId;

          // Filter and map all messages in one pass, then batch update
          const validTypes = ["user_message", "agent_message", "system", "plan"];
          const parsed = historyMessages
            .filter((m: { content?: string; type?: string }) =>
              m.content !== "[AGENT_START]" && m.content !== "[AGENT_END]" &&
              !(m.type === "system" && m.content?.includes("任务已提交"))
            )
            .map((m: { id: string; conversationId?: string; type?: string; sender?: string; content?: string; mentions?: string[]; timestamp?: number }) => ({
              id: m.id,
              conversationId: m.conversationId || convId,
              type: (validTypes.includes(m.type || "") ? m.type : "system") as "user_message" | "agent_message" | "system" | "plan",
              sender: m.sender || "system",
              content: m.content || "",
              mentions: m.mentions || [],
              timestamp: m.timestamp || Date.now(),
            }));

          // Single state update for all history messages
          useChatStore.setState((state) => ({
            messages: { ...state.messages, [convId]: parsed }
          }));
          break;
        }

        // ═══ Agent Control ═══
        case "agent:enabled":
        case "agent:disabled": {
          // Refresh agent list
          socketRef.current?.send({ type: "agent:list", conversationId: msg.conversationId } as WSClientMessage);
          break;
        }
        case "agent:list:results": {
          useConversationAgentStore.getState().setAgents(msg.conversationId, msg.agents);
          break;
        }

        // ═══ Members ═══
        case "member:added":
        case "member:removed": {
          socketRef.current?.send({ type: "member:list", conversationId: msg.conversationId } as WSClientMessage);
          break;
        }
        case "member:list:results": {
          // Store in chat store for now
          break;
        }

        // ═══ Files ═══
        case "file:uploaded": {
          useFileStore.getState().addFile(msg.conversationId, msg.file);
          break;
        }
        case "file:deleted": {
          // Will be handled by conversation context
          break;
        }
        case "file:list:results": {
          useFileStore.getState().setFiles(msg.conversationId, msg.files);
          break;
        }

        // ═══ Groups ═══
        case "group:created": {
          useConversationGroupStore.getState().addGroup(msg.group);
          break;
        }
        case "group:updated": {
          useConversationGroupStore.getState().updateGroup(msg.group);
          break;
        }
        case "group:deleted": {
          useConversationGroupStore.getState().removeGroup(msg.groupId);
          break;
        }
        case "group:list:results": {
          useConversationGroupStore.getState().setGroups(msg.groups);
          break;
        }

        // ═══ MCP ═══
        case "mcp:list:results": {
          useMcpStore.getState().setServers(msg.servers);
          break;
        }
        case "mcp:added": {
          useMcpStore.getState().addServer(msg.server);
          break;
        }
        case "mcp:removed": {
          useMcpStore.getState().removeServer(msg.serverId);
          break;
        }
        case "mcp:connected": {
          useMcpStore.getState().updateServerStatus(msg.serverId, "connected", msg.toolNames);
          break;
        }
        case "mcp:disconnected": {
          useMcpStore.getState().updateServerStatus(msg.serverId, "disconnected");
          break;
        }
        case "mcp:tools:results": {
          useMcpStore.getState().updateServerStatus(msg.serverId, "connected", msg.tools.map((t: { name: string }) => t.name));
          break;
        }

        // ═══ Phase 1: Agent Coordination ═══
        case "agent:message": {
          useChatStore.getState().addAgentMessage(msg.conversationId, {
            agentId: msg.agentId,
            agentName: msg.agentName,
            agentRole: msg.agentRole,
            content: msg.content,
            timestamp: msg.timestamp,
          });
          if (msg.artifacts?.length) {
            for (const artifact of msg.artifacts) {
              useWorkspaceStore.getState().addArtifact(artifact);
            }
          }
          break;
        }
        case "agent:broadcast": {
          useChatStore.getState().addAgentMessage(msg.conversationId, {
            agentId: msg.fromAgentId,
            agentName: msg.fromAgentName,
            agentRole: "broadcast",
            content: msg.content,
            timestamp: msg.timestamp,
          });
          break;
        }
        case "agent:typing": {
          useChatStore.getState().setAgentTyping(msg.conversationId, msg.agentId, msg.isTyping);
          break;
        }
        case "agent:joined":
        case "agent:left": {
          break;
        }
        case "artifact:updated": {
          useWorkspaceStore.getState().addArtifact(msg.artifact);
          useTaskTreeStore.getState().addArtifact(msg.artifact);
          break;
        }
        case "artifact:version": {
          break;
        }
        case "deploy:progress":
        case "deploy:completed":
        case "deploy:failed": {
          const status = msg.type === "deploy:progress" ? "deploying" : msg.type === "deploy:completed" ? "success" : "failed";
          const url = "url" in msg ? msg.url : undefined;
          const conversationId = useChatStore.getState().activeConversationId;
          useWorkspaceStore.getState().setDeployStatus(status, url, {
            progress: msg.type === "deploy:progress" ? msg.progress : 100,
            providerId: msg.providerId,
            logs: msg.type === "deploy:progress" ? msg.logs : [msg.type === "deploy:completed" ? `部署完成：${msg.url}` : msg.error],
            error: msg.type === "deploy:failed" ? msg.error : null,
          });

          if (conversationId && msg.type === "deploy:completed") {
            const artifact: Artifact = {
              id: `deploy-result-${msg.deployId}`,
              jobId: msg.deployId,
              type: "deploy_url",
              filename: `${msg.providerId}-deployment.url`,
              content: msg.url,
              version: 1,
              createdBy: "Open Code",
              createdAt: Date.now(),
              metadata: {
                providerId: msg.providerId,
                deployId: msg.deployId,
                status: "success",
                changeSummary: `部署成功：${msg.providerId}`,
              },
            };
            useWorkspaceStore.getState().addArtifact(artifact);
            useChatStore.getState().addMessage(conversationId, {
              id: `deploy-card-${msg.deployId}-completed`,
              conversationId,
              type: "deploy_card",
              sender: "worker",
              senderId: "open-code",
              content: `部署完成。${msg.providerId} 已返回访问链接。`,
              payload: {
                status: "done",
                platform: msg.providerId,
                platformLabel: msg.providerId,
                url: msg.url,
                deployId: msg.deployId,
                artifactId: artifact.id,
              },
              timestamp: Date.now(),
            });
          }

          if (conversationId && msg.type === "deploy:failed") {
            useChatStore.getState().addMessage(conversationId, {
              id: `deploy-card-${msg.deployId}-failed`,
              conversationId,
              type: "deploy_card",
              sender: "worker",
              senderId: "open-code",
              content: `部署失败。${msg.providerId} 返回错误，可交给 Codex 修复后重试。`,
              payload: {
                status: "failed",
                platform: msg.providerId,
                platformLabel: msg.providerId,
                error: msg.error,
                deployId: msg.deployId,
              },
              timestamp: Date.now(),
            });
          }
          break;
        }
      }
    });

    // Listen for conversation selection events
    const handleConversationSelect = (event: Event) => {
      const customEvent = event as CustomEvent;
      const conversationId = customEvent.detail?.conversationId;
      if (conversationId) {
        socketRef.current?.send({ type: "conversation:subscribe", conversationId } as WSClientMessage);
        socketRef.current?.send({ type: "conversation:history", conversationId } as WSClientMessage);
        useTaskTreeStore.getState().switchConversation(conversationId);
      }
    };
    window.addEventListener('conversation:select', handleConversationSelect);

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      window.removeEventListener('conversation:select', handleConversationSelect);
      socketRef.current?.close();
    };
  }, [serverUrl, enabled]);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    socketRef.current?.send({ type: "message:send", conversationId, text } as WSClientMessage);
  }, []);

  const pinConversation = useCallback((id: string) => {
    socketRef.current?.send({ type: "conversation:pin", conversationId: id } as WSClientMessage);
  }, []);

  const unpinConversation = useCallback((id: string) => {
    socketRef.current?.send({ type: "conversation:unpin", conversationId: id } as WSClientMessage);
  }, []);

  const archiveConversation = useCallback((id: string) => {
    socketRef.current?.send({ type: "conversation:archive", conversationId: id } as WSClientMessage);
  }, []);

  const unarchiveConversation = useCallback((id: string) => {
    socketRef.current?.send({ type: "conversation:unarchive", conversationId: id } as WSClientMessage);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    socketRef.current?.send({ type: "conversation:delete", conversationId: id } as WSClientMessage);
  }, []);

  const searchConversations = useCallback((query: string) => {
    if (query.trim()) {
      socketRef.current?.send({ type: "conversation:search", query } as WSClientMessage);
    } else {
      socketRef.current?.send({ type: "conversation:list" } as WSClientMessage);
    }
  }, []);

  const subscribeToConversation = useCallback((conversationId: string) => {
    socketRef.current?.send({ type: "conversation:subscribe", conversationId } as WSClientMessage);
    socketRef.current?.send({ type: "conversation:history", conversationId } as WSClientMessage);
  }, []);

  const assignAgent = useCallback((conversationId: string, agentId: string, content: string) => {
    socketRef.current?.send({ type: "agent:assign", conversationId, agentId, content } as WSClientMessage);
  }, []);

  const cancelAgent = useCallback((conversationId: string, agentId: string) => {
    socketRef.current?.send({ type: "agent:cancel", conversationId, agentId } as WSClientMessage);
  }, []);

  const updateArtifact = useCallback((conversationId: string, artifactId: string, content: string) => {
    socketRef.current?.send({ type: "artifact:update", conversationId, artifactId, content } as WSClientMessage);
  }, []);

  const deployArtifact = useCallback((conversationId: string, artifactId: string, providerId: string, config?: Record<string, unknown>) => {
    socketRef.current?.send({ type: "artifact:deploy", conversationId, artifactId, providerId, config } as WSClientMessage);
  }, []);

  const setConversationMode = useCallback((conversationId: string, mode: "single" | "group") => {
    socketRef.current?.send({ type: "conversation:mode", conversationId, mode } as WSClientMessage);
  }, []);

  return {
    sendMessage,
    send: (msg: WSClientMessage) => { socketRef.current?.send(msg); },
    pinConversation,
    unpinConversation,
    archiveConversation,
    unarchiveConversation,
    deleteConversation,
    searchConversations,
    subscribeToConversation,
    assignAgent,
    cancelAgent,
    updateArtifact,
    deployArtifact,
    setConversationMode,
  };
}
