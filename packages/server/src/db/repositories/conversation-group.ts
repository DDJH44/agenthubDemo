import { prisma } from "../index";

export const conversationGroupRepo = {
  async create(data: { workspaceId: string; name: string; description?: string; ownerId: string }) {
    return prisma.conversationGroup.create({ data, include: { items: true } });
  },

  async getById(id: string) {
    return prisma.conversationGroup.findUnique({ where: { id }, include: { items: true } });
  },

  async listByWorkspace(workspaceId: string) {
    return prisma.conversationGroup.findMany({
      where: { workspaceId },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    });
  },

  async update(id: string, data: { name?: string; description?: string }) {
    return prisma.conversationGroup.update({ where: { id }, data, include: { items: true } });
  },

  async delete(id: string) {
    await prisma.conversationGroup.delete({ where: { id } });
  },

  async addConversation(groupId: string, conversationId: string) {
    await prisma.conversationGroupItem.upsert({
      where: { groupId_conversationId: { groupId, conversationId } },
      update: {},
      create: { groupId, conversationId },
    });
  },

  async removeConversation(groupId: string, conversationId: string) {
    await prisma.conversationGroupItem.deleteMany({ where: { groupId, conversationId } });
  },
};
