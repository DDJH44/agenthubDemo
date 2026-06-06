import type { Message } from "./conversation";
import type { PlanNode, JobStats, Artifact, WorkflowReferencePayload } from "./job";

export interface AgentExecutionContextSummary {
  goal: string;
  confirmed: string[];
  constraints: string[];
  references: string[];
  openQuestions: string[];
  sourceMessageCount: number;
  generatedAt?: number;
}

export interface AgentExecutionRequest {
  mode: "execute";
  task?: string;
  contextSummary?: AgentExecutionContextSummary;
}

export interface OrchestratorEvent {
  type: "task:created" | "agent_update" | "stream:chunk" | "orchestrator:complete" | "agent:error";
  from?: string; agentId?: string; content?: string; payload?: unknown; timestamp: number;
}

export type WSClientMessage =
  | { type: "conversation:subscribe"; conversationId: string }
  | { type: "conversation:unsubscribe"; conversationId: string }
  | { type: "message:send"; conversationId: string; text: string; attachments?: string[]; clientMsgId?: string; workflowRef?: WorkflowReferencePayload; agentExecution?: AgentExecutionRequest }
  | { type: "task:submit"; conversationId: string; input: string; mentions?: string[]; workflowRef?: WorkflowReferencePayload; agentExecution?: AgentExecutionRequest }
  | { type: "conversation:create"; title?: string; convType?: string; participants?: string[]; workspaceId?: string; clientId?: string }
  | { type: "conversation:pin"; conversationId: string }
  | { type: "conversation:unpin"; conversationId: string }
  | { type: "conversation:archive"; conversationId: string }
  | { type: "conversation:unarchive"; conversationId: string }
  | { type: "conversation:delete"; conversationId: string }
  | { type: "conversation:rename"; conversationId: string; title: string }
  | { type: "conversation:search"; query: string; workspaceId?: string }
  | { type: "conversation:list"; workspaceId?: string }
  | { type: "conversation:history"; conversationId: string; take?: number; before?: string }
  | { type: "job:create"; conversationId: string; title: string; description?: string }
  | { type: "job:cancel"; jobId: string }
  | { type: "agent:invoke"; conversationId: string; agentName: string; task: string }
  // Agent control
  | { type: "agent:enable"; conversationId: string; agentName: string }
  | { type: "agent:disable"; conversationId: string; agentName: string }
  | { type: "agent:add"; conversationId: string; agentNames: string[] }
  | { type: "agent:list"; conversationId: string }
  // Member management
  | { type: "member:invite"; conversationId: string; userId?: string; email?: string; invitee?: string }
  | { type: "member:remove"; conversationId: string; userId: string }
  | { type: "member:list"; conversationId: string }
  // File management
  | { type: "file:list"; conversationId: string }
  | { type: "file:delete"; fileId: string }
  // Conversation groups
  | { type: "group:create"; workspaceId: string; name: string; description?: string }
  | { type: "group:update"; groupId: string; name?: string; description?: string }
  | { type: "group:delete"; groupId: string }
  | { type: "group:list"; workspaceId: string }
  | { type: "group:addConversation"; groupId: string; conversationId: string }
  | { type: "group:removeConversation"; groupId: string; conversationId: string }
  // MCP server management
  | { type: "mcp:list" }
  | { type: "mcp:add"; server: { name: string; protocol: string; command?: string; url?: string } }
  | { type: "mcp:remove"; serverId: string }
  | { type: "mcp:connect"; serverId: string }
  | { type: "mcp:disconnect"; serverId: string }
  | { type: "mcp:tools"; serverId: string }
  // Agent coordination (Phase 1)
  | { type: "agent:assign"; conversationId: string; agentId: string; content: string }
  | { type: "agent:cancel"; conversationId: string; agentId: string }
  | { type: "artifact:update"; conversationId: string; artifactId: string; content: string }
  | { type: "artifact:deploy"; conversationId: string; artifactId: string; providerId: string; deployId?: string; config?: Record<string, unknown> }
  | { type: "conversation:mode"; conversationId: string; mode: "single" | "group" };

export type WSServerMessage =
  | { type: "connected"; clientId: string; userId?: string; userName?: string }
  | { type: "task:created"; jobId: string; conversationId?: string }
  | { type: "message:created"; message: Message }
  | { type: "conversation:updated"; conversation: ConversationUpdate }
  | { type: "conversation:created"; conversation: ConversationListItem; clientId?: string }
  | { type: "conversation:pinned"; conversationId: string }
  | { type: "conversation:unpinned"; conversationId: string }
  | { type: "conversation:archived"; conversationId: string }
  | { type: "conversation:unarchived"; conversationId: string }
  | { type: "conversation:deleted"; conversationId: string }
  | { type: "conversation:search:results"; conversations: ConversationListItem[] }
  | { type: "conversation:list:results"; conversations: ConversationListItem[] }
  | { type: "conversation:history"; conversationId: string; messages: Array<{ id: string; conversationId: string; type: string; sender: string; senderId?: string; content: string; payload?: Record<string, unknown>; mentions: string[]; timestamp: number }> }
  | { type: "agent:stream"; conversationId?: string; jobId?: string; agentId: string; chunk: string; messageId: string; sequence?: number; timestamp?: number }
  | { type: "agent:step"; conversationId?: string; jobId?: string; agentId: string; iteration: number; thought: string; action?: { tool: string; input: string }; observation?: string; isFinal: boolean }
  | { type: "plan:created"; conversationId?: string; jobId: string; plan: PlanNode[] }
  | { type: "step:started"; conversationId?: string; jobId: string; stepId: string; task: string; agentRole: string }
  | { type: "step:completed"; conversationId?: string; jobId: string; stepId: string; result: string; task?: string; toolUsed?: string; duration?: number }
  | { type: "critic:review"; conversationId?: string; jobId: string; stepId: string; valid: boolean; score: number; issues?: string; suggestion?: string }
  | { type: "retry:requested"; conversationId?: string; jobId: string; stepId: string; suggestion: string }
  | { type: "job:completed"; conversationId?: string; jobId: string; summary: string; stats: JobStats }
  | { type: "job:failed"; conversationId?: string; jobId: string; error: string }
  | { type: "artifact:created"; conversationId?: string; jobId: string; artifact: Artifact }
  | { type: "deploy:status"; conversationId?: string; jobId: string; status: string; url?: string }
  | { type: "agent:status"; conversationId?: string; agentId: string; status: string; lastOutput: string }
  | { type: "error"; code: string; message: string }
  // Agent control responses
  | { type: "agent:enabled"; conversationId: string; agentName: string }
  | { type: "agent:disabled"; conversationId: string; agentName: string }
  | { type: "agent:list:results"; conversationId: string; agents: ConversationAgentStatus[] }
  // Member responses
  | { type: "member:added"; conversationId: string; userId: string; userName: string }
  | { type: "member:removed"; conversationId: string; userId: string }
  | { type: "member:list:results"; conversationId: string; members: MemberInfo[] }
  // File responses
  | { type: "file:uploaded"; conversationId: string; file: FileInfo }
  | { type: "file:deleted"; fileId: string }
  | { type: "file:list:results"; conversationId: string; files: FileInfo[] }
  // MCP server management
  | { type: "mcp:list:results"; servers: McpServerInfo[] }
  | { type: "mcp:added"; server: McpServerInfo }
  | { type: "mcp:removed"; serverId: string }
  | { type: "mcp:connected"; serverId: string; toolNames: string[] }
  | { type: "mcp:disconnected"; serverId: string }
  | { type: "mcp:status:changed"; serverId: string; status: string; error?: string }
  | { type: "mcp:tools:results"; serverId: string; tools: Array<{ name: string; description: string }> }
  // Group responses
  | { type: "group:created"; group: ConversationGroupInfo }
  | { type: "group:updated"; group: ConversationGroupInfo }
  | { type: "group:deleted"; groupId: string }
  | { type: "group:list:results"; groups: ConversationGroupInfo[] }
  // Agent analysis/assignment
  | { type: "agent:analysis"; conversationId?: string; agentId: string; agentName: string; content: string; timestamp?: number }
  | { type: "task:assigned"; conversationId?: string; jobId?: string; targetAgent: string; task: string; timestamp?: number }
  | { type: "agent:analysis:done"; conversationId?: string; timestamp?: number }
  | { type: "conversation:renamed"; conversationId: string; title: string }
  // Agent coordination (Phase 1)
  | { type: "agent:message"; conversationId: string; agentId: string; agentName: string; agentRole: string; content: string; artifacts?: Artifact[]; timestamp: number }
  | { type: "agent:broadcast"; conversationId: string; fromAgentId: string; fromAgentName: string; toAgentIds?: string[]; content: string; context?: { relatedStepId?: string; parentMessageId?: string }; timestamp: number }
  | { type: "agent:typing"; conversationId: string; agentId: string; agentName: string; isTyping: boolean }
  | { type: "agent:joined"; conversationId: string; agentId: string; agentName: string; agentRole: string }
  | { type: "agent:left"; conversationId: string; agentId: string }
  | { type: "artifact:updated"; conversationId: string; artifact: Artifact }
  | { type: "artifact:version"; conversationId: string; artifactId: string; versions: Array<{ version: number; content: string; createdBy: string; createdAt: number; changeSummary?: string }> }
  | { type: "deploy:progress"; conversationId?: string; deployId: string; status: string; progress: number; providerId: string; logs: string[] }
  | { type: "deploy:completed"; conversationId?: string; deployId: string; url: string; providerId: string; verified?: boolean; verificationStatus?: number }
  | { type: "deploy:failed"; conversationId?: string; deployId: string; error: string; providerId: string };

export interface McpServerInfo {
  id: string; name: string; protocol: string; command?: string; url?: string;
  status: string; tools: string[]; lastSeen?: number;
}

export interface ConversationUpdate {
  id: string;
  title?: string;
  status?: string;
  pinned?: boolean;
  pinnedAt?: number | null;
  lastMessage?: string;
  lastMessageAt?: number | null;
  updatedAt?: number;
}

export interface ConversationListItem {
  id: string;
  workspaceId: string;
  title: string;
  type: string;
  status: string;
  pinned: boolean;
  pinnedAt: number | null;
  participants: string;
  lastMessage: string | null;
  lastMessageAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationAgentStatus {
  agentName: string;
  enabled: boolean;
  addedAt: number;
}

export interface MemberInfo {
  userId: string;
  userName: string;
  role: string;
  joinedAt: number;
}

export interface FileInfo {
  id: string;
  conversationId: string;
  uploaderId: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: number;
}

export interface ConversationGroupInfo {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  ownerId: string;
  conversationIds: string[];
  createdAt: number;
  updatedAt: number;
}
