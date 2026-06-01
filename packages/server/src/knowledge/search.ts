// Hybrid Search 引擎：Dense(Vector) + Sparse(BM25) + Rerank

import { prisma } from "../db/index";
import type { IAdapter } from "@agenthub/adapter";
import { logger } from "../utils/logger";

export interface SearchOptions {
  query: string;
  knowledgeBaseId: string;
  filters?: {
    metadata?: Record<string, string>;
    documentIds?: string[];
    sourceTypes?: string[];
  };
  topK?: number;
  rerankTopK?: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  sectionTitle?: string;
  chunkType: string;
  score: number;
  prevChunkId?: string;
  nextChunkId?: string;
}

export async function hybridSearch(
  adapter: IAdapter,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const topK = options.topK ?? 50;
  const rerankTopK = options.rerankTopK ?? 5;

  try {
    // Step 1: Dense Retrieval — pgvector cosine similarity
    const queryEmbedding = adapter.capabilities.embeddings
      ? await adapter.generateEmbedding(options.query)
      : null;

    let denseResults: SearchResult[] = [];
    if (queryEmbedding) {
      denseResults = await denseSearch(options.knowledgeBaseId, queryEmbedding, topK, options.filters);
    }

    // Step 2: Sparse Retrieval — PostgreSQL full-text search
    const sparseResults = await sparseSearch(options.knowledgeBaseId, options.query, topK, options.filters);

    // Step 3: Merge & deduplicate with hybrid scoring
    const merged = mergeResults(denseResults, sparseResults, 0.7);

    // Step 4: Rerank — LLM-based cross-encoder scoring
    const reranked = await rerank(adapter, options.query, merged, rerankTopK);

    // Step 5: Enrich with neighbor chunks
    return await enrichWithNeighbors(reranked);
  } catch (err) {
    logger.warn(`Hybrid search failed: ${err}`, 'Search');
    return sparseSearch(options.knowledgeBaseId, options.query, rerankTopK, options.filters);
  }
}

// Dense: pgvector cosine_distance
async function denseSearch(
  knowledgeBaseId: string,
  embedding: number[],
  limit: number,
  filters?: SearchOptions["filters"],
): Promise<SearchResult[]> {
  const embStr = `[${embedding.join(",")}]`;
  const filterSQL = buildFilterSQL(filters, "c");

  const rows = await prisma.$queryRawUnsafe<Array<{
    chunkId: string; documentId: string; documentTitle: string; content: string;
    sectionTitle: string | null; chunkType: string; score: number;
    prevChunkId: string | null; nextChunkId: string | null;
  }>>(
    `SELECT
       c.id as "chunkId", c."documentId", d.title as "documentTitle",
       c.content, c."sectionTitle", c."chunkType",
       1 - (c.embedding <=> $1::vector) as score,
       c."prevChunkId", c."nextChunkId"
     FROM "Chunk" c
     JOIN "Document" d ON d.id = c."documentId"
     WHERE d."knowledgeBaseId" = $2 ${filterSQL}
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    embStr, knowledgeBaseId, Math.min(limit, 25),
  );
  return rows.map(r => ({ ...r, sectionTitle: r.sectionTitle ?? undefined, prevChunkId: r.prevChunkId ?? undefined, nextChunkId: r.nextChunkId ?? undefined }));
}

// Sparse: PostgreSQL full-text search
async function sparseSearch(
  knowledgeBaseId: string,
  query: string,
  limit: number,
  filters?: SearchOptions["filters"],
): Promise<SearchResult[]> {
  const filterSQL = buildFilterSQL(filters, "c");
  // Use ILIKE for fuzzy matching (tsvector requires Chinese tokenizer)
  const tsquery = query.split(/\s+/).filter(w => w.length > 0).map(w => `%${w}%`).join(" OR ");
  const params: (string | number)[] = [knowledgeBaseId, Math.min(limit, 25)];
  if (tsquery) params.push(`%${query.split(/\s+/).filter(w => w.length > 0).join("%")}%`);

  const rows = await prisma.$queryRawUnsafe<Array<{
    chunkId: string; documentId: string; documentTitle: string; content: string;
    sectionTitle: string | null; chunkType: string; score: number;
    prevChunkId: string | null; nextChunkId: string | null;
  }>>(
    `SELECT
       c.id as "chunkId", c."documentId", d.title as "documentTitle",
       c.content, c."sectionTitle", c."chunkType",
       ${tsquery ? `(length(c.content) - length(replace(lower(c.content), lower($3), ''))) * 1.0 / greatest(length(c.content), 1) as score` : "0.1 as score"},
       c."prevChunkId", c."nextChunkId"
     FROM "Chunk" c
     JOIN "Document" d ON d.id = c."documentId"
     WHERE d."knowledgeBaseId" = $1 ${tsquery ? `AND c.content ILIKE '%' || $3 || '%'` : ""} ${filterSQL}
     ORDER BY score DESC
     LIMIT $2`,
    ...params,
  );
  return rows.map(r => ({ ...r, sectionTitle: r.sectionTitle ?? undefined, prevChunkId: r.prevChunkId ?? undefined, nextChunkId: r.nextChunkId ?? undefined }));
}

// Merge: weighted fusion
function mergeResults(dense: SearchResult[], sparse: SearchResult[], denseWeight: number): SearchResult[] {
  const map = new Map<string, { dense: number; sparse: number; result: SearchResult }>();
  for (const r of dense) {
    map.set(r.chunkId, { dense: r.score, sparse: 0, result: r });
  }
  for (const r of sparse) {
    const existing = map.get(r.chunkId);
    if (existing) {
      existing.sparse = r.score;
    } else {
      map.set(r.chunkId, { dense: 0, sparse: r.score, result: r });
    }
  }
  const merged: SearchResult[] = [];
  for (const [, v] of map) {
    merged.push({
      ...v.result,
      score: denseWeight * v.dense + (1 - denseWeight) * v.sparse,
    });
  }
  return merged.sort((a, b) => b.score - a.score);
}

// Rerank: LLM cross-encoder
async function rerank(
  adapter: IAdapter,
  query: string,
  candidates: SearchResult[],
  topK: number,
): Promise<SearchResult[]> {
  if (candidates.length <= topK) return candidates;

  try {
    // Simple LLM rerank: score each candidate individually
    const scored: SearchResult[] = [];
    for (const c of candidates.slice(0, 20)) {
      const prompt = `Query: ${query.slice(0, 200)}\nDocument: ${c.content.slice(0, 500)}\n\nRate relevance 1-5 (5=highly relevant). Reply with only the number:`;
      const response = await adapter.sendMessage(prompt, { maxTokens: 5, temperature: 0 });
      const score = parseInt(response.match(/\d/)?.[0] ?? "3");
      scored.push({ ...c, score: c.score * 0.5 + (score / 5) * 0.5 });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  } catch {
    return candidates.slice(0, topK);
  }
}

// Enrich: fetch neighbor chunks for context
async function enrichWithNeighbors(results: SearchResult[]): Promise<SearchResult[]> {
  const enriched: SearchResult[] = [];
  for (const r of results) {
    enriched.push(r);
    // Fetch prev/next chunks
    const neighbors = await prisma.chunk.findMany({
      where: { id: { in: [r.prevChunkId, r.nextChunkId].filter(Boolean) as string[] } },
      select: { id: true, documentId: true, content: true, sectionTitle: true, chunkType: true },
    });
    for (const n of neighbors) {
      enriched.push({
        chunkId: n.id,
        documentId: n.documentId,
        documentTitle: r.documentTitle,
        content: n.content,
        sectionTitle: n.sectionTitle ?? undefined,
        chunkType: n.chunkType,
        score: r.score * 0.8, // slightly lower score for neighbors
      });
    }
  }
  return enriched;
}

function buildFilterSQL(filters?: SearchOptions["filters"], tableAlias = "c"): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.documentIds?.length) {
    parts.push(`AND ${tableAlias}."documentId" IN (${filters.documentIds.map((_, i) => `$${i + 10}`).join(",")})`);
  }
  return parts.join(" ");
}
