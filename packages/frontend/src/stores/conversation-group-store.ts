import { create } from "zustand";
import type { ConversationGroupInfo } from "@agenthub/shared";

interface ConversationGroupStore {
  groups: ConversationGroupInfo[];

  setGroups: (groups: ConversationGroupInfo[]) => void;
  addGroup: (group: ConversationGroupInfo) => void;
  updateGroup: (group: ConversationGroupInfo) => void;
  removeGroup: (groupId: string) => void;
}

export const useConversationGroupStore = create<ConversationGroupStore>((set) => ({
  groups: [],

  setGroups(groups) { set({ groups }); },
  addGroup(group) { set((state) => ({ groups: [group, ...state.groups] })); },
  updateGroup(group) {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === group.id ? group : g)),
    }));
  },
  removeGroup(groupId) {
    set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) }));
  },
}));
