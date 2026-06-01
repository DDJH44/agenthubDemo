import type { IAdapter } from "@agenthub/adapter";
import { MemoryStore } from "./store";
import { jobRepo } from "../db/repositories/job";
import { logger } from "../utils/logger";

/**
 * Three-tier memory system:
 *
 * Tier 1 — Working Memory (TTL MemoryStore)
 *   Current task context: plan, steps, intermediate results. Expires after 30 min.
 *
 * Tier 2 — Short-term Memory (Prisma queries)
 *   Recent jobs and messages from the same conversation. Persistent, queried on demand.
 *
 * Tier 3 — Long-term Memory (Embedding similarity)
 *   Stores task summaries as embeddings. Retrieves similar past tasks to inform new ones.
 */

export class MemoryManager {
  working: MemoryStore;
  private adapter?: IAdapter;
  private conversationId?: string;

  constructor(adapter?: IAdapter) {
    this.working = new MemoryStore();
    this.adapter = adapter;
  }

  setConversation(conversationId: string): void {
    this.conversationId = conversationId;
  }

  /* Working memory delegation */
  set(key: string, value: unknown, ttlMs?: number): void { this.working.set(key, value, ttlMs); }
  get<T>(key: string): T | undefined { return this.working.get<T>(key); }
  getAll(): Record<string, unknown> { return this.working.getAll(); }
  clear(): void { this.working.clear(); }

  /* ── Tier 2: Recent context ── */

  async getRecentJobs(limit = 5) {
    try {
      const jobs = await jobRepo.listByConversation(this.conversationId ?? "default", { limit });
      return jobs.filter((j) => j.status === "completed" && j.summary).map((j) => ({
        id: j.id,
        title: j.title,
        summary: j.summary?.slice(0, 300),
        when: j.completedAt?.getTime() ?? j.createdAt.getTime(),
      }));
    } catch (err) {
      logger.warn(`Failed to load recent jobs: ${err}`, 'MemoryManager');
      return [];
    }
  }

  async buildContextPrompt(task: string): Promise<string> {
    const parts: string[] = [];

    // Tier 1: Working memory
    const working = this.working.summarize();
    if (working && working !== "无") parts.push(`## 当前工作记忆\n${working}`);

    // Tier 2: Short-term (recent jobs)
    const recent = await this.getRecentJobs(3);
    if (recent.length > 0) {
      parts.push(`## 近期任务\n${recent.map((j) => `- ${j.title}: ${j.summary}`).join("\n")}`);
    }

    // Tier 3: Long-term (similar past tasks via embedding similarity)
    if (this.adapter) {
      try {
        const similar = await this.findSimilarTasks(task);
        if (similar.length > 0) {
          parts.push(`## 相似历史任务\n${similar.map((s) => `- ${s.title}: ${s.summary}`).join("\n")}`);
        }
      } catch (err) {
        logger.warn(`Failed to find similar tasks: ${err}`, 'MemoryManager');
      }
    }

    return parts.length > 0 ? `\n${parts.join("\n\n")}` : "";
  }

  /* ── Tier 3: Embedding-based similarity ── */

  private async findSimilarTasks(task: string, limit = 2): Promise<Array<{ title: string; summary: string }>> {
    // Try embedding similarity if adapter supports it
    if (this.adapter?.capabilities.embeddings) {
      try {
        const embedding = await this.adapter.generateEmbedding(task);
        const allJobs = await jobRepo.listByConversation(this.conversationId ?? "default", { limit: 50 });
        const completed = allJobs.filter((j) => j.summary);
        const jobEmbeddings = await Promise.all(
          completed.map(async (j) => {
            try {
              const emb = await this.adapter!.generateEmbedding(j.summary!.slice(0, 500));
              return { title: j.title, summary: j.summary!.slice(0, 200), similarity: this.cosineSimilarity(embedding, emb) };
            } catch { return { title: j.title, summary: j.summary!.slice(0, 200), similarity: 0 }; }
          })
        );
        return jobEmbeddings.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
      } catch { /* fallback to keyword */ }
    }
    return this.keywordSimilarity(task, limit);
  }

  private async keywordSimilarity(task: string, limit: number): Promise<Array<{ title: string; summary: string }>> {
    const allJobs = await jobRepo.listByConversation(this.conversationId ?? "default", { limit: 20 });
    const completed = allJobs.filter((j) => j.summary);
    const taskWords = new Set(task.toLowerCase().split(/\s+/));
    const scored = completed.map((j) => {
      const titleWords = j.title.toLowerCase().split(/\s+/);
      const summaryWords = (j.summary ?? "").toLowerCase().split(/\s+/);
      const overlap = [...taskWords].filter((w) => titleWords.includes(w) || summaryWords.includes(w)).length;
      return { title: j.title, summary: j.summary?.slice(0, 200) ?? "", score: overlap };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * (b[i] ?? 0); normA += a[i] * a[i]; }
    for (let i = 0; i < b.length; i++) normB += b[i] * b[i];
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }

  summarize(): string { return this.working.summarize(); }
}
