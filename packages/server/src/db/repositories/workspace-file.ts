import { prisma } from "../index";

export const workspaceFileRepo = {
  async listByParent(workspaceId: string, parentId: string | null = null) {
    return prisma.workspaceFile.findMany({
      where: { workspaceId, parentId },
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    });
  },

  async search(workspaceId: string, query: string) {
    return prisma.workspaceFile.findMany({
      where: { workspaceId, name: { contains: query, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 50,
    });
  },

  async getTree(workspaceId: string) {
    return prisma.workspaceFile.findMany({
      where: { workspaceId },
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    });
  },

  async getById(id: string) {
    return prisma.workspaceFile.findUnique({ where: { id } });
  },

  async create(data: { workspaceId: string; parentId?: string | null; name: string; isFolder?: boolean; size?: number; mimeType?: string; path?: string; uploadedBy?: string }) {
    return prisma.workspaceFile.create({ data });
  },

  async rename(id: string, name: string) {
    return prisma.workspaceFile.update({ where: { id }, data: { name } });
  },

  async move(id: string, parentId: string | null) {
    return prisma.workspaceFile.update({ where: { id }, data: { parentId } });
  },

  async delete(id: string) {
    // 级联删除子节点
    const children = await prisma.workspaceFile.findMany({ where: { parentId: id } });
    for (const child of children) await this.delete(child.id);
    return prisma.workspaceFile.delete({ where: { id } });
  },
};
