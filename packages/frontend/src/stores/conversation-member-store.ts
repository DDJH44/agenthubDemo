import { create } from "zustand";
import type { MemberInfo } from "@agenthub/shared";

interface ConversationMemberStore {
  membersByConversation: Record<string, MemberInfo[]>;

  setMembers: (conversationId: string, members: MemberInfo[]) => void;
  upsertMember: (conversationId: string, member: MemberInfo) => void;
  removeMember: (conversationId: string, userId: string) => void;
}

export const useConversationMemberStore = create<ConversationMemberStore>((set) => ({
  membersByConversation: {},

  setMembers(conversationId, members) {
    set((state) => ({
      membersByConversation: { ...state.membersByConversation, [conversationId]: members },
    }));
  },

  upsertMember(conversationId, member) {
    set((state) => {
      const existing = state.membersByConversation[conversationId] ?? [];
      const next = existing.some((item) => item.userId === member.userId)
        ? existing.map((item) => (item.userId === member.userId ? { ...item, ...member } : item))
        : [...existing, member];

      return {
        membersByConversation: { ...state.membersByConversation, [conversationId]: next },
      };
    });
  },

  removeMember(conversationId, userId) {
    set((state) => ({
      membersByConversation: {
        ...state.membersByConversation,
        [conversationId]: (state.membersByConversation[conversationId] ?? []).filter((item) => item.userId !== userId),
      },
    }));
  },
}));
