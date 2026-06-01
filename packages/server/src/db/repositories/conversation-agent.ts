import { prisma } from "../index";

export const conversationAgentRepo = {
  async listByConversation(conversationId: string) {
    return prisma.conversationAgent.findMany({
      where: { conversationId },
      orderBy: { addedAt: "asc" },
    });
  },

  async setEnabled(conversationId: string, agentName: string, enabled: boolean) {
    return prisma.conversationAgent.upsert({
      where: { conversationId_agentName: { conversationId, agentName } },
      update: { enabled },
      create: { conversationId, agentName, enabled },
    });
  },

  async isEnabled(conversationId: string, agentName: string): Promise<boolean> {
    const entry = await prisma.conversationAgent.findUnique({
      where: { conversationId_agentName: { conversationId, agentName } },
    });
    return entry?.enabled ?? false;
  },

  async addAgent(conversationId: string, agentName: string, enabled = false) {
    return prisma.conversationAgent.upsert({
      where: { conversationId_agentName: { conversationId, agentName } },
      update: {},
      create: { conversationId, agentName, enabled },
    });
  },

  async removeAgent(conversationId: string, agentName: string) {
    await prisma.conversationAgent.deleteMany({ where: { conversationId, agentName } });
  },
};
