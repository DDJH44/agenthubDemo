import { prisma } from "../index";

export const userAgentConfigRepo = {
  async create(data: { userId: string; name: string; type: string; config?: string; permissions?: string }) {
    return prisma.userAgentConfig.create({
      data: {
        userId: data.userId,
        name: data.name,
        type: data.type,
        config: data.config ?? "{}",
        permissions: data.permissions ?? "[]",
      },
    });
  },

  async listByUser(userId: string) {
    return prisma.userAgentConfig.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.userAgentConfig.findUnique({ where: { id } });
  },

  async update(id: string, data: { name?: string; config?: string; permissions?: string; status?: string }) {
    return prisma.userAgentConfig.update({ where: { id }, data });
  },

  async delete(id: string) {
    await prisma.userAgentConfig.delete({ where: { id } });
  },
};
