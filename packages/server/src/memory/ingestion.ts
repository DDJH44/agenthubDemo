// 消息摄入管线 — 自动将对话消息向量化并存入记忆知识库

import { createAdapterFromEnv } from "@agenthub/adapter";
import { prisma } from "../db/index";
import { logger } from "../utils/logger";

const MEMORY_KB_NAME = "_conversation_memory";

// 确保系统记忆知识库存在
async function ensureMemoryKB(workspaceId: string): Promise<string> {
  const existing = await prisma.knowledgeBase.findFirst({
    where: { workspaceId, name: MEMORY_KB_NAME },
  });
  if (existing) return existing.id;

  const kb = await prisma.knowledgeBase.create({
    data: { workspaceId, name: MEMORY_KB_NAME, description: "对话记忆自动存储", ownerId: "system", visibility: "workspace" },
  });
  logger.info(`Created memory KB: ${kb.id}`, 'MemoryIngestion');
  return kb.id;
}

// 摄入单条消息
export async function ingestMessage(conversationId: string, messageId: string): Promise<void> {
  try {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || !msg.content || msg.content.length < 10) return;

    // 只摄入有价值的消息类型
    if (!["user_message", "agent_message", "system"].includes(msg.type)) return;

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    const workspaceId = conv?.workspaceId ?? "default";
    const kbId = await ensureMemoryKB(workspaceId);
    const adapter = createAdapterFromEnv();
    await adapter.connect();

    // 生成 embedding
    let embedding: number[] = [];
    if (adapter.capabilities.embeddings) {
      try {
        embedding = await adapter.generateEmbedding(msg.content.slice(0, 2000));
      } catch { /* fallback */ }
    }

    // 检查是否已有此消息的 chunk
    const existing = await prisma.document.findFirst({
      where: { knowledgeBaseId: kbId, title: `msg:${messageId}` },
    });
    if (existing) await prisma.document.delete({ where: { id: existing.id } });

    // 创建 Document（一条消息 = 一个文档）
    const doc = await prisma.document.create({
      data: {
        knowledgeBaseId: kbId,
        title: `msg:${messageId}`,
        sourceType: "import",
        fileType: "txt",
        status: "completed",
        metadata: { conversationId, sender: msg.sender, type: msg.type, messageId },
        uploadedBy: "system",
      },
    });

    // 创建 Chunk
    await prisma.chunk.create({
      data: {
        documentId: doc.id,
        chunkIndex: 0,
        content: msg.content.slice(0, 2000),
        tokenCount: Math.ceil(msg.content.length / 3),
        chunkType: msg.type,
        metadata: { conversationId, sender: msg.sender },
      },
    });

    // 存储 embedding 到 Message
    if (embedding.length > 0) {
      const embStr = `[${embedding.join(",")}]`;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Message" SET embedding = $1::vector WHERE id = $2`,
          embStr, messageId,
        );
      } catch { /* embedding column might not exist yet */ }
    }

    // 增量更新对话统计
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { messageCount: { increment: 1 } },
    });

    await adapter.disconnect();
  } catch (err) {
    logger.warn(`Message ingestion failed for ${messageId}: ${err}`, 'MemoryIngestion');
  }
}

// 触发 LLM 摘要更新（每 N 条消息或对话空闲时）
export async function generateConversationSummary(conversationId: string): Promise<void> {
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || (conv.messageCount ?? 0) < 3) return;

    // 获取最近消息
    const recentMsgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: "asc" },
      take: 20,
      select: { content: true, sender: true, type: true },
    });

    const context = recentMsgs.map(m => `[${m.sender}]: ${m.content.slice(0, 300)}`).join("\n");

    const adapter = createAdapterFromEnv();
    await adapter.connect();
    const response = await adapter.sendMessage(
      `基于以下对话片段，提取 2-5 个关键词/话题标签（逗号分隔），然后生成一句中文摘要（不超过50字）。\n\n${context}`,
      { temperature: 0.2, maxTokens: 150 },
    );
    await adapter.disconnect();

    // 解析标签和摘要
    const lines = response.split("\n").filter(l => l.trim());
    const topicsLine = lines.find(l => l.includes(",") || l.includes("，")) ?? "";
    const topics = topicsLine.split(/[,，]/).map(t => t.trim()).filter(t => t.length > 1 && t.length < 15).slice(0, 5);
    const summary = lines.find(l => !l.includes(",") && !l.includes("，") && l.length > 5) ?? lines[0] ?? "";

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        topics: JSON.stringify(topics),
        summary: summary.slice(0, 200),
        importance: Math.min(1.0, (conv.messageCount ?? 0) / 50),
      },
    });
  } catch (err) {
    logger.warn(`Summary generation failed for ${conversationId}: ${err}`, 'MemoryIngestion');
  }
}

// 对话记忆搜索（横跨所有对话）
export async function searchMemory(
  workspaceId: string,
  query: string,
  options?: { conversationId?: string; topK?: number },
): Promise<Array<{ conversationId: string; conversationTitle: string; content: string; sender: string; messageId: string }>> {
  const knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: { workspaceId, name: MEMORY_KB_NAME },
  });
  if (!knowledgeBase) return [];

  const limit = options?.topK ?? 10;

  let whereClause = "";
  if (options?.conversationId) {
    whereClause = `AND m."conversationId" = '${options.conversationId}'`;
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      conversationId: string; conversationTitle: string; content: string;
      sender: string; messageId: string;
    }>>(
      `SELECT
         m."conversationId", c.title as "conversationTitle",
         m.content, m.sender, m.id as "messageId"
       FROM "Message" m
       JOIN "Conversation" c ON c.id = m."conversationId"
       WHERE m.content ILIKE '%' || $1 || '%' ${whereClause}
       ORDER BY m.timestamp DESC
       LIMIT $2`,
      query, limit,
    );
    return rows;
  } catch {
    return [];
  }
}
