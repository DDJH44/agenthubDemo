import { prisma } from "../index";

interface PaginationOptions {
  cursor?: string | null;
  limit?: number;
}

interface PaginatedResult<T> {
  users: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const userRepo = {
  async getById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.user.findMany({ where: { id: { in: ids } } });
  },

  async getByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async create(data: { name: string; email: string; password: string }) {
    return prisma.user.create({ data });
  },

  async update(id: string, data: { name?: string; avatarUrl?: string }) {
    return prisma.user.update({ where: { id }, data });
  },

  async search(query: string, options: PaginationOptions = {}): Promise<PaginatedResult<{ id: string; name: string; email: string; avatarUrl: string | null; createdAt: Date }>> {
    const { cursor, limit = 20 } = options;
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query } },
          { name: { contains: query } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    return {
      users: items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  async listAll(excludeId?: string, options: PaginationOptions = {}): Promise<PaginatedResult<{ id: string; name: string; email: string; avatarUrl: string | null; createdAt: Date }>> {
    const { cursor, limit = 20 } = options;
    const users = await prisma.user.findMany({
      where: excludeId ? { id: { not: excludeId } } : {},
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    return {
      users: items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  },
};
