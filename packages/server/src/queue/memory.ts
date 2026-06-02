import type { IJobQueue, JobPayload, JobResult } from "./types";
import { createOrchestrator } from "../orchestrator/index";
import { createAdapterFromEnv } from "@agenthub/adapter";
import { jobRepo } from "../db/repositories/job";
import { messageRepo } from "../db/repositories/message";
import { logger } from "../utils/logger";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const DEFAULT_TIMEOUT = 300_000;

interface QueuedJob { jobId: string; payload: JobPayload; enqueuedAt: number; }

function extractPrimaryCodeArtifact(result: string, stepId: string) {
  const match = result.match(/```(\w*)\n([\s\S]*?)```/);
  const language = match?.[1]?.toLowerCase() || "";
  const content = match?.[2]?.trim() || result;

  if (language === "html" || /<!doctype html|<html/i.test(content)) {
    return { type: "html" as const, filename: "index.html", content };
  }

  const extensionMap: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    markdown: "md",
    bash: "sh",
    shell: "sh",
  };
  const extension = extensionMap[language] ?? language ?? "txt";
  return { type: "code" as const, filename: `output-${stepId}.${extension || "txt"}`, content };
}

export class MemoryQueue implements IJobQueue {
  private handlers: Array<(result: JobResult) => void> = [];
  private statuses = new Map<string, "pending" | "running" | "completed" | "failed">();
  private pending: QueuedJob[] = [];
  private running = 0;
  private maxConcurrency = 3;
  private maxPending = 100;
  private controllers = new Map<string, AbortController>();

  async enqueue(payload: JobPayload): Promise<string> {
    if (this.pending.length >= this.maxPending) throw new Error("Queue full, try again later");
    const priority = payload.priority ?? "normal";
    const job = await jobRepo.create({
      workspaceId: payload.workspaceId,
      conversationId: payload.conversationId,
      title: payload.task.slice(0, 100),
      priority,
    });

    this.statuses.set(job.id, "pending");
    this.pending.push({ jobId: job.id, payload, enqueuedAt: Date.now() });
    this.pending.sort((a, b) =>
      (PRIORITY_ORDER[a.payload.priority ?? "normal"] - PRIORITY_ORDER[b.payload.priority ?? "normal"])
      || (a.enqueuedAt - b.enqueuedAt)
    );

    this.drain();

    return job.id;
  }

  cancel(jobId: string): void {
    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      logger.info(`Job ${jobId} cancellation requested`, 'MemoryQueue');
    }
  }

  private drain() {
    while (this.running < this.maxConcurrency && this.pending.length > 0) {
      const next = this.pending.shift()!;
      this.running++;
      this.statuses.set(next.jobId, "running");
      jobRepo.updateStatus(next.jobId, "running");
      this.executeJob(next.jobId, next.payload).finally(() => {
        this.running--;
        this.controllers.delete(next.jobId);
        this.drain();
      });
    }
  }

  async resume(): Promise<void> {
    try {
      const stuck = await jobRepo.listStuck();
      for (const job of stuck) {
        await jobRepo.updateStatus(job.id, "failed", { error: "Server restarted — job lost" });
      }
    } catch (err) {
      logger.warn(`Failed to recover stuck jobs: ${err}`, 'MemoryQueue');
    }
  }

  private async executeJob(jobId: string, payload: JobPayload) {
    const controller = new AbortController();
    this.controllers.set(jobId, controller);

    const adapter = createAdapterFromEnv();
    const orchestrator = createOrchestrator(adapter);
    const steps: Array<{ id: string; task: string; result: string }> = [];
    const b = payload.broadcast;
    const timeout = payload.timeoutMs ?? DEFAULT_TIMEOUT;

    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeout);

    const abortHandler = () => {
      clearTimeout(timeoutHandle);
    };
    controller.signal.addEventListener("abort", abortHandler);

    try {
      await adapter.connect();
      await Promise.race([
        orchestrator.run(
          payload.task,
          async (event) => {
            if (controller.signal.aborted) return;
            await jobRepo.addEvent(jobId, {
              type: event.type,
              nodeId: (event.msg as Record<string, unknown>)?.stepId as string | undefined,
              payload: event.msg,
            });

            const msg = event.msg as Record<string, unknown>;

            switch (event.type) {
        case "system": {
          const systemText = String(msg.msg || msg);
          b?.({ type: "agent:status", agentId: "planner", status: "acting", lastOutput: systemText });
          b?.({ type: "agent:stream", agentId: "planner", chunk: systemText, messageId: `${jobId}-system` });
          break;
        }

        case "plan": {
          const plan = msg.steps ?? msg;
          b?.({ type: "plan:created", jobId, plan });
          const stepsArr = plan as Array<{ id: string; task: string }>;
          if (Array.isArray(stepsArr)) {
            for (const s of stepsArr) {
              b?.({ type: "step:started", jobId, stepId: s.id, task: s.task, agentRole: "planner" });
            }
          }
          break;
        }

        case "stream": {
          const chunk = String((msg as unknown) ?? event.msg);
          if (chunk.startsWith("[AGENT_STEP]")) {
            try {
              const json = chunk.slice("[AGENT_STEP]".length);
              const step = JSON.parse(json);
              b?.({
                type: "agent:step",
                agentId: "worker",
                iteration: step.iteration ?? 0,
                thought: step.thought ?? "",
                action: step.action,
                observation: step.observation,
                isFinal: step.isFinal ?? false,
              });
            } catch {
              b?.({ type: "agent:stream", agentId: "worker", chunk, messageId: `${jobId}-stream` });
            }
          } else if (chunk.startsWith("[任务接收确认]")) {
            const agentId = chunk.includes("调研") ? "researcher"
              : chunk.includes("润色") || chunk.includes("整合") ? "refiner"
              : "worker";
            b?.({ type: "agent:stream", agentId, chunk, messageId: `${jobId}-receipt` });
          } else if (chunk.startsWith("## ") && chunk.includes("工作报告")) {
            const agentId = chunk.includes("调研") ? "researcher"
              : chunk.includes("审查") ? "critic"
              : chunk.includes("优化") || chunk.includes("润色") ? "refiner"
              : "worker";
            b?.({ type: "agent:stream", agentId, chunk, messageId: `${jobId}-report` });
          } else if (chunk.startsWith("## ") && chunk.includes("评审结果")) {
            b?.({ type: "agent:stream", agentId: "critic", chunk, messageId: `${jobId}-critic` });
          } else if (chunk.startsWith("## 任务拆解") || chunk.startsWith("## 任务分配")) {
            b?.({ type: "agent:stream", agentId: "planner", chunk, messageId: `${jobId}-plan-detail` });
          } else {
            b?.({ type: "agent:stream", agentId: "worker", chunk, messageId: `${jobId}-stream` });
          }
          break;
        }

        case "critic": {
          const criticData = msg as Record<string, unknown>;
          b?.({
            type: "critic:review", jobId,
            stepId: (criticData.stepId as string) ?? "",
            valid: (criticData.valid as boolean) ?? false,
            score: (criticData.score as number) ?? 0,
            issues: criticData.issues as string,
            suggestion: criticData.suggestion as string,
          });
          break;
        }

        case "retry": {
          b?.({
            type: "retry:requested", jobId,
            stepId: (msg.stepId as string) ?? "",
            suggestion: (msg.suggestion as string) ?? "",
          });
          break;
        }

        case "research": {
          const r = String((msg as unknown) ?? msg);
          b?.({ type: "agent:stream", agentId: "researcher", chunk: r, messageId: `${jobId}-research` });
          break;
        }

        case "refine": {
          b?.({ type: "agent:stream", agentId: "refiner", chunk: String((msg as unknown) ?? msg), messageId: `${jobId}-refine` });
          break;
        }

        case "final": {
          const final = msg;
          const stepResults = (final.stepResults as Array<{ id: string; task: string; result: string; toolUsed?: string }>) ?? [];

          for (const sr of stepResults) {
            b?.({
              type: "step:completed", jobId,
              stepId: sr.id, task: sr.task, result: sr.result,
              toolUsed: sr.toolUsed ?? undefined,
              duration: undefined,
            });
          }

          b?.({
            type: "job:completed", jobId,
            summary: final.summary as string ?? "",
            stats: {},
          });

          for (const sr of stepResults) {
            if (sr.toolUsed === "code" || sr.toolUsed === "search") {
              const codeArtifact = sr.toolUsed === "code" ? extractPrimaryCodeArtifact(sr.result, sr.id) : null;
              const artifactType = codeArtifact?.type ?? "markdown";
              const filename = codeArtifact?.filename ?? `research-${sr.id}.md`;
              b?.({
                type: "artifact:created", jobId,
                artifact: {
                  id: `artifact-${jobId}-${sr.id}`,
                  jobId,
                  type: artifactType,
                  filename,
                  content: codeArtifact?.content ?? sr.result,
                  createdAt: Date.now(),
                },
              });
            }
          }

          const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
          const summaryText = final.summary as string ?? "";
          let match: RegExpExecArray | null;
          let codeIdx = 0;
          while ((match = codeBlockRegex.exec(summaryText)) !== null) {
            const lang = match[1] || "text";
            const code = match[2];
            if (code.trim().length < 10) continue;
            const extMap: Record<string, string> = {
              html: "html", css: "css", js: "javascript", javascript: "javascript",
              ts: "typescript", typescript: "typescript", tsx: "typescript", jsx: "javascript",
              json: "json", py: "python", python: "python", go: "go", rust: "rust",
              yaml: "yaml", yml: "yaml", xml: "xml", sql: "sql", sh: "shell", bash: "shell",
              java: "java", cpp: "cpp", c: "c", php: "php", md: "markdown", markdown: "markdown",
            };
            const ext = lang.toLowerCase();
            const normalizedExt = extMap[ext] || ext;
            const artifactType = normalizedExt === "html"
              ? "html"
              : ["css", "javascript", "typescript", "json", "python", "go", "rust", "java", "cpp", "c", "php", "sql", "shell", "yaml", "xml"].includes(normalizedExt)
                ? "code"
                : "markdown";
            const filename = extMap[ext] ? `index.${ext}` : `file-${codeIdx}.${ext || "txt"}`;
            b?.({
              type: "artifact:created", jobId,
              artifact: {
                id: `artifact-${jobId}-code-${codeIdx}`,
                jobId,
                type: artifactType,
                filename,
                content: code,
                createdAt: Date.now(),
              },
            });
            codeIdx++;
          }

          steps.push(...stepResults);

          await jobRepo.updateStatus(jobId, "completed", {
            summary: final.summary as string,
            plan: final.plan,
            stepResults: final.stepResults,
            stats: {},
          });

          if (payload.conversationId) {
            if (final.summary) {
              const summaryMsg = await messageRepo.createAndUpdateConv({
                conversationId: payload.conversationId,
                type: "agent_message",
                sender: "refiner",
                content: String(final.summary).slice(0, 2000),
                payload: final as Record<string, unknown>,
              });
              b?.({ type: "message:created", message: { id: summaryMsg.id, conversationId: summaryMsg.conversationId, type: summaryMsg.type, sender: summaryMsg.sender, content: summaryMsg.content, mentions: [], timestamp: summaryMsg.timestamp.getTime() } });
            }
          }

          this.statuses.set(jobId, "completed");
          const jobResult: JobResult = { jobId, status: "completed", summary: final.summary as string, steps };
          for (const handler of this.handlers) handler(jobResult);
          break;
        }
      }
        }, undefined, undefined, payload.conversationId, controller.signal
        ),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => {
          reject(new DOMException("Job cancelled", "AbortError"));
        })),
      ]);

    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.name === "CanceledError");
      if (isAbort) {
        logger.info(`Job ${jobId} cancelled`, 'MemoryQueue');
        this.statuses.set(jobId, "failed");
        jobRepo.updateStatus(jobId, "failed", { error: "Job cancelled by user" }).catch(() => {});
        b?.({ type: "job:failed", jobId, error: "Job cancelled" });
      } else {
        logger.error(`Job ${jobId} failed`, err as Error, 'Queue');
        jobRepo.updateStatus(jobId, "failed", { error: String(err) }).catch(() => {});
        this.statuses.set(jobId, "failed");
        b?.({ type: "job:failed", jobId, error: String(err) });
      }
    } finally {
      clearTimeout(timeoutHandle);
      controller.signal.removeEventListener("abort", abortHandler);
      this.controllers.delete(jobId);
      adapter.disconnect().catch(() => {});
    }
  }

  onComplete(handler: (result: JobResult) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx !== -1) this.handlers.splice(idx, 1);
    };
  }

  async getStatus(jobId: string): Promise<"pending" | "running" | "completed" | "failed"> {
    const memStatus = this.statuses.get(jobId);
    if (memStatus) return memStatus;
    try {
      const job = await jobRepo.getById(jobId);
      return (job?.status as "pending" | "running" | "completed" | "failed") ?? "pending";
    } catch {
      return "pending";
    }
  }
}
