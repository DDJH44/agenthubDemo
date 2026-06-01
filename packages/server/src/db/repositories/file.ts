import { prisma } from "../index";

export const fileRepo = {
  async create(data: { conversationId: string; uploaderId: string; name: string; path: string; size: number; mimeType: string }) {
    return prisma.fileEntity.create({ data });
  },

  async getById(id: string) {
    return prisma.fileEntity.findUnique({ where: { id } });
  },

  async listByConversation(conversationId: string) {
    return prisma.fileEntity.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
  },

  async delete(id: string) {
    await prisma.fileEntity.delete({ where: { id } });
  },
};
