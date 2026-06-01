import { create } from "zustand";
import type { ConversationAgentStatus } from "@agenthub/shared";

interface ConversationAgentStore {
  agentsByConversation: Record<string, ConversationAgentStatus[]>;
  loading: boolean;

  setAgents: (conversationId: string, agents: ConversationAgentStatus[]) => void;
  toggleAgent: (conversationId: string, agentName: string, enabled: boolean) => void;
}

export const useConversationAgentStore = create<ConversationAgentStore>((set) => ({
  agentsByConversation: {},
  loading: false,

  setAgents(conversationId, agents) {
    set((state) => ({
      agentsByConversation: { ...state.agentsByConversation, [conversationId]: agents },
    }));
  },

  toggleAgent(conversationId, agentName, enabled) {
    set((state) => {
      const existing = state.agentsByConversation[conversationId] ?? [];
      const updated = existing.map((a) =>
        a.agentName === agentName ? { ...a, enabled } : a
      );
      return { agentsByConversation: { ...state.agentsByConversation, [conversationId]: updated } };
    });
  },
}));
