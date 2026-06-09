import { prisma } from "../index";

export const messageRepo = {
  listByConversation(conversationId: string, { take = 50, before }: { take?: number; before?: string } = {}) {
    return prisma.message.findMany({
      where: { conversationId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { timestamp: "asc" },
      take,
    });
  },

  create(data: {
    conversationId: string; type: string; sender: string; senderId?: string;
    content: string; payload?: Record<string, unknown>; mentions?: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: data.conversationId,
          type: data.type,
          sender: data.sender,
          senderId: data.senderId,
          content: data.content,
          payload: data.payload ? JSON.stringify(data.payload) : null,
          mentions: JSON.stringify(data.mentions ?? []),
        },
      });

      await tx.conversation.updateMany({
        where: { id: data.conversationId },
        data: { messageCount: { increment: 1 } },
      });

      return msg;
    });
  },

  async createAndUpdateConv(data: {
    conversationId: string; type: string; sender: string; senderId?: string;
    content: string; payload?: Record<string, unknown>; mentions?: string[];
    id?: string;
  }) {
    const [, msg] = await prisma.$transaction([
      prisma.conversation.upsert({
        where: { id: data.conversationId },
        create: {
          id: data.conversationId,
          workspaceId: "default",
          title: data.content.slice(0, 40),
          lastMessage: data.content.slice(0, 200),
          lastMessageAt: new Date(),
          messageCount: 1,
        },
        update: {
          lastMessage: data.content.slice(0, 200),
          lastMessageAt: new Date(),
          messageCount: { increment: 1 },
        },
      }),
      prisma.message.create({
        data: {
          id: data.id,
          conversationId: data.conversationId,
          type: data.type,
          sender: data.sender,
          senderId: data.senderId,
          content: data.content,
          payload: data.payload ? JSON.stringify(data.payload) : null,
          mentions: JSON.stringify(data.mentions ?? []),
        },
      }),
    ]);
    return msg;
  },
};
