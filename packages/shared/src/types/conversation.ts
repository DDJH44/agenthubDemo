export type ConversationType = "direct" | "group" | "task_room";
export type ConversationStatus = "active" | "archived";

export interface Conversation {
  id: string; workspaceId: string; title: string; type: ConversationType;
  status: ConversationStatus; pinned: boolean; pinnedAt?: number | null;
  participants: string[]; lastMessage?: string;
  lastMessageAt?: number; createdAt: number; updatedAt: number;
  summary?: string | null; topics?: string; messageCount?: number; importance?: number;
}

export type MessageType =
  | "user_message" | "agent_message" | "agent_thinking" | "task_card"
  | "diff_card" | "preview_card" | "deploy_card" | "tool_call" | "tool_result"
  | "plan" | "critic_review" | "stream" | "system" | "error";

export interface Message {
  id: string; conversationId: string; type: MessageType; sender: string;
  senderId?: string; content: string; payload?: Record<string, unknown>;
  mentions?: string[]; timestamp: number;
}

export interface ParsedMention { agents: string[]; cleanText: string; isAllAgents: boolean; }
