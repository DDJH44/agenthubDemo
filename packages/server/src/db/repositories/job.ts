import { prisma } from "../index";

export const jobRepo = {
  listByWorkspace(workspaceId: string, { status }: { status?: string } = {}) {
    return prisma.job.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  },

  listByConversation(conversationId: string, opts?: { limit?: number }) {
    return prisma.job.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: opts?.limit ?? 20 });
  },

  listStuck() {
    return prisma.job.findMany({
      where: { status: "running", startedAt: { lt: new Date(Date.now() - 600_000) } },
      take: 10,
    });
  },

  getById(id: string) {
    return prisma.job.findUnique({ where: { id }, include: { events: { orderBy: { timestamp: "asc" } }, artifacts: true } });
  },

  create(data: { workspaceId: string; conversationId?: string; title: string; description?: string; priority?: string }) {
    return prisma.job.create({
      data: {
        workspaceId: data.workspaceId,
        conversationId: data.conversationId,
        title: data.title,
        description: data.description,
        priority: data.priority ?? "normal",
        status: "pending",
      },
    });
  },

  updateStatus(id: string, status: string, extra?: { summary?: string; error?: string; plan?: unknown; stepResults?: unknown; stats?: unknown }) {
    return prisma.job.update({
      where: { id },
      data: {
        status,
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "failed" ? { completedAt: new Date() } : {}),
        ...(extra?.summary ? { summary: extra.summary } : {}),
        ...(extra?.error ? { error: extra.error } : {}),
        ...(extra?.plan ? { plan: JSON.stringify(extra.plan) } : {}),
        ...(extra?.stepResults ? { stepResults: JSON.stringify(extra.stepResults) } : {}),
        ...(extra?.stats ? { stats: JSON.stringify(extra.stats) } : {}),
      },
    });
  },

  addEvent(jobId: string, data: { type: string; agentId?: string; nodeId?: string; payload?: unknown }) {
    return prisma.jobEvent.create({
      data: {
        jobId,
        type: data.type,
        agentId: data.agentId,
        nodeId: data.nodeId,
        payload: data.payload ? JSON.stringify(data.payload) : "{}",
      },
    });
  },

  async getTaskTrend(workspaceId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const jobs = await prisma.job.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { createdAt: true, completedAt: true, status: true },
    });

    const result: Record<string, { created: number; completed: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      result[key] = { created: 0, completed: 0 };
    }

    for (const job of jobs) {
      const createdKey = `${String(job.createdAt.getMonth() + 1).padStart(2, "0")}-${String(job.createdAt.getDate()).padStart(2, "0")}`;
      if (result[createdKey]) result[createdKey].created++;

      if (job.completedAt && job.status === "completed") {
        const completedKey = `${String(job.completedAt.getMonth() + 1).padStart(2, "0")}-${String(job.completedAt.getDate()).padStart(2, "0")}`;
        if (result[completedKey]) result[completedKey].completed++;
      }
    }

    return Object.entries(result).map(([label, v]) => ({ label, ...v }));
  },

  addArtifact(jobId: string, data: { type: string; content: string; filename?: string; metadata?: unknown }) {
    return prisma.artifact.create({
      data: {
        jobId,
        type: data.type,
        content: data.content,
        filename: data.filename,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  },
};
