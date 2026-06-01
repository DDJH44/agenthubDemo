import { prisma } from "../index";

export const mcpRepo = {
  async create(data: { userId: string; name: string; protocol: string; command?: string; url?: string; env?: string }) {
    return prisma.mcpServerConfig.create({ data });
  },

  async listByUser(userId: string) {
    return prisma.mcpServerConfig.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  },

  async getById(id: string) {
    return prisma.mcpServerConfig.findUnique({ where: { id } });
  },

  async update(id: string, data: { name?: string; protocol?: string; command?: string; url?: string; env?: string; status?: string; lastSeen?: Date }) {
    return prisma.mcpServerConfig.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.mcpServerConfig.delete({ where: { id } });
  },
};
