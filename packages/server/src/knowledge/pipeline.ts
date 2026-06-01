// 文档摄取异步管线

import { documentRepo, chunkRepo } from "../db/repositories/knowledge";
import { chunkDocument, parseFileContent } from "./chunker";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";

export async function ingestDocument(documentId: string): Promise<void> {
  const doc = await documentRepo.getById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  try {
    await documentRepo.updateStatus(documentId, "parsing");

    // Phase 1: 解析文本
    const text = await loadDocumentText(doc.id, doc.fileType ?? "txt");
    if (!text.trim()) throw new Error("Empty document content");

    // Phase 2: 语义切片
    await documentRepo.updateStatus(documentId, "chunking");
    const chunks = chunkDocument(text, { fileType: doc.fileType ?? undefined });
    if (chunks.length === 0) throw new Error("No chunks generated");

    // 清除旧chunks
    await chunkRepo.deleteByDocument(documentId);

    // Phase 3: Embedding（批量，避免超限）
    await documentRepo.updateStatus(documentId, "embedding");
    const adapter = createAdapterFromEnv();
    await adapter.connect();

    const batchSize = 20;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      // 串行调 embedding API（避免 rate limit）
      for (const chunk of batch) {
        let embedding: number[] = [];
        try {
          if (adapter.capabilities.embeddings) {
            embedding = await adapter.generateEmbedding(chunk.content);
          }
        } catch (err) {
          logger.warn(`Embedding failed for chunk ${chunk.chunkIndex}: ${err}`, 'Ingestion');
          embedding = [];
        }
        await chunkRepo.create({
          documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          sectionTitle: chunk.sectionTitle,
          chunkType: chunk.chunkType,
          prevChunkId: chunk.prevChunkId,
          nextChunkId: chunk.nextChunkId,
        });
        // Store embedding via raw SQL (pgvector)
        if (embedding.length > 0) {
          await storeEmbedding(documentId, chunk.chunkIndex, embedding);
        }
      }
    }

    await adapter.disconnect();
    await documentRepo.updateStatus(documentId, "completed");
    logger.info(`Document ${doc.title} ingested: ${chunks.length} chunks`, 'Ingestion');
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await documentRepo.updateStatus(documentId, "failed", msg);
    logger.error(`Ingestion failed for ${doc.title}: ${msg}`, err as Error, 'Ingestion');
  }
}

async function loadDocumentText(documentId: string, fileType: string): Promise<string> {
  // 优先查找配套的 temp 文件
  const { config } = await import("../config");
  const tmpPath = path.join(config.files.uploadDir, `${documentId}_content.txt`);
  if (fs.existsSync(tmpPath)) {
    return parseFileContent(fs.readFileSync(tmpPath), fileType);
  }

  // 查 FileEntity 表
  const { prisma } = await import("../db/index");
  const files = await prisma.fileEntity.findMany({ where: { path: { contains: documentId } }, take: 1 });
  if (files.length > 0) {
    const filePath = files[0].path;
    if (fs.existsSync(filePath)) {
      return parseFileContent(fs.readFileSync(filePath), fileType);
    }
  }

  return "";
}

async function storeEmbedding(documentId: string, chunkIndex: number, embedding: number[]): Promise<void> {
  const { prisma } = await import("../db/index");
  const embeddingStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Chunk" SET embedding = $1::vector WHERE "documentId" = $2 AND "chunkIndex" = $3`,
    embeddingStr, documentId, chunkIndex
  );
}
