import { prisma } from "../index";

export const conversationRepo = {
  async listByWorkspace(workspaceId: string, userId?: string) {
    const all = await prisma.conversation.findMany({
      where: { workspaceId },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: 200,
    });

    if (!userId) return all.slice(0, 50);

    return all.filter((c) => {
      try {
        const participants: string[] = JSON.parse(c.participants ?? "[]");
        if (participants.length === 0) return true;
        return participants.includes(userId);
      } catch { return true; }
    }).slice(0, 50);
  },

  listActive(workspaceId: string) {
    return prisma.conversation.findMany({
      where: { workspaceId, status: "active" },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: 50,
    });
  },

  listArchived(workspaceId: string) {
    return prisma.conversation.findMany({
      where: { workspaceId, status: "archived" },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  },

  async search(workspaceId: string, query: string, userId?: string) {
    const all = await prisma.conversation.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { contains: query } },
          { lastMessage: { contains: query } },
        ],
      },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: 50,
    });

    if (!userId) return all.slice(0, 20);

    return all.filter((c) => {
      try {
        const participants: string[] = JSON.parse(c.participants ?? "[]");
        return participants.includes(userId);
      } catch { return false; }
    }).slice(0, 20);
  },

  getById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
    });
  },

  create(data: { workspaceId: string; title: string; type?: string; participants?: string[]; createdBy?: string }) {
    return prisma.conversation.create({
      data: {
        workspaceId: data.workspaceId,
        title: data.title,
        type: data.type ?? "group",
        participants: JSON.stringify(data.participants ?? []),
        createdBy: data.createdBy,
        status: "active",
      },
    });
  },

  update(id: string, data: { title?: string; status?: string; lastMessage?: string; participants?: string }) {
    return prisma.conversation.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.lastMessage !== undefined && { lastMessage: data.lastMessage, lastMessageAt: new Date() }),
        ...(data.participants !== undefined && { participants: data.participants }),
      },
    });
  },

  async addParticipant(id: string, userId: string): Promise<boolean> {
    const conv = await prisma.conversation.findUnique({ where: { id } });
    if (!conv) return false;
    const participants: string[] = JSON.parse(conv.participants ?? "[]");
    if (participants.includes(userId)) return false;
    participants.push(userId);
    await prisma.conversation.update({ where: { id }, data: { participants: JSON.stringify(participants) } });
    return true;
  },

  async removeParticipant(id: string, userId: string): Promise<boolean> {
    const conv = await prisma.conversation.findUnique({ where: { id } });
    if (!conv) return false;
    const participants: string[] = JSON.parse(conv.participants ?? "[]");
    const idx = participants.indexOf(userId);
    if (idx === -1) return false;
    if (participants.length <= 1) return false;
    participants.splice(idx, 1);
    await prisma.conversation.update({ where: { id }, data: { participants: JSON.stringify(participants) } });
    return true;
  },

  pin(id: string) {
    return prisma.conversation.update({
      where: { id },
      data: { pinned: true, pinnedAt: new Date() },
    });
  },

  unpin(id: string) {
    return prisma.conversation.update({
      where: { id },
      data: { pinned: false, pinnedAt: null },
    });
  },

  archive(id: string) {
    return prisma.conversation.update({ where: { id }, data: { status: "archived" } });
  },

  unarchive(id: string) {
    return prisma.conversation.update({ where: { id }, data: { status: "active" } });
  },

  async delete(id: string) {
    // Use transaction to delete all related data first
    return prisma.$transaction(async (tx) => {
      // Delete related messages
      await tx.message.deleteMany({ where: { conversationId: id } });
      // Delete related conversation agents
      await tx.conversationAgent.deleteMany({ where: { conversationId: id } });
      // Delete related files
      await tx.fileEntity.deleteMany({ where: { conversationId: id } });
      // Delete related jobs and their events/artifacts
      const jobs = await tx.job.findMany({ where: { conversationId: id } });
      for (const job of jobs) {
        await tx.jobEvent.deleteMany({ where: { jobId: job.id } });
        await tx.artifact.deleteMany({ where: { jobId: job.id } });
      }
      await tx.job.deleteMany({ where: { conversationId: id } });
      // Delete conversation group items
      await tx.conversationGroupItem.deleteMany({ where: { conversationId: id } });
      // Finally delete the conversation
      return tx.conversation.delete({ where: { id } });
    });
  },
};
