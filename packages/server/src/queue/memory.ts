import type { IJobQueue, JobPayload, JobResult } from "./types";
import { createOrchestrator } from "../orchestrator/index";
import { createAdapterFromEnv } from "@agenthub/adapter";
import type { Artifact } from "@agenthub/shared";
import { jobRepo } from "../db/repositories/job";
import { messageRepo } from "../db/repositories/message";
import { logger } from "../utils/logger";
import { resolveVisibleAgentForRole } from "../agents/conversation-routing";
import { buildAgentRuntimePrompt, chooseRuntimeAdapterOverrides, getPrivateLLMConfigIssue, isInheritedProvider, resolveAgentRuntimeProfiles } from "../agents/runtime-profile";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const DEFAULT_TIMEOUT = 300_000;

interface QueuedJob { jobId: string; payload: JobPayload; enqueuedAt: number; }

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  bash: "sh",
  css: "css",
  html: "html",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  markdown: "md",
  md: "md",
  py: "py",
  python: "py",
  shell: "sh",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
};

function parseFenceHeader(header: string) {
  const language = header.trim().split(/\s+/).find((token) => token && !token.includes("="))?.toLowerCase() || "";
  const filename = header.match(/(?:filename|file)=["']?([^"'\s]+)["']?/i)?.[1];
  return { language, filename };
}

function extractHtmlSegment(text: string) {
  const htmlStart = text.search(/<!doctype html|<html[\s>]/i);
  if (htmlStart < 0) return null;
  const tail = text.slice(htmlStart);
  const endMatch = /<\/html\s*>/i.exec(tail);
  const htmlEnd = endMatch ? htmlStart + endMatch.index + endMatch[0].length : text.length;
  const content = text.slice(htmlStart, htmlEnd).trim();
  return content.length > 40 ? content : null;
}

function extractPrimaryCodeArtifact(result: string, stepId: string) {
  const match = result.match(/```([^\r\n`]*)[ \t]*(?:\r?\n)([\s\S]*?)```/);
  const { language, filename } = parseFenceHeader(match?.[1] ?? "");
  const fencedContent = match?.[2]?.trim();
  const content = fencedContent || extractHtmlSegment(result) || result.trim();

  if (language === "html" || /<!doctype html|<html/i.test(content)) {
    return { type: "html" as const, filename: filename ?? "index.html", content: extractHtmlSegment(content) ?? content };
  }

  const extension = LANGUAGE_EXTENSION_MAP[language] ?? language ?? "txt";
  const type = ["json"].includes(language) ? "json" as const : "code" as const;
  return { type, filename: filename ?? `output-${stepId}.${extension || "txt"}`, content };
}

function filenameWithSuffix(filename: string, suffix: number) {
  if (suffix <= 1) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename}-${suffix}`;
  return `${filename.slice(0, dot)}-${suffix}${filename.slice(dot)}`;
}

function uniqueFilename(filename: string, seen: Map<string, number>) {
  const next = (seen.get(filename) ?? 0) + 1;
  seen.set(filename, next);
  return filenameWithSuffix(filename, next);
}

function codeArtifactFromFence(language: string, filename: string | undefined, content: string, fallbackName: string) {
  const normalized = language.toLowerCase();
  if (normalized === "html" || /<!doctype html|<html/i.test(content)) {
    return { type: "html" as const, filename: filename ?? fallbackName.replace(/\.[^.]+$/, ".html"), content: extractHtmlSegment(content) ?? content.trim() };
  }

  const extension = LANGUAGE_EXTENSION_MAP[normalized] ?? normalized ?? "txt";
  const type = normalized === "json" ? "json" as const : "code" as const;
  return { type, filename: filename ?? fallbackName.replace(/\.[^.]+$/, `.${extension || "txt"}`), content: content.trim() };
}

function extractCodeArtifacts(result: string, stepId: string) {
  const artifacts: Array<{ type: Artifact["type"]; filename: string; content: string }> = [];
  const seenFilenames = new Map<string, number>();
  const codeBlockRegex = /```([^\r\n`]*)[ \t]*(?:\r?\n)([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = codeBlockRegex.exec(result)) !== null) {
    const { language, filename } = parseFenceHeader(match[1] || "");
    const content = match[2]?.trim() ?? "";
    if (content.length < 10) continue;
    const extension = (LANGUAGE_EXTENSION_MAP[language] ?? language) || "txt";
    const fallbackName = index === 0 ? `index.${extension || "txt"}` : `file-${stepId}-${index}.${extension || "txt"}`;
    const artifact = codeArtifactFromFence(language, filename, content, fallbackName);
    artifacts.push({ ...artifact, filename: uniqueFilename(artifact.filename, seenFilenames) });
    index++;
  }

  if (artifacts.length > 0) return artifacts;

  const primary = extractPrimaryCodeArtifact(result, stepId);
  return [{ ...primary, filename: uniqueFilename(primary.filename, seenFilenames) }];
}

function artifactLanguage(artifact: Artifact) {
  if (artifact.type === "html") return "html";
  if (artifact.type === "json") return "json";
  const extension = artifact.filename?.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    css: "css",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    py: "python",
    sh: "bash",
    ts: "typescript",
    tsx: "tsx",
  };
  return languageMap[extension ?? ""] ?? extension;
}

function artifactSender(artifact: Artifact) {
  if (artifact.type === "html" || artifact.type === "code" || artifact.type === "json") return "coder";
  if (artifact.type === "slides" || artifact.type === "document" || artifact.type === "markdown") return "refiner";
  return "worker";
}

function parseArtifactMetadata(metadata: unknown, fallback?: Record<string, unknown>) {
  if (typeof metadata !== "string" || !metadata.trim()) return fallback;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : fallback;
  } catch {
    return fallback;
  }
}

function hasInlineCodeArtifact(result: string) {
  return /```[^\r\n`]*[ \t]*(?:\r?\n)[\s\S]*?```|<!doctype html|<html[\s>]/i.test(result);
}

type DeliverableKind = "document" | "slides";

function stripMentions(text: string) {
  return text
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDeliverableKind(task: string): DeliverableKind | null {
  const normalized = stripMentions(task).replace(/\s+/g, "");
  const complaintPatterns = [
    /为什么.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
    /为何.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
    /不是.*(要|想).*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
    /不要.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
  ];
  if (complaintPatterns.some((pattern) => pattern.test(normalized))) return null;

  if (/(PPT|PPTX|幻灯片|演示文稿|演示稿|汇报稿|路演稿)/i.test(normalized)) return "slides";

  const deliverable = "(文档|报告|手册|方案|指南|PRD|需求|设计文档|技术文档|接口文档|用户手册|白皮书|材料|说明书|[\\u4e00-\\u9fa5A-Za-z0-9]{1,12}(报告|文档|方案|手册|指南))";
  const patterns = [
    new RegExp(`重新生成(一份|一个|一篇)?${deliverable}`),
    new RegExp(`重新(写|整理|创建|制作)(一份|一个|一篇)?${deliverable}`),
    new RegExp(`生成(一份|一个|一篇)?${deliverable}`),
    new RegExp(`写(一份|一个|一篇)?${deliverable}`),
    new RegExp(`整理(一份)?${deliverable}`),
    new RegExp(`创建(一份)?${deliverable}`),
    new RegExp(`制作(一份|一个|一篇)?${deliverable}`),
    new RegExp(`输出(一份|一个|一篇)?${deliverable}`),
    new RegExp(`帮我(写|生成|整理|做|制作|输出)(一个|一份|一篇)?${deliverable}`),
    new RegExp(`(起草|拟定|编写|撰写)(一份)?${deliverable}`),
  ];
  return patterns.some((pattern) => pattern.test(normalized)) ? "document" : null;
}

function firstHeading(markdown: string) {
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m);
  return heading?.[1]?.trim();
}

function cleanTitle(text: string, fallback: string) {
  const source = stripMentions(text)
    .replace(/^(请|帮我|麻烦|需要|生成|写|整理|创建|做|起草|拟定|编写)+/g, "")
    .replace(/[：:，,。.!！?？]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (source || fallback).slice(0, 28);
}

function filenameBase(title: string, fallback: string) {
  const base = title
    .replace(/[\\/:*?"<>|`~#%&{}$!@+'=]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || fallback;
}

function ensureDocumentMarkdown(summary: string, task: string) {
  const trimmed = summary.trim();
  const title = firstHeading(trimmed) ?? cleanTitle(task, "AI 生成文档");
  if (/^#{1,2}\s+/m.test(trimmed)) return { title, content: trimmed };
  return {
    title,
    content: `# ${title}\n\n${trimmed}`,
  };
}

function extractBulletCandidates(markdown: string) {
  const lines = markdown
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^#{1,4}\s+/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 120);
  return [...new Set(bullets)].slice(0, 12);
}

function buildSlidesMarkdown(summary: string, task: string) {
  const trimmed = summary.trim();
  const title = firstHeading(trimmed) ?? cleanTitle(task, "AI 生成演示稿");
  if (/^---+$/m.test(trimmed) || (trimmed.match(/^#{1,2}\s+/gm) ?? []).length >= 3) {
    return { title, content: trimmed };
  }

  const bullets = extractBulletCandidates(trimmed);
  const groups = [
    bullets.slice(0, 4),
    bullets.slice(4, 8),
    bullets.slice(8, 12),
  ].filter((items) => items.length > 0);

  const bodySections = groups.length > 0
    ? groups.map((items, index) => `## ${index === 0 ? "核心内容" : index === 1 ? "执行方案" : "补充说明"}\n\n${items.map((item) => `- ${item}`).join("\n")}`)
    : [`## 核心内容\n\n${trimmed}`];

  return {
    title,
    content: [`# ${title}\n\nAgentHub 多 Agent 协作生成`, ...bodySections, "## 下一步\n\n- 根据反馈继续补充细节\n- 在工作台中预览、编辑并导出 PPTX"].join("\n\n---\n\n"),
  };
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

    const steps: Array<{ id: string; task: string; result: string }> = [];
    const b = payload.broadcast;
    const timeout = payload.timeoutMs ?? DEFAULT_TIMEOUT;
    let eventSequence = 0;
    const emit = (data: Record<string, unknown>) => {
      b?.({
        conversationId: payload.conversationId,
        jobId,
        timestamp: Date.now(),
        sequence: ++eventSequence,
        ...data,
      });
    };
    const activeAgents = payload.mentions.length > 0 ? payload.mentions : ["planner"];
    const visibleAgentForRole = (role: string) => resolveVisibleAgentForRole(role, activeAgents);
    let runtimeProfiles: Awaited<ReturnType<typeof resolveAgentRuntimeProfiles>> = [];
    try {
      runtimeProfiles = await resolveAgentRuntimeProfiles(payload.userId, activeAgents);
    } catch (err) {
      logger.warn(`Failed to load agent runtime profiles: ${err}`, 'MemoryQueue');
    }
    const runtimePrompt = buildAgentRuntimePrompt(runtimeProfiles);
    const runtimeAdapterOverrides = chooseRuntimeAdapterOverrides(runtimeProfiles);
    const runtimeModel = runtimeAdapterOverrides?.model;
    const adapter = createAdapterFromEnv(runtimeAdapterOverrides);
    const orchestrator = createOrchestrator(adapter);

    const configuredProfiles = runtimeProfiles.filter((profile) => profile.configured);
    const readyPrivateProfiles = configuredProfiles.filter((profile) => !isInheritedProvider(profile.provider) && !getPrivateLLMConfigIssue(profile));
    const incompletePrivateProfiles = configuredProfiles.filter((profile) => !isInheritedProvider(profile.provider) && getPrivateLLMConfigIssue(profile));

    if (configuredProfiles.length > 0) {
      const loadedNames = configuredProfiles.map((profile) => profile.name).join("、");
      const privateNames = readyPrivateProfiles.map((profile) => `${profile.name}:${profile.model}`).join("、");
      const incompleteNames = incompletePrivateProfiles
        .map((profile) => `${profile.name}(${getPrivateLLMConfigIssue(profile)})`)
        .join("、");
      const statusParts = [
        `已加载自建 Agent：${loadedNames}`,
        privateNames ? `私有 LLM：${privateNames}` : runtimeModel ? `模型偏好：${runtimeModel}` : "继承系统模型",
        incompleteNames ? `配置不完整，已回退系统模型：${incompleteNames}` : "",
      ].filter(Boolean);
      emit({
        type: "agent:status",
        agentId: activeAgents.find((name) => name !== "planner") ?? activeAgents[0] ?? "planner",
        status: "acting",
        lastOutput: statusParts.join("；"),
      });
    }

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
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
          emit({ type: "agent:status", agentId: visibleAgentForRole("planner"), status: "acting", lastOutput: systemText });
          emit({ type: "agent:stream", agentId: visibleAgentForRole("planner"), chunk: systemText, messageId: `${jobId}-system` });
          break;
        }

        case "plan": {
          const plan = msg.steps ?? msg;
          emit({ type: "plan:created", plan });
          const stepsArr = plan as Array<{ id: string; task: string }>;
          if (Array.isArray(stepsArr)) {
            for (const s of stepsArr) {
              emit({ type: "step:started", stepId: s.id, task: s.task, agentRole: visibleAgentForRole("planner") });
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
              emit({
                type: "agent:step",
                agentId: visibleAgentForRole("worker"),
                iteration: step.iteration ?? 0,
                thought: step.thought ?? "",
                action: step.action,
                observation: step.observation,
                isFinal: step.isFinal ?? false,
              });
            } catch {
              emit({ type: "agent:stream", agentId: visibleAgentForRole("worker"), chunk, messageId: `${jobId}-stream` });
            }
          } else if (chunk.startsWith("[任务接收确认]")) {
            const agentRole = chunk.includes("调研") ? "researcher"
              : chunk.includes("润色") || chunk.includes("整合") ? "refiner"
              : "worker";
            emit({ type: "agent:stream", agentId: visibleAgentForRole(agentRole), chunk, messageId: `${jobId}-receipt` });
          } else if (chunk.startsWith("## ") && chunk.includes("工作报告")) {
            const agentRole = chunk.includes("调研") ? "researcher"
              : chunk.includes("审查") ? "critic"
              : chunk.includes("优化") || chunk.includes("润色") ? "refiner"
              : "worker";
            emit({ type: "agent:stream", agentId: visibleAgentForRole(agentRole), chunk, messageId: `${jobId}-report` });
          } else if (chunk.startsWith("## ") && chunk.includes("评审结果")) {
            emit({ type: "agent:stream", agentId: visibleAgentForRole("critic"), chunk, messageId: `${jobId}-critic` });
          } else if (chunk.startsWith("## 任务拆解") || chunk.startsWith("## 任务分配")) {
            emit({ type: "agent:stream", agentId: visibleAgentForRole("planner"), chunk, messageId: `${jobId}-plan-detail` });
          } else {
            emit({ type: "agent:stream", agentId: visibleAgentForRole("worker"), chunk, messageId: `${jobId}-stream` });
          }
          break;
        }

        case "critic": {
          const criticData = msg as Record<string, unknown>;
          emit({
            type: "critic:review",
            stepId: (criticData.stepId as string) ?? "",
            valid: (criticData.valid as boolean) ?? false,
            score: (criticData.score as number) ?? 0,
            issues: criticData.issues as string,
            suggestion: criticData.suggestion as string,
          });
          break;
        }

        case "retry": {
          emit({
            type: "retry:requested",
            stepId: (msg.stepId as string) ?? "",
            suggestion: (msg.suggestion as string) ?? "",
          });
          break;
        }

        case "research": {
          const r = String((msg as unknown) ?? msg);
          emit({ type: "agent:stream", agentId: visibleAgentForRole("researcher"), chunk: r, messageId: `${jobId}-research` });
          break;
        }

        case "refine": {
          emit({ type: "agent:stream", agentId: visibleAgentForRole("refiner"), chunk: String((msg as unknown) ?? msg), messageId: `${jobId}-refine` });
          break;
        }

        case "final": {
          const final = msg;
          const stepResults = (final.stepResults as Array<{ id: string; task: string; result: string; toolUsed?: string }>) ?? [];
          const publishedArtifactTypes = new Set<Artifact["type"]>();

          for (const sr of stepResults) {
            emit({
              type: "step:completed",
              stepId: sr.id, task: sr.task, result: sr.result,
              toolUsed: sr.toolUsed ?? undefined,
              duration: undefined,
            });
          }

          const publishArtifactMessage = async (artifact: Artifact) => {
            const storedArtifact = await jobRepo.addArtifact(jobId, {
              type: artifact.type,
              content: artifact.content,
              filename: artifact.filename,
              metadata: { ...(artifact.metadata ?? {}), topicTitle: payload.task },
            });
            const persistedArtifact: Artifact = {
              ...artifact,
              id: storedArtifact.id,
              jobId: storedArtifact.jobId,
              type: storedArtifact.type as Artifact["type"],
              content: storedArtifact.content,
              filename: storedArtifact.filename ?? undefined,
              metadata: parseArtifactMetadata(storedArtifact.metadata, artifact.metadata),
              createdAt: storedArtifact.createdAt.getTime(),
            };
            publishedArtifactTypes.add(persistedArtifact.type);

            emit({ type: "artifact:created", artifact: persistedArtifact });
            if (!payload.conversationId) return;

            const sender = visibleAgentForRole(artifactSender(persistedArtifact));
            const artifactMsg = await messageRepo.createAndUpdateConv({
              conversationId: payload.conversationId,
              type: "agent_message",
              sender,
              senderId: sender,
              content: persistedArtifact.content,
              payload: {
                kind: "artifact",
                artifactType: persistedArtifact.type,
                artifactId: persistedArtifact.id,
                filename: persistedArtifact.filename,
                language: artifactLanguage(persistedArtifact),
                jobId,
                topicTitle: payload.task,
                workflowRef: payload.workflowRef,
              },
            });
            emit({
              type: "message:created",
              message: {
                id: artifactMsg.id,
                conversationId: artifactMsg.conversationId,
                type: artifactMsg.type,
                sender: artifactMsg.sender,
                senderId: artifactMsg.senderId ?? undefined,
                content: artifactMsg.content,
                payload: {
                  kind: "artifact",
                  artifactType: persistedArtifact.type,
                  artifactId: persistedArtifact.id,
                  filename: persistedArtifact.filename,
                  language: artifactLanguage(persistedArtifact),
                  jobId,
                  topicTitle: payload.task,
                  workflowRef: payload.workflowRef,
                },
                mentions: [],
                timestamp: artifactMsg.timestamp.getTime(),
              },
            });
          };

          for (const sr of stepResults) {
            const hasCodeArtifact = sr.toolUsed === "code" || hasInlineCodeArtifact(sr.result);
            if (hasCodeArtifact || sr.toolUsed === "search") {
              const codeArtifacts = hasCodeArtifact
                ? extractCodeArtifacts(sr.result, sr.id)
                : [{ type: "markdown" as const, filename: `research-${sr.id}.md`, content: sr.result }];
              let artifactIndex = 0;
              for (const codeArtifact of codeArtifacts) {
                await publishArtifactMessage({
                  id: `artifact-${jobId}-${sr.id}-${artifactIndex}`,
                  jobId,
                  type: codeArtifact.type,
                  filename: codeArtifact.filename,
                  content: codeArtifact.content,
                  metadata: { stepId: sr.id, stepTask: sr.task },
                  createdAt: Date.now(),
                });
                artifactIndex++;
              }
            }
          }

          const codeBlockRegex = /```([^\r\n`]*)[ \t]*(?:\r?\n)([\s\S]*?)```/g;
          const summaryText = final.summary as string ?? "";
          let match: RegExpExecArray | null;
          let codeIdx = 0;
          while ((match = codeBlockRegex.exec(summaryText)) !== null) {
            const { language: lang, filename: explicitFilename } = parseFenceHeader(match[1] || "");
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
            const filename = explicitFilename ?? (extMap[ext] ? `index.${ext}` : `file-${codeIdx}.${ext || "txt"}`);
            await publishArtifactMessage({
              id: `artifact-${jobId}-code-${codeIdx}`,
              jobId,
              type: artifactType,
              filename,
              content: artifactType === "html" ? extractHtmlSegment(code) ?? code.trim() : code.trim(),
              createdAt: Date.now(),
            });
            codeIdx++;
          }

          const summaryTextForDeliverable = String(final.summary || "").trim();
          const deliverableKind = detectDeliverableKind(payload.task);
          let deliverableArtifactCreated = false;
          let deliverableTitle = "";
          if (summaryTextForDeliverable && deliverableKind === "document" && !publishedArtifactTypes.has("document")) {
            const document = ensureDocumentMarkdown(summaryTextForDeliverable, payload.task);
            deliverableTitle = document.title;
            await publishArtifactMessage({
              id: `artifact-${jobId}-document`,
              jobId,
              type: "document",
              filename: `${filenameBase(document.title, "agenthub-document")}.md`,
              content: document.content,
              metadata: { autoDeliverable: true, deliverableKind: "document" },
              createdAt: Date.now(),
            });
            deliverableArtifactCreated = true;
          }

          if (summaryTextForDeliverable && deliverableKind === "slides" && !publishedArtifactTypes.has("slides")) {
            const slides = buildSlidesMarkdown(summaryTextForDeliverable, payload.task);
            deliverableTitle = slides.title;
            await publishArtifactMessage({
              id: `artifact-${jobId}-slides`,
              jobId,
              type: "slides",
              filename: `${filenameBase(slides.title, "agenthub-slides")}.slides.md`,
              content: slides.content,
              metadata: { autoDeliverable: true, deliverableKind: "slides" },
              createdAt: Date.now(),
            });
            deliverableArtifactCreated = true;
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
              const summarySender = visibleAgentForRole("refiner");
              const finalSummaryText = deliverableArtifactCreated
                ? `${deliverableKind === "slides" ? "演示稿" : "文档"}已生成：${deliverableTitle || cleanTitle(payload.task, "AI 生成文档")}\n\n文件已放入上方产物卡片，可预览、继续编辑或导出。`
                : String(final.summary).slice(0, 2000);
              const summaryPayload = {
                ...(final as Record<string, unknown>),
                kind: "final_summary",
                jobId,
                workflowRef: payload.workflowRef,
                ...(deliverableKind ? { deliverableKind, deliverableArtifactCreated } : {}),
              };
              const summaryMsg = await messageRepo.createAndUpdateConv({
                conversationId: payload.conversationId,
                type: "agent_message",
                sender: summarySender,
                senderId: summarySender,
                content: finalSummaryText,
                payload: summaryPayload,
              });
              emit({ type: "message:created", message: { id: summaryMsg.id, conversationId: summaryMsg.conversationId, type: summaryMsg.type, sender: summaryMsg.sender, senderId: summaryMsg.senderId ?? undefined, content: summaryMsg.content, payload: summaryPayload, mentions: [], timestamp: summaryMsg.timestamp.getTime() } });
            }
          }

          emit({
            type: "job:completed",
            summary: final.summary as string ?? "",
            stats: {},
          });

          this.statuses.set(jobId, "completed");
          const jobResult: JobResult = { jobId, status: "completed", summary: final.summary as string, steps };
          for (const handler of this.handlers) handler(jobResult);
          break;
        }
      }
        }, payload.plan, payload.edges, payload.conversationId, controller.signal, runtimePrompt
        ),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => {
          reject(new DOMException("Job cancelled", "AbortError"));
        })),
      ]);

    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.name === "CanceledError");
      if (isAbort) {
        const errorMessage = timedOut ? `Job timed out after ${Math.round(timeout / 1000)}s` : "Job cancelled by user";
        logger.info(`Job ${jobId} ${timedOut ? "timed out" : "cancelled"}`, 'MemoryQueue');
        this.statuses.set(jobId, "failed");
        jobRepo.updateStatus(jobId, "failed", { error: errorMessage }).catch(() => {});
        emit({ type: "job:failed", error: timedOut ? "任务执行超时，已自动中止。可以缩小范围或改用产物型快速生成。" : "Job cancelled" });
      } else {
        logger.error(`Job ${jobId} failed`, err as Error, 'Queue');
        jobRepo.updateStatus(jobId, "failed", { error: String(err) }).catch(() => {});
        this.statuses.set(jobId, "failed");
        emit({ type: "job:failed", error: String(err) });
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
