import { prisma } from "../index";
import type { Prisma } from "@prisma/client";

function asJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

export const knowledgeBaseRepo = {
  async create(data: { workspaceId: string; name: string; description?: string; visibility?: string; ownerId: string }) {
    return prisma.knowledgeBase.create({ data: { ...data, visibility: data.visibility ?? "private" } });
  },

  async listByWorkspace(workspaceId: string) {
    return prisma.knowledgeBase.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { documents: true } } } });
  },

  async getById(id: string) {
    return prisma.knowledgeBase.findUnique({ where: { id } });
  },

  async update(id: string, data: { name?: string; description?: string; visibility?: string }) {
    return prisma.knowledgeBase.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.knowledgeBase.delete({ where: { id } });
  },
};

export const documentRepo = {
  async create(data: { knowledgeBaseId: string; title: string; sourceType?: string; fileType?: string; fileSize?: number; metadata?: Prisma.InputJsonValue; uploadedBy?: string }) {
    return prisma.document.create({ data: { ...data, metadata: data.metadata ?? asJson({}) } });
  },

  async listByKnowledgeBase(knowledgeBaseId: string) {
    return prisma.document.findMany({ where: { knowledgeBaseId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { chunks: true } } } });
  },

  async getById(id: string) {
    return prisma.document.findUnique({ where: { id }, include: { chunks: { orderBy: { chunkIndex: "asc" } } } });
  },

  async updateStatus(id: string, status: string, errorMessage?: string) {
    return prisma.document.update({ where: { id }, data: { status, errorMessage: errorMessage ?? null } });
  },

  async delete(id: string) {
    return prisma.document.delete({ where: { id } });
  },
};

export const chunkRepo = {
  async create(data: { documentId: string; chunkIndex: number; content: string; tokenCount?: number; sectionTitle?: string; chunkType?: string; prevChunkId?: string; nextChunkId?: string; metadata?: Prisma.InputJsonValue }) {
    return prisma.chunk.create({ data: { ...data, metadata: data.metadata ?? asJson({}) } });
  },

  async createMany(chunks: Array<{ documentId: string; chunkIndex: number; content: string; tokenCount?: number; sectionTitle?: string; chunkType?: string; prevChunkId?: string; nextChunkId?: string; metadata?: Prisma.InputJsonValue }>) {
    return prisma.$transaction(chunks.map((c) => prisma.chunk.create({ data: { ...c, metadata: c.metadata ?? asJson({}) } })));
  },

  async listByDocument(documentId: string) {
    return prisma.chunk.findMany({ where: { documentId }, orderBy: { chunkIndex: "asc" } });
  },

  async deleteByDocument(documentId: string) {
    return prisma.chunk.deleteMany({ where: { documentId } });
  },
};
