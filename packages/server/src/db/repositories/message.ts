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
    return prisma.message.create({
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
        },
        update: { lastMessage: data.content.slice(0, 200), lastMessageAt: new Date() },
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
