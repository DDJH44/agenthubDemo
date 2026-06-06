import type { IncomingMessage, ServerResponse } from "http";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { parseMentions, type PlanNode } from "@agenthub/shared";
import { createOrchestrator, type StreamEvent } from "../orchestrator/index";
import { createAdapterFromEnv, type AdapterConfig } from "@agenthub/adapter";
import { hashPassword, verifyPassword, createSession, deleteSession } from "../auth/session";
import { requireAuth } from "../auth/middleware";
import { userRepo } from "../db/repositories/user";
import { fileRepo } from "../db/repositories/file";
import { conversationRepo } from "../db/repositories/conversation";
import { userAgentConfigRepo } from "../db/repositories/user-agent-config";
import { jobRepo } from "../db/repositories/job";
import { knowledgeBaseRepo, documentRepo } from "../db/repositories/knowledge";
import { mcpRepo } from "../db/repositories/mcp";
import { prisma } from "../db/index";
import { mcpManager } from "../mcp/manager";
import { workspaceFileRepo } from "../db/repositories/workspace-file";
import { deploymentTargetRepo, type DeploymentTargetRecord } from "../db/repositories/deployment-target";
import { config, resolveCorsOrigin } from "../config";
import { logger } from "../utils/logger";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync, statSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { promisify } from "util";
import { decryptSecret, encryptSecret, generateSshKeyPair } from "../deploy/credentials";
import { writeTemporarySshKey } from "../deploy/ssh-key-file";
import { parseFileContent } from "../knowledge/chunker";

interface RequestWithParams extends IncomingMessage {
  params?: Record<string, string>;
}

interface AssistantAttachmentPayload {
  name?: string;
  kind?: "file" | "image";
  mime?: string;
  size?: number;
  dataUrl?: string;
}

type TeamInviteStatus = "pending" | "accepted" | "declined" | "cancelled";

interface StoredTeamInvite {
  id: string;
  email: string;
  name?: string;
  contactId?: string;
  source: "settings" | "right-panel" | "contacts";
  fromEmail: string;
  fromName: string;
  status: TeamInviteStatus;
  invitedAt: number;
  respondedAt?: number;
}

type RouteHandler = (req: RequestWithParams, res: ServerResponse) => Promise<void>;

const routes: Record<string, RouteHandler> = {};
const paramRoutes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: RouteHandler }> = [];
const execFileAsync = promisify(execFile);
const TEAM_INVITES_PATH = path.join(config.files.uploadDir, "team-invites.json");

export function registerRoute(method: string, path: string, handler: RouteHandler) {
  // Check if path has params (e.g. /api/files/:id/download)
  if (path.includes(":")) {
    const keys: string[] = [];
    const pattern = path.replace(/:([^/]+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    });
    paramRoutes.push({ method: method.toUpperCase(), pattern: new RegExp(`^${pattern}$`), keys, handler });
  } else {
    routes[`${method.toUpperCase()} ${path}`] = handler;
  }
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  // Try exact match first
  let handler = routes[key];
  const params: Record<string, string> = {};

  // Try param routes if no exact match
  if (!handler) {
    for (const route of paramRoutes) {
      if (req.method !== route.method) continue;
      const match = url.pathname.match(route.pattern);
      if (match) {
        handler = route.handler;
        route.keys.forEach((k, i) => { params[k] = match[i + 1]; });
        break;
      }
    }
  }

  if (!handler) return false;

  // Attach params to request for handlers
  (req as RequestWithParams).params = params;

  try {
    await handler(req, res);
    return true;
  } catch (err) {
    logger.error(`Error handling ${key}`, err as Error, 'API');
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
    }
    return true;
  }
}

function normalizeEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function readTeamInvites(): StoredTeamInvite[] {
  try {
    if (!existsSync(TEAM_INVITES_PATH)) return [];
    const parsed = JSON.parse(readFileSync(TEAM_INVITES_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTeamInvites(invites: StoredTeamInvite[]) {
  mkdirSync(path.dirname(TEAM_INVITES_PATH), { recursive: true });
  writeFileSync(TEAM_INVITES_PATH, JSON.stringify(invites, null, 2), "utf-8");
}

function publicTeamInvite(invite: StoredTeamInvite) {
  return {
    id: invite.id,
    email: invite.email,
    name: invite.name,
    contactId: invite.contactId,
    source: invite.source,
    fromEmail: invite.fromEmail,
    fromName: invite.fromName,
    status: invite.status,
    invitedAt: invite.invitedAt,
    respondedAt: invite.respondedAt,
  };
}

/* ── POST /api/assistant ── */
registerRoute("POST", "/api/assistant", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req);
  const { text, history, systemPrompt, attachments } = body as {
    text?: string;
    history?: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    attachments?: AssistantAttachmentPayload[];
  };

  if (!text) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 text 参数" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": resolveCorsOrigin(req.headers.origin),
    Vary: "Origin",
  });

  const emit = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const imageAttachments = Array.isArray(attachments)
      ? attachments.filter((attachment) => (
          attachment.kind === "image" &&
          typeof attachment.dataUrl === "string" &&
          /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(attachment.dataUrl) &&
          (attachment.size ?? 0) <= 8 * 1024 * 1024
        ))
      : [];

    const systemContent = `你是 AgentHub 的 AI 智能助手，用户的 AI 协作伙伴。中文交流，语气专业但不生硬。

=== 意图判断优先级 ===
1. 用户明确要求生成、撰写、整理、创建文档/报告/方案/PRD/手册/指南时，才进入“文档类任务回复模板”。
2. 用户要求描述、识别、分析图片，且本轮消息包含图片时，直接观察图片并回答画面内容；不要生成文档，不要套用文档模板。
3. 普通追问、解释、纠错、闲聊、图片描述、代码问答，都按“非文档类对话”回答。

=== 文档类任务回复模板（仅在明确文档请求时使用）===

当用户要求生成文档、PRD、方案、手册、报告时，按以下模板回复：

收到，正在为你生成[文档类型]...

文档已完成。

核心内容包括：

✓ [章节1]
✓ [章节2]
✓ [章节3]
...

预计开发周期/工作量：
[X]~[Y]周

我认为风险最高的是/最需要注意的是：
[关键风险或注意点]。

完整文档如下：

# [文档标题]

## [章节1]
[内容]

## [章节2]
[内容]

...

---
📌 总结：[一句话核心结论]
🚀 接下来你可以选择：
① [后续选项1]
② [后续选项2]
③ [后续选项3]
回复数字即可继续。

=== 非文档类对话 ===
简短问答直接回答，代码问题给出示例，技术讨论分享见解。
图片描述请求要先概括画面，再列出可见主体、文字、布局、颜色和可能用途；如果图片不可读取，只说明当前只能看到附件元信息。

=== 禁止 ===
- 不要说"无法生成文件"、"请复制到 Word"
- 非文档请求不要说“文档已生成”
- 非文档请求不要输出“文件在这里”或文档卡片式话术
- 文档请求不要跳过模板结构直接输出文档正文`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt ? `${systemContent}\n\n=== 用户自定义规则 ===\n${systemPrompt}` : systemContent },
    ];
    if (history) {
      for (const h of history.slice(-10)) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    const userContent: string | ChatCompletionContentPart[] = imageAttachments.length > 0
      ? [
          { type: "text", text },
          ...imageAttachments.map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.dataUrl as string, detail: "auto" as const },
          })),
        ]
      : text;
    messages.push({ role: "user", content: userContent });

    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    logger.info(`[Assistant] Streaming with model=${model}, messages=${messages.length}`, "Assistant");

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const stream = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      messages,
    }, { signal: controller.signal });

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) emit({ type: "stream", msg: delta });
    }
    emit({ type: "done" });
  } catch (err) {
    if ((err as Error).name === "AbortError") { res.end(); return; }
    logger.error("[Assistant] Error", err as Error, "Assistant");
    emit({ type: "error", content: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    res.end();
  }
});

/* ── POST /api/chat ── */
registerRoute("POST", "/api/chat", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req);
  const { text, conversationId } = body as { text?: string; conversationId?: string };
  const { cleanText } = parseMentions(text || "");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const emit = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const adapter = createAdapterFromEnv();

  try {
    await adapter.connect();
    const orchestrator = createOrchestrator(adapter);
    const result = await orchestrator.run(cleanText, (event: StreamEvent) => emit(event), undefined, undefined, conversationId);
    emit({ type: "done", result });
  } catch (err) {
    emit({ type: "error", content: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    await adapter.disconnect();
    res.end();
  }
});

/* ── POST /api/run ── */
registerRoute("POST", "/api/run", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req);
  const { task, plan, edges, conversationId } = body as { task?: string; plan?: PlanNode[]; edges?: Array<{ source: string; target: string; label?: string }>; conversationId?: string };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": resolveCorsOrigin(req.headers.origin),
    Vary: "Origin",
  });

  const emit = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const adapter = createAdapterFromEnv();

  try {
    await adapter.connect();
    const orchestrator = createOrchestrator(adapter);
    const result = await orchestrator.run(task || "", (event: StreamEvent) => emit(event), plan, edges, conversationId);
    emit({ type: "done", result });
  } catch (err) {
    emit({ type: "error", content: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    await adapter.disconnect();
    res.end();
  }
});

/* ── GET /api/health ── */
registerRoute("GET", "/api/health", async (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "agenthub-server" }));
});

/* ── GET /api/config/status ── */
registerRoute("GET", "/api/config/status", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    adapter: {
      type: config.adapter.type,
      model: process.env.LLM_MODEL ?? config.adapter.model,
      baseURL: process.env.OPENAI_BASE_URL ?? null,
      apiKeyConfigured: !!process.env.OPENAI_API_KEY,
      apiKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 6) + "..." : null,
    },
  }));
});

/* ── Team invites ── */
registerRoute("GET", "/api/team-invites/incoming", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const email = normalizeEmail(user.email);
  const invites = email
    ? readTeamInvites().filter((invite) => invite.email === email && invite.status === "pending")
    : [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ invites: invites.map(publicTeamInvite) }));
});

registerRoute("GET", "/api/team-invites/outgoing", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const fromEmail = normalizeEmail(user.email);
  const invites = fromEmail
    ? readTeamInvites().filter((invite) => invite.fromEmail === fromEmail && invite.status === "pending")
    : [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ invites: invites.map(publicTeamInvite) }));
});

registerRoute("POST", "/api/team-invites", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as {
    id?: string;
    email?: string;
    name?: string;
    contactId?: string;
    source?: StoredTeamInvite["source"];
  };
  const email = normalizeEmail(body.email);
  const fromEmail = normalizeEmail(user.email);
  if (!email || !fromEmail) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid target email required" }));
    return;
  }
  if (email === fromEmail) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "cannot invite yourself" }));
    return;
  }

  const now = Date.now();
  const source = body.source === "settings" || body.source === "right-panel" || body.source === "contacts" ? body.source : "settings";
  const invites = readTeamInvites();
  const existing = invites.find((invite) => invite.email === email && invite.fromEmail === fromEmail && invite.status === "pending");
  if (existing) {
    const updated: StoredTeamInvite = {
      ...existing,
      name: body.name?.trim() || existing.name,
      contactId: body.contactId || existing.contactId,
      source,
    };
    writeTeamInvites(invites.map((invite) => (invite.id === existing.id ? updated : invite)));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ invite: publicTeamInvite(updated), duplicate: true }));
    return;
  }

  const invite: StoredTeamInvite = {
    id: body.id || randomUUID(),
    email,
    name: body.name?.trim() || undefined,
    contactId: body.contactId,
    source,
    fromEmail,
    fromName: user.name,
    status: "pending",
    invitedAt: now,
  };
  writeTeamInvites([invite, ...invites]);
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ invite: publicTeamInvite(invite), duplicate: false }));
});

registerRoute("POST", "/api/team-invites/:id/accept", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const inviteId = (req as RequestWithParams).params?.id;
  const email = normalizeEmail(user.email);
  const invites = readTeamInvites();
  const invite = invites.find((item) => item.id === inviteId && item.email === email && item.status === "pending");
  if (!invite) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invite not found" }));
    return;
  }
  const accepted: StoredTeamInvite = { ...invite, status: "accepted", respondedAt: Date.now() };
  writeTeamInvites(invites.map((item) => (item.id === invite.id ? accepted : item)));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ invite: publicTeamInvite(accepted) }));
});

registerRoute("POST", "/api/team-invites/:id/decline", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const inviteId = (req as RequestWithParams).params?.id;
  const email = normalizeEmail(user.email);
  const invites = readTeamInvites();
  const invite = invites.find((item) => item.id === inviteId && item.email === email && item.status === "pending");
  if (!invite) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invite not found" }));
    return;
  }
  const declined: StoredTeamInvite = { ...invite, status: "declined", respondedAt: Date.now() };
  writeTeamInvites(invites.map((item) => (item.id === invite.id ? declined : item)));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ invite: publicTeamInvite(declined) }));
});

registerRoute("DELETE", "/api/team-invites/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const inviteId = (req as RequestWithParams).params?.id;
  const fromEmail = normalizeEmail(user.email);
  const invites = readTeamInvites();
  writeTeamInvites(invites.map((invite) => (
    invite.id === inviteId && invite.fromEmail === fromEmail && invite.status === "pending"
      ? { ...invite, status: "cancelled", respondedAt: Date.now() }
      : invite
  )));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

async function writeEnvVar(envPath: string, key: string, value: string) {
  const fs = await import("fs");
  let envContent = "";
  try { envContent = fs.readFileSync(envPath, "utf-8"); } catch { envContent = ""; }
  const lines = envContent.split("\n");
  let found = false;
  const updated = lines.map((line: string) => {
    if (line.startsWith(`${key}=`)) { found = true; return `${key}=${value}`; }
    return line;
  });
  if (!found) updated.push(`${key}=${value}`);
  fs.writeFileSync(envPath, updated.join("\n"), "utf-8");
  process.env[key] = value;
}

/* ── POST /api/config/api-key ── */
registerRoute("POST", "/api/config/api-key", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req);
  const { key, baseURL, model } = body as { key?: string; baseURL?: string; model?: string };
  const path = await import("path");
  const envPath = path.resolve(process.cwd(), "../../.env.local");

  if (key !== undefined) {
    if (typeof key !== "string" || key.trim().length < 10) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid API key (min 10 chars)" }));
      return;
    }
    await writeEnvVar(envPath, "OPENAI_API_KEY", key.trim());
  }
  if (baseURL !== undefined) {
    if (typeof baseURL !== "string" || !baseURL.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid baseURL" }));
      return;
    }
    await writeEnvVar(envPath, "OPENAI_BASE_URL", baseURL.trim());
  }
  if (model !== undefined) {
    if (typeof model !== "string" || !model.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid model" }));
      return;
    }
    await writeEnvVar(envPath, "LLM_MODEL", model.trim());
    config.adapter.model = model.trim();
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    success: true,
    apiKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 6) + "..." : null,
    baseURL: process.env.OPENAI_BASE_URL ?? null,
    model: process.env.LLM_MODEL ?? config.adapter.model,
  }));
});

/* ── GET /api/stats/task-trend ── */
registerRoute("GET", "/api/stats/task-trend", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const trend = await jobRepo.getTaskTrend("default", days);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ trend }));
});

/* ── POST /api/auth/register ── */
registerRoute("POST", "/api/auth/register", async (req, res) => {
  const body = await readJsonBody(req);
  const { name, email, password } = body as { name?: string; email?: string; password?: string };

  if (!name || !email || !password) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "name, email, password are required" }));
    return;
  }
  if (password.length < 6) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Password must be at least 6 characters" }));
    return;
  }

  const existing = await userRepo.getByEmail(email);
  if (existing) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Email already registered" }));
    return;
  }

  const hashed = await hashPassword(password);
  const user = await userRepo.create({ name, email, password: hashed });

  // 为新用户创建默认智能体
  const defaultAgents = [
    { name: "PM Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是项目管理智能体。负责分析用户需求、拆解任务、制定执行计划，并协调其他智能体完成项目。你擅长需求分析、任务分解、进度跟踪和风险管理。用中文回复。" }), permissions: JSON.stringify(["chat", "task"]) },
    { name: "Frontend Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是前端开发智能体。精通 HTML、CSS、JavaScript、TypeScript、React、Vue、Next.js 等前端技术栈。你负责实现用户界面、交互逻辑和响应式设计。生成的代码要完整可运行，注重用户体验和视觉效果。用中文回复。" }), permissions: JSON.stringify(["chat", "task", "file"]) },
    { name: "Backend Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是后端开发智能体。精通 Node.js、Python、Go、数据库设计、API 开发、系统架构。你负责设计数据模型、开发 RESTful API、处理业务逻辑和性能优化。用中文回复。" }), permissions: JSON.stringify(["chat", "task", "file"]) },
    { name: "Design Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是 UI/UX 设计智能体。精通界面设计、用户体验、配色方案、布局设计。你负责提供设计建议、优化界面视觉效果、确保设计一致性和可用性。用中文回复。" }), permissions: JSON.stringify(["chat"]) },
    { name: "Test Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是测试智能体。精通单元测试、集成测试、端到端测试。你负责编写测试用例、发现 bug、验证功能完整性、提供测试报告。用中文回复。" }), permissions: JSON.stringify(["chat", "task"]) },
  ];
  for (const agent of defaultAgents) {
    await userAgentConfigRepo.create({ userId: user.id, ...agent });
  }

  const { token, expiresAt } = await createSession(user.id);

  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    token,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    expiresAt: expiresAt.getTime(),
  }));
});

/* ── POST /api/auth/login ── */
registerRoute("POST", "/api/auth/login", async (req, res) => {
  const body = await readJsonBody(req);
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "email and password are required" }));
    return;
  }

  const user = await userRepo.getByEmail(email);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid email or password" }));
    return;
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid email or password" }));
    return;
  }

  const { token, expiresAt } = await createSession(user.id);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    token,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    expiresAt: expiresAt.getTime(),
  }));
});

/* ── POST /api/auth/logout ── */
registerRoute("POST", "/api/auth/logout", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const authHeader = req.headers.authorization;
  const token = authHeader?.slice(7);
  if (token) await deleteSession(token);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── GET /api/auth/me ── */
registerRoute("GET", "/api/auth/me", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ user }));
});

/* ── GET /api/users ── */
registerRoute("GET", "/api/users", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const search = url.searchParams.get("search");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  try {
    const result = search
      ? await userRepo.search(search, { cursor, limit })
      : await userRepo.listAll(user.id, { cursor, limit });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      users: result.users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt?.getTime() ?? 0,
      })),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    }));
  } catch (_err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to list users" }));
  }
});

/* ── POST /api/conversations/:id/files (upload) ── */
registerRoute("POST", "/api/conversations/:id/files", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const convId = (req as RequestWithParams).params?.id;
  if (!convId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "conversation id required" }));
    return;
  }

  // Parse multipart form manually (lightweight, no formidable dependency issues)
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "multipart/form-data required" }));
    return;
  }

  const boundary = contentType.split("boundary=")[1];
  if (!boundary) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing boundary" }));
    return;
  }

  // Collect body chunks
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);

  // Parse multipart
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(boundaryBuf) + boundaryBuf.length + 2; // skip \r\n

  while (start < body.length) {
    const end = body.indexOf(boundaryBuf, start);
    if (end === -1) break;
    parts.push(body.slice(start, end - 2)); // -2 for \r\n before boundary
    start = end + boundaryBuf.length + 2;
  }

  const uploadedFiles = [];

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerStr = part.slice(0, headerEnd).toString("utf-8");
    const fileData = part.slice(headerEnd + 4);

    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const typeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    if (!filenameMatch) continue; // skip non-file parts

    const rawFileName = filenameMatch[1];
    const mimeType = typeMatch ? typeMatch[1].trim() : "application/octet-stream";

    // Sanitize filename to prevent path traversal
    const fileName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._\-一-鿿]/g, "_");

    // Check file size limit
    const maxSize = config.files.maxSizeMb * 1024 * 1024;
    if (fileData.length > maxSize) {
      continue;
    }

    // Save file
    const uploadDir = path.join(config.files.uploadDir, convId);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const fileId = crypto.randomUUID();
    const filePath = path.join(convId, `${fileId}_${fileName}`);
    const fullPath = path.join(config.files.uploadDir, filePath);

    const ws = createWriteStream(fullPath);
    ws.write(fileData);
    ws.end();
    await new Promise<void>((resolve) => ws.on("finish", resolve));

    const fileEntity = await fileRepo.create({
      conversationId: convId,
      uploaderId: user.id,
      name: fileName,
      path: filePath,
      size: fileData.length,
      mimeType,
    });

    uploadedFiles.push({
      id: fileEntity.id,
      conversationId: fileEntity.conversationId,
      uploaderId: fileEntity.uploaderId,
      name: fileEntity.name,
      size: fileEntity.size,
      mimeType: fileEntity.mimeType,
      createdAt: fileEntity.createdAt.getTime(),
    });
  }

  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ files: uploadedFiles }));
});

/* ── GET /api/files/:id/download ── */
registerRoute("GET", "/api/files/:id/download", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const fileId = (req as RequestWithParams).params?.id;
  if (!fileId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "file id required" }));
    return;
  }

  const file = await fileRepo.getById(fileId);
  if (!file) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  // Check access
  const conv = await conversationRepo.getById(file.conversationId);
  if (!conv) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Conversation not found" }));
    return;
  }

  let participants: string[] = [];
  try { participants = JSON.parse(conv.participants ?? "[]"); } catch {}
  if (!participants.includes(user.id)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Access denied" }));
    return;
  }

  const fullPath = path.join(config.files.uploadDir, file.path);
  if (!existsSync(fullPath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "File not found on disk" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": file.mimeType,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
    "Content-Length": String(file.size),
  });

  const readStream = createReadStream(fullPath);
  readStream.on("error", (err) => {
    logger.error(`File read error: ${file.path}`, err, 'API');
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to read file" }));
    }
  });
  readStream.pipe(res);
});

/* ── GET /api/download/:id (静态部署包下载) ── */
registerRoute("GET", "/api/download/:id", async (req, res) => {
  const deployId = (req as RequestWithParams).params?.id;
  if (!deployId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "deployId required" }));
    return;
  }

  const outputDir = path.join(process.cwd(), "deploy-output");
  const deployDir = path.join(outputDir, deployId);

  if (!existsSync(deployDir)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Deploy package not found" }));
    return;
  }

  const zipPath = path.join(deployDir, "bundle.zip");
  const tarPath = path.join(deployDir, "bundle.tar.gz");
  const bundlePath = existsSync(zipPath) ? zipPath : (existsSync(tarPath) ? tarPath : null);

  if (bundlePath) {
    const stat = statSync(bundlePath);
    const ext = bundlePath.endsWith(".zip") ? ".zip" : ".tar.gz";
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${deployId}${ext}"`,
      "Content-Length": String(stat.size),
    });
    const readStream = createReadStream(bundlePath);
    readStream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read bundle" }));
      }
    });
    readStream.pipe(res);
    return;
  }

  const files = readdirSync(deployDir).filter((f) => f !== "bundle.tar.gz" && f !== "bundle.zip");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    deployId,
    files: files.map((f) => {
      const fp = path.join(deployDir, f);
      try {
        return { name: f, size: statSync(fp).size };
      } catch {
        return { name: f, size: 0 };
      }
    }),
  }));
});

/* ── GET /api/preview/:id (Mock Preview 预览) ── */
registerRoute("GET", "/api/preview/:id", async (req, res) => {
  const deployId = (req as RequestWithParams).params?.id;
  if (!deployId || !/^[a-zA-Z0-9._-]+$/.test(deployId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid deployId required" }));
    return;
  }

  const deployDir = path.join(process.cwd(), "deploy-output", deployId);
  if (!existsSync(deployDir)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Preview not found" }));
    return;
  }

  const candidates = ["index.html", "landing-page.html"];
  const files = readdirSync(deployDir).filter((file) => file.endsWith(".html"));
  const htmlFile = candidates.find((file) => existsSync(path.join(deployDir, file))) ?? files[0];

  if (!htmlFile) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="zh-CN"><body><h1>AgentHub Preview</h1><p>${deployId}</p></body></html>`);
    return;
  }

  const fullPath = path.join(deployDir, htmlFile);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  createReadStream(fullPath).pipe(res);
});

/* ── DELETE /api/files/:id ── */
registerRoute("DELETE", "/api/files/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const fileId = (req as RequestWithParams).params?.id;
  if (!fileId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "file id required" }));
    return;
  }

  const file = await fileRepo.getById(fileId);
  if (!file) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  // Delete from disk
  const fullPath = path.join(config.files.uploadDir, file.path);
  try { if (existsSync(fullPath)) unlinkSync(fullPath); } catch {}

  await fileRepo.delete(fileId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

function publicDeploymentTarget(target: DeploymentTargetRecord) {
  return {
    id: target.id,
    name: target.name,
    type: target.type,
    host: target.host,
    port: target.port,
    username: target.username,
    deployPath: target.deployPath,
    publicUrl: target.publicUrl,
    authType: target.authType,
    publicKey: target.publicKey,
    postDeployCommand: target.postDeployCommand,
    status: target.status,
    lastTestedAt: target.lastTestedAt?.getTime() ?? null,
    lastError: target.lastError,
    createdAt: target.createdAt.getTime(),
    updatedAt: target.updatedAt.getTime(),
  };
}

function platformDeploymentTarget() {
  const host = process.env.SELF_HOSTED_SSH_HOST;
  const user = process.env.SELF_HOSTED_SSH_USER;
  const sshKey = process.env.SELF_HOSTED_SSH_KEY;
  const basePath = process.env.SELF_HOSTED_DEPLOY_PATH || "/var/www/agenthub-sites";
  const baseUrl = process.env.SELF_HOSTED_PUBLIC_URL || (host ? `http://${host}` : "");
  const deployPath = basePath.includes("{userId}") || basePath.includes("{deployId}") ? basePath : `${basePath.replace(/[\\/]+$/, "")}/{userId}/{deployId}`;
  const publicUrl = baseUrl ? (baseUrl.includes("{userId}") || baseUrl.includes("{deployId}") ? baseUrl : `${baseUrl.replace(/\/+$/, "")}/{userId}/{deployId}`) : "";
  const requiredEnv = ["SELF_HOSTED_SSH_HOST", "SELF_HOSTED_SSH_USER", "SELF_HOSTED_SSH_KEY", "SELF_HOSTED_PUBLIC_URL"];
  const optionalEnv = ["SELF_HOSTED_SSH_PORT", "SELF_HOSTED_DEPLOY_PATH", "SELF_HOSTED_POST_DEPLOY_COMMAND"];
  const envValues: Record<string, string | undefined> = {
    SELF_HOSTED_SSH_HOST: host,
    SELF_HOSTED_SSH_PORT: process.env.SELF_HOSTED_SSH_PORT || "22",
    SELF_HOSTED_SSH_USER: user,
    SELF_HOSTED_SSH_KEY: sshKey,
    SELF_HOSTED_DEPLOY_PATH: deployPath,
    SELF_HOSTED_PUBLIC_URL: publicUrl,
    SELF_HOSTED_POST_DEPLOY_COMMAND: process.env.SELF_HOSTED_POST_DEPLOY_COMMAND,
  };
  const missingEnv = requiredEnv.filter((key) => !envValues[key]);
  const envTemplate = [
    "# AgentHub default deployment target",
    `SELF_HOSTED_SSH_HOST=${host || "8.160.170.169"}`,
    `SELF_HOSTED_SSH_PORT=${envValues.SELF_HOSTED_SSH_PORT}`,
    `SELF_HOSTED_SSH_USER=${user || "admin"}`,
    `SELF_HOSTED_SSH_KEY=${sshKey || "C:\\Users\\Lenovo\\.ssh\\id_rsa"}`,
    `SELF_HOSTED_DEPLOY_PATH=${deployPath}`,
    `SELF_HOSTED_PUBLIC_URL=${publicUrl || "http://8.160.170.169/{userId}/{deployId}"}`,
    "# SELF_HOSTED_POST_DEPLOY_COMMAND=sudo -n nginx -s reload",
  ].join("\n");

  return {
    id: "platform-default",
    name: "AgentHub 默认服务器",
    type: "self-hosted",
    host: host || "",
    port: Number(process.env.SELF_HOSTED_SSH_PORT || 22),
    username: user || "",
    deployPath,
    publicUrl,
    authType: "server-env",
    publicKey: "",
    postDeployCommand: process.env.SELF_HOSTED_POST_DEPLOY_COMMAND || null,
    status: missingEnv.length === 0 ? "ready" : "unconfigured",
    configured: missingEnv.length === 0,
    requiredEnv,
    optionalEnv,
    missingEnv,
    envTemplate,
    lastTestedAt: null,
    lastError: missingEnv.length === 0 ? null : `管理员尚未配置 ${missingEnv.join(" / ")}`,
  };
}

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function parsePort(value: unknown) {
  const port = Number(value || 22);
  return Number.isFinite(port) && port > 0 && port <= 65535 ? Math.round(port) : 22;
}

function safeTemplateToken(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function renderDeployTemplate(value: string, userId: string, deployId: string) {
  return value
    .replace(/\{userId\}/g, safeTemplateToken(userId))
    .replace(/\{deployId\}/g, safeTemplateToken(deployId));
}

function remoteShellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/* ── GET /api/deployment-targets ── */
registerRoute("GET", "/api/deployment-targets", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const targets = await deploymentTargetRepo.listByUser(user.id);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    defaultTarget: platformDeploymentTarget(),
    targets: targets.map(publicDeploymentTarget),
  }));
});

/* ── POST /api/deployment-targets ── */
registerRoute("POST", "/api/deployment-targets", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = await readJsonBody(req) as Record<string, unknown>;
  const name = stringField(body.name, "自有服务器");
  const host = stringField(body.host);
  const username = stringField(body.username);
  const port = parsePort(body.port);
  const deployPath = stringField(body.deployPath, "/var/www/agenthub-sites/{deployId}");
  const publicUrl = stringField(body.publicUrl);
  const postDeployCommand = stringField(body.postDeployCommand) || null;

  if (!host || !username || !publicUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "host, username and publicUrl are required" }));
    return;
  }

  const id = randomUUID();
  const keyPair = generateSshKeyPair(`agenthub-${user.id}-${id}`);
  const target = await deploymentTargetRepo.create({
    id,
    userId: user.id,
    name,
    host,
    port,
    username,
    deployPath,
    publicUrl,
    publicKey: keyPair.publicKey,
    privateKeyEncrypted: encryptSecret(keyPair.privateKey),
    postDeployCommand,
  });

  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ target: publicDeploymentTarget(target) }));
});

/* ── POST /api/deployment-targets/:id/test ── */
registerRoute("POST", "/api/deployment-targets/:id/test", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const targetId = (req as RequestWithParams).params?.id;
  if (!targetId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "target id required" }));
    return;
  }

  const target = await deploymentTargetRepo.getById(targetId);
  if (!target || target.userId !== user.id) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Deployment target not found" }));
    return;
  }

  const tempKey = writeTemporarySshKey(path.join(process.cwd(), "deploy-output", ".ssh"), target.id, decryptSecret(target.privateKeyEncrypted));
  try {
    const testDeployId = `test-${target.id.slice(0, 8)}`;
    const testDeployPath = renderDeployTemplate(target.deployPath, user.id, testDeployId);
    const remoteCmd = `mkdir -p ${remoteShellQuote(testDeployPath)} && echo agenthub-ready`;
    await execFileAsync("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-p",
      String(target.port),
      "-i",
      tempKey.path,
      `${target.username}@${target.host}`,
      remoteCmd,
    ], { timeout: 15000 });
    await deploymentTargetRepo.updateStatus(target.id, "ready", null);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "ready" }));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await deploymentTargetRepo.updateStatus(target.id, "error", error);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, status: "error", error }));
  } finally {
    tempKey.cleanup();
  }
});

/* ── DELETE /api/deployment-targets/:id ── */
registerRoute("DELETE", "/api/deployment-targets/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const targetId = (req as RequestWithParams).params?.id;
  if (!targetId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "target id required" }));
    return;
  }

  const target = await deploymentTargetRepo.getById(targetId);
  if (!target || target.userId !== user.id) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Deployment target not found" }));
    return;
  }

  await deploymentTargetRepo.delete(target.id);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── GET /api/user-agents ── */
function parseAgentConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function apiKeyHint(apiKey: string) {
  if (apiKey.length <= 8) return "configured";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function normalizeUserAgentConfig(input: unknown, existingRaw?: string) {
  const existing = parseAgentConfig(existingRaw);
  const incoming = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const next = { ...existing };

  for (const key of ["provider", "baseURL", "baseUrl", "model", "systemPrompt", "avatar", "avatarBg", "tools"]) {
    if (incoming[key] !== undefined) next[key] = incoming[key];
  }

  if (typeof incoming.clearApiKey === "boolean" && incoming.clearApiKey) {
    delete next.apiKey;
    delete next.apiKeyEncrypted;
    delete next.apiKeyHint;
    delete next.hasApiKey;
  }

  if (typeof incoming.apiKey === "string" && incoming.apiKey.trim()) {
    const apiKey = incoming.apiKey.trim();
    next.apiKeyEncrypted = encryptSecret(apiKey);
    next.apiKeyHint = apiKeyHint(apiKey);
    next.hasApiKey = true;
    delete next.apiKey;
  }

  return next;
}

function sanitizeUserAgentConfig(rawConfig: string) {
  const config = parseAgentConfig(rawConfig);
  const hasEncryptedKey = typeof config.apiKeyEncrypted === "string" && Boolean(config.apiKeyEncrypted);
  const hasPlainKey = typeof config.apiKey === "string" && Boolean(config.apiKey);
  const hint = typeof config.apiKeyHint === "string"
    ? config.apiKeyHint
    : hasPlainKey
    ? apiKeyHint(String(config.apiKey))
    : undefined;

  delete config.apiKey;
  delete config.apiKeyEncrypted;
  config.hasApiKey = hasEncryptedKey || hasPlainKey;
  if (hint) config.apiKeyHint = hint;
  return config;
}

function sanitizeUserAgentRecord<T extends { config: string }>(agent: T): T {
  return {
    ...agent,
    config: JSON.stringify(sanitizeUserAgentConfig(agent.config)),
  };
}

function stringConfigValue(config: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function savedAgentApiKey(config: Record<string, unknown>) {
  const plain = stringConfigValue(config, "apiKey");
  if (plain) return plain;
  const encrypted = stringConfigValue(config, "apiKeyEncrypted");
  if (!encrypted) return "";
  try {
    return decryptSecret(encrypted);
  } catch {
    return "";
  }
}

function userAgentProvider(config: Record<string, unknown>) {
  return stringConfigValue(config, "provider") || "inherit";
}

function userAgentBaseURL(config: Record<string, unknown>) {
  return stringConfigValue(config, "baseURL", "baseUrl");
}

function userAgentModel(config: Record<string, unknown>) {
  return stringConfigValue(config, "model") || process.env.LLM_MODEL || "gpt-4o-mini";
}

function providerNeedsBaseURL(provider: string) {
  return provider !== "inherit" && provider !== "openai";
}

function adapterOverridesFromAgentConfig(config: Record<string, unknown>): Partial<AdapterConfig> | undefined {
  const provider = userAgentProvider(config);
  const model = userAgentModel(config);

  if (provider === "inherit") {
    const inheritedType = (process.env.ADAPTER_TYPE ?? "openai") as AdapterConfig["type"];
    if ((inheritedType === "openai" || inheritedType === "generic-openai") && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "sk-missing")) {
      throw new Error("系统 LLM 未配置，请填写系统 OPENAI_API_KEY，或为这个智能体单独配置 API Key。");
    }
    if (inheritedType === "generic-openai" && !process.env.OPENAI_BASE_URL) {
      throw new Error("系统 OpenAI 兼容接口缺少 OPENAI_BASE_URL。");
    }
    return model ? { model } : undefined;
  }

  const apiKey = savedAgentApiKey(config);
  const baseURL = userAgentBaseURL(config);
  if (!apiKey) throw new Error("请先保存 API Key。");
  if (providerNeedsBaseURL(provider) && !baseURL) throw new Error("请填写 Base URL。");
  if (!model) throw new Error("请填写模型名称。");

  return {
    type: provider === "openai" ? "openai" : "generic-openai",
    apiKey,
    baseURL: baseURL || undefined,
    model,
    temperature: 0,
    maxTokens: 48,
  };
}

registerRoute("GET", "/api/user-agents", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  let agents = await userAgentConfigRepo.listByUser(user.id);

  // 新用户或老用户首次访问时自动创建默认智能体
  if (agents.length === 0) {
    const defaults = [
      { name: "PM Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是项目管理智能体。负责分析用户需求、拆解任务、制定执行计划，并协调其他智能体完成项目。" }), permissions: JSON.stringify(["chat", "task"]) },
      { name: "Frontend Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是前端开发智能体。精通 HTML、CSS、JavaScript、TypeScript、React、Vue、Next.js。负责实现用户界面、交互逻辑和响应式设计。生成的代码要完整可运行。" }), permissions: JSON.stringify(["chat", "task", "file"]) },
      { name: "Backend Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是后端开发智能体。精通 Node.js、Python、Go、数据库设计、API 开发、系统架构。负责数据模型、RESTful API、业务逻辑和性能优化。" }), permissions: JSON.stringify(["chat", "task", "file"]) },
      { name: "Design Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是 UI/UX 设计智能体。精通界面设计、用户体验、配色方案、布局设计。负责提供设计建议、优化视觉效果、确保设计一致性。" }), permissions: JSON.stringify(["chat"]) },
      { name: "Test Agent", type: "custom", config: JSON.stringify({ model: "gpt-4o-mini", systemPrompt: "你是测试智能体。精通单元测试、集成测试、端到端测试。负责编写测试用例、发现 bug、验证功能完整性、提供测试报告。" }), permissions: JSON.stringify(["chat", "task"]) },
    ];
    for (const agent of defaults) {
      await userAgentConfigRepo.create({ userId: user.id, ...agent });
    }
    agents = await userAgentConfigRepo.listByUser(user.id);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ agents: agents.map(sanitizeUserAgentRecord) }));
});

/* ── POST /api/user-agents ── */
registerRoute("POST", "/api/user-agents", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = await readJsonBody(req);
  const { name, type, config: agentConfig, permissions } = body as { name?: string; type?: string; config?: object; permissions?: string[] };

  if (!name || !type) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "name and type are required" }));
    return;
  }

  const agent = await userAgentConfigRepo.create({
    userId: user.id,
    name,
    type,
    config: JSON.stringify(normalizeUserAgentConfig(agentConfig)),
    permissions: permissions ? JSON.stringify(permissions) : "[]",
  });

  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ agent: sanitizeUserAgentRecord(agent) }));
});

/* ── PUT /api/user-agents/:id ── */
registerRoute("PUT", "/api/user-agents/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const agentId = (req as RequestWithParams).params?.id;
  if (!agentId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent ID required" }));
    return;
  }
  const existing = await userAgentConfigRepo.getById(agentId);
  if (!existing || existing.userId !== user.id) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent not found" }));
    return;
  }

  const body = await readJsonBody(req) as Record<string, unknown>;
  const updates: Record<string, string> = {};
  if (body.name) updates.name = String(body.name);
  if (body.type) updates.type = String(body.type);
  if (body.config) updates.config = JSON.stringify(normalizeUserAgentConfig(body.config, existing.config));
  if (body.permissions) updates.permissions = JSON.stringify(body.permissions);
  if (body.status) updates.status = String(body.status);

  const agent = await userAgentConfigRepo.update(agentId, updates);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ agent: sanitizeUserAgentRecord(agent) }));
});

/* ── POST /api/user-agents/:id/test ── */
registerRoute("POST", "/api/user-agents/:id/test", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const agentId = (req as RequestWithParams).params?.id;
  if (!agentId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent ID required" }));
    return;
  }

  const existing = await userAgentConfigRepo.getById(agentId);
  if (!existing || existing.userId !== user.id) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent not found" }));
    return;
  }

  const configObject = parseAgentConfig(existing.config);
  const provider = userAgentProvider(configObject);
  const model = userAgentModel(configObject);
  const baseURL = userAgentBaseURL(configObject);
  let adapter: ReturnType<typeof createAdapterFromEnv> | null = null;
  const startedAt = Date.now();

  try {
    const overrides = adapterOverridesFromAgentConfig(configObject);
    adapter = createAdapterFromEnv(overrides);
    await adapter.connect();
    const sample = await adapter.sendMessage("Reply exactly: AgentHub connection ok.", {
      systemPrompt: "You are checking whether an AgentHub custom agent LLM connection works. Reply briefly.",
      temperature: 0,
      maxTokens: 32,
    });
    await userAgentConfigRepo.update(agentId, { status: "idle" }).catch(() => undefined);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      provider,
      model,
      baseURL: baseURL || null,
      latencyMs: Date.now() - startedAt,
      sample: sample.slice(0, 160),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接测试失败";
    logger.warn(`User agent connection test failed for ${existing.name}: ${message}`, "API");
    await userAgentConfigRepo.update(agentId, { status: "error" }).catch(() => undefined);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      provider,
      model,
      baseURL: baseURL || null,
      latencyMs: Date.now() - startedAt,
      error: message,
    }));
  } finally {
    if (adapter) await adapter.disconnect().catch(() => undefined);
  }
});

/* ── DELETE /api/user-agents/:id ── */
registerRoute("DELETE", "/api/user-agents/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const agentId = (req as RequestWithParams).params?.id;
  if (!agentId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent ID required" }));
    return;
  }
  const existing = await userAgentConfigRepo.getById(agentId);
  if (!existing || existing.userId !== user.id) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent not found" }));
    return;
  }

  await userAgentConfigRepo.delete(agentId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

function ensureDirectory(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function getWorkspaceFileDir(): string {
  const dir = path.join(config.files.uploadDir, "workspace-files");
  ensureDirectory(dir);
  return dir;
}

function sanitizeDisplayName(name: string): string {
  const safe = path.basename(name).replace(/[^a-zA-Z0-9._\-一-鿿\s]/g, "_").trim();
  return safe || "untitled.txt";
}

function getFileExtension(name: string, explicit?: string): string {
  const raw = (explicit || path.extname(name).replace(".", "") || "txt").toLowerCase();
  if (raw === "markdown") return "md";
  if (raw === "javascript") return "js";
  if (raw === "typescript") return "ts";
  return raw;
}

function guessMimeType(name: string, explicit?: string): string {
  if (explicit) return explicit;
  const ext = getFileExtension(name);
  const mimeMap: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    jsx: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    xml: "application/xml",
    yml: "text/yaml",
    yaml: "text/yaml",
    log: "text/plain",
  };
  return mimeMap[ext] ?? "text/plain";
}

function isTextWorkspaceFile(file: { name: string; mimeType?: string | null; size?: number | null }): boolean {
  if ((file.size ?? 0) > 2 * 1024 * 1024) return false;
  const mime = file.mimeType ?? "";
  if (mime.startsWith("text/")) return true;
  return ["json", "html", "css", "js", "jsx", "ts", "tsx", "xml", "yml", "yaml", "md", "markdown", "csv", "log"].includes(getFileExtension(file.name));
}

function readWorkspaceFileText(file: { name: string; isFolder: boolean; mimeType?: string | null; path?: string | null; size?: number | null }): string | null {
  if (file.isFolder || !file.path || !existsSync(file.path) || !isTextWorkspaceFile(file)) return null;
  return parseFileContent(readFileSync(file.path), getFileExtension(file.name));
}

function writeKnowledgeTempFile(documentId: string, content: string) {
  ensureDirectory(config.files.uploadDir);
  const tmpPath = path.join(config.files.uploadDir, `${documentId}_content.txt`);
  writeFileSync(tmpPath, Buffer.from(content, "utf-8"));
}

function hasBrokenEncoding(value?: string | null): boolean {
  if (!value) return false;
  return /[�]/.test(value) || /\?{3,}/.test(value) || /[֪ʶָ֤ȫԿ]/.test(value);
}

function repairKnowledgeLabel(value: string | null | undefined, kind: "base" | "description" | "document"): string | null | undefined {
  if (!value || !hasBrokenEncoding(value)) return value;
  const compact = value.replace(/\s+/g, "");

  if (kind === "description") {
    if (/pgvector/i.test(compact)) return "验证 pgvector";
    return "历史导入资料";
  }

  if (/AgentHub/i.test(compact)) {
    return /v2/i.test(compact) ? "AgentHub 使用指南 v2" : "AgentHub 使用指南";
  }
  if (/^JWT/i.test(compact)) {
    return /ָ|指南|guide/i.test(compact) ? "JWT 认证配置指南" : "JWT 认证说明";
  }
  if (/^API/i.test(compact)) return "API 密钥配置";
  if (/[֤ȫ]/.test(compact)) return "认证与安全说明";

  if (kind === "base") {
    if (/pgvector/i.test(compact)) return "测试知识库";
    return "历史知识库";
  }

  return "历史资料";
}

function normalizeKnowledgeBase<T extends { name: string; description?: string | null }>(base: T): T {
  const repairedDescription = repairKnowledgeLabel(base.description, "description") ?? base.description;
  return {
    ...base,
    name: hasBrokenEncoding(base.name) && /pgvector/i.test(base.description ?? "") ? "测试知识库" : repairKnowledgeLabel(base.name, "base") ?? base.name,
    description: repairedDescription,
  };
}

function normalizeKnowledgeDocument<T extends { title: string }>(doc: T): T {
  return {
    ...doc,
    title: repairKnowledgeLabel(doc.title, "document") ?? doc.title,
  };
}

function normalizeKnowledgeChunk<T extends { content: string; sectionTitle?: string | null }>(chunk: T): T {
  return {
    ...chunk,
    sectionTitle: repairKnowledgeLabel(chunk.sectionTitle, "document") ?? chunk.sectionTitle,
  };
}

function normalizeKnowledgeSearchResults<T extends { documentTitle: string }>(results: T[]): T[] {
  return results.map((result) => ({
    ...result,
    documentTitle: repairKnowledgeLabel(result.documentTitle, "document") ?? result.documentTitle,
  }));
}

function buildDocumentContent(chunks: Array<{ content: string }>): string {
  return chunks.map((chunk) => chunk.content.trim()).filter(Boolean).join("\n\n");
}

async function fallbackKnowledgeSearch(knowledgeBaseId: string, query: string, limit: number) {
  const chunks = await prisma.chunk.findMany({
    where: {
      document: { knowledgeBaseId },
      OR: [
        { content: { contains: query } },
        { sectionTitle: { contains: query } },
      ],
    },
    include: { document: { select: { title: true } } },
    orderBy: { chunkIndex: "asc" },
    take: Math.min(Math.max(limit, 1), 20),
  });

  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: repairKnowledgeLabel(chunk.document.title, "document") ?? chunk.document.title,
    content: chunk.content,
    sectionTitle: chunk.sectionTitle ?? undefined,
    chunkType: chunk.chunkType,
    score: 0.5,
    prevChunkId: chunk.prevChunkId ?? undefined,
    nextChunkId: chunk.nextChunkId ?? undefined,
  }));
}

// ═══ Knowledge Base ═══

/* ── GET /api/knowledge-bases ── */
registerRoute("GET", "/api/knowledge-bases", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const workspaceId = (req as unknown as { query?: Record<string, string> }).query?.workspaceId ?? "default";
  const bases = await knowledgeBaseRepo.listByWorkspace(workspaceId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ bases: bases.map(normalizeKnowledgeBase) }));
});

/* ── POST /api/knowledge-bases ── */
registerRoute("POST", "/api/knowledge-bases", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as { name?: string; description?: string; workspaceId?: string };
  if (!body.name) { res.writeHead(400); res.end(JSON.stringify({ error: "name required" })); return; }
  const kb = await knowledgeBaseRepo.create({ workspaceId: body.workspaceId ?? "default", name: body.name, description: body.description, ownerId: user.id });
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ base: kb }));
});

/* ── DELETE /api/knowledge-bases/:id ── */
registerRoute("DELETE", "/api/knowledge-bases/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const kbId = (req as RequestWithParams).params?.id;
  if (kbId) await knowledgeBaseRepo.delete(kbId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── GET /api/knowledge-bases/:id/documents ── */
registerRoute("GET", "/api/knowledge-bases/:id/documents", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const kbId = (req as RequestWithParams).params?.id;
  if (!kbId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const docs = await documentRepo.listByKnowledgeBase(kbId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ documents: docs.map(normalizeKnowledgeDocument) }));
});

/* ── POST /api/knowledge-bases/:id/documents ── */
registerRoute("POST", "/api/knowledge-bases/:id/documents", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const kbId = (req as RequestWithParams).params?.id;
  if (!kbId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const body = await readJsonBody(req) as { title?: string; content?: string; sourceType?: string };
  if (!body.title || !body.content) { res.writeHead(400); res.end(JSON.stringify({ error: "title and content required" })); return; }
  const doc = await documentRepo.create({ knowledgeBaseId: kbId, title: body.title, sourceType: body.sourceType ?? "manual", fileType: "txt", fileSize: Buffer.byteLength(body.content, "utf-8"), uploadedBy: user.id });
  writeKnowledgeTempFile(doc.id, body.content);
  const { ingestDocument } = await import("../knowledge/pipeline");
  ingestDocument(doc.id).catch(() => {});
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ document: doc }));
});

/* ── POST /api/knowledge-bases/:id/upload ── */
registerRoute("POST", "/api/knowledge-bases/:id/upload", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const kbId = (req as RequestWithParams).params?.id;
  if (!kbId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  // 使用 JSON body 接收文本内容
  const body = await readJsonBody(req) as { title?: string; content?: string; sourceType?: string; fileType?: string };
  if (!body.title || !body.content) { res.writeHead(400); res.end(JSON.stringify({ error: "title and content required" })); return; }
  const fileType = getFileExtension(body.title, body.fileType);
  const doc = await documentRepo.create({
    knowledgeBaseId: kbId,
    title: body.title,
    sourceType: body.sourceType ?? "upload",
    fileType,
    fileSize: Buffer.byteLength(body.content, "utf-8"),
    uploadedBy: user.id,
  });
  writeKnowledgeTempFile(doc.id, body.content);
  const { ingestDocument } = await import("../knowledge/pipeline");
  ingestDocument(doc.id).catch(() => {});
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ document: doc, status: "processing" }));
});

/* ── GET /api/documents/:id/status ── */
registerRoute("GET", "/api/documents/:id/status", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const docId = (req as RequestWithParams).params?.id;
  if (!docId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const doc = await documentRepo.getById(docId);
  if (!doc) { res.writeHead(404); res.end(JSON.stringify({ error: "not found" })); return; }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ id: doc.id, status: doc.status, errorMessage: doc.errorMessage }));
});

/* ── GET /api/documents/:id ── */
registerRoute("GET", "/api/documents/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const docId = (req as RequestWithParams).params?.id;
  if (!docId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const doc = await documentRepo.getById(docId);
  if (!doc) { res.writeHead(404); res.end(JSON.stringify({ error: "not found" })); return; }

  const normalizedDoc = normalizeKnowledgeDocument(doc);
  const chunks = doc.chunks.map(normalizeKnowledgeChunk);
  const content = buildDocumentContent(chunks);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    document: {
      ...normalizedDoc,
      chunks,
      content,
      hasContent: content.trim().length > 0,
    },
  }));
});

/* ── DELETE /api/documents/:id ── */
registerRoute("DELETE", "/api/documents/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const docId = (req as RequestWithParams).params?.id;
  if (docId) await documentRepo.delete(docId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── POST /api/knowledge-bases/:id/search ── */
registerRoute("POST", "/api/knowledge-bases/:id/search", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const kbId = (req as RequestWithParams).params?.id;
  if (!kbId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const body = await readJsonBody(req) as { query?: string; topK?: number; rerankTopK?: number };
  if (!body.query) { res.writeHead(400); res.end(JSON.stringify({ error: "query required" })); return; }
  try {
    const adapter = createAdapterFromEnv();
    await adapter.connect();
    const { hybridSearch } = await import("../knowledge/search");
    const results = await hybridSearch(adapter, { query: body.query, knowledgeBaseId: kbId, topK: body.topK, rerankTopK: body.rerankTopK });
    await adapter.disconnect();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ results: normalizeKnowledgeSearchResults(results) }));
  } catch (err) {
    const results = await fallbackKnowledgeSearch(kbId, body.query, body.rerankTopK ?? body.topK ?? 8);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ results: normalizeKnowledgeSearchResults(results), warning: err instanceof Error ? err.message : "Search used fallback" }));
  }
});

// ═══ Workspace Files ═══

registerRoute("GET", "/api/workspace-files", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const parentId = url.searchParams.get("parentId") ?? null;
  const files = parentId
    ? await workspaceFileRepo.listByParent("default", parentId)
    : await workspaceFileRepo.listByParent("default", null);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ files }));
});

registerRoute("GET", "/api/workspace-files/tree", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const files = await workspaceFileRepo.getTree("default");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ files }));
});

registerRoute("GET", "/api/workspace-files/search", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const files = q ? (await workspaceFileRepo.getTree("default")).filter((file) => {
    if (file.name.toLowerCase().includes(q)) return true;
    const content = readWorkspaceFileText(file);
    return content?.toLowerCase().includes(q) ?? false;
  }).slice(0, 50) : [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ files }));
});

registerRoute("GET", "/api/workspace-files/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const fileId = (req as RequestWithParams).params?.id;
  if (!fileId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const file = await workspaceFileRepo.getById(fileId);
  if (!file || file.workspaceId !== "default") { res.writeHead(404); res.end(JSON.stringify({ error: "file not found" })); return; }
  const content = readWorkspaceFileText(file);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ file: { ...file, content, canPreview: content !== null } }));
});

registerRoute("POST", "/api/workspace-files", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as { name?: string; parentId?: string | null; isFolder?: boolean; content?: string; mimeType?: string };
  if (!body.name) { res.writeHead(400); res.end(JSON.stringify({ error: "name required" })); return; }
  const name = sanitizeDisplayName(body.name);
  let filePath: string | undefined;
  let size = 0;
  const isFolder = body.isFolder ?? false;
  const mimeType = isFolder ? "inode/directory" : guessMimeType(name, body.mimeType);

  if (!isFolder) {
    const content = body.content ?? "";
    const storedName = `${randomUUID()}-${name.replace(/\s+/g, "_")}`;
    filePath = path.join(getWorkspaceFileDir(), storedName);
    writeFileSync(filePath, Buffer.from(content, "utf-8"));
    size = Buffer.byteLength(content, "utf-8");
  }

  const file = await workspaceFileRepo.create({
    workspaceId: "default",
    parentId: body.parentId ?? null,
    name,
    isFolder,
    size,
    mimeType,
    path: filePath,
    uploadedBy: user.id,
  });
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ file }));
});

registerRoute("PATCH", "/api/workspace-files/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const fileId = (req as RequestWithParams).params?.id;
  if (!fileId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const existing = await workspaceFileRepo.getById(fileId);
  if (!existing || existing.workspaceId !== "default") { res.writeHead(404); res.end(JSON.stringify({ error: "file not found" })); return; }
  const body = await readJsonBody(req) as { name?: string; parentId?: string | null; content?: string };
  const updates: { name?: string; parentId?: string | null; size?: number; mimeType?: string; path?: string | null } = {};
  if (body.name) updates.name = sanitizeDisplayName(body.name);
  if (body.parentId !== undefined) updates.parentId = body.parentId;
  if (typeof body.content === "string" && !existing.isFolder) {
    const targetPath = existing.path ?? path.join(getWorkspaceFileDir(), `${randomUUID()}-${existing.name.replace(/\s+/g, "_")}`);
    writeFileSync(targetPath, Buffer.from(body.content, "utf-8"));
    updates.path = targetPath;
    updates.size = Buffer.byteLength(body.content, "utf-8");
    updates.mimeType = guessMimeType(updates.name ?? existing.name);
  }
  const file = Object.keys(updates).length > 0 ? await workspaceFileRepo.update(fileId, updates) : existing;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, file }));
});

registerRoute("POST", "/api/workspace-files/:id/knowledge", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const fileId = (req as RequestWithParams).params?.id;
  if (!fileId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const body = await readJsonBody(req) as { knowledgeBaseId?: string };
  if (!body.knowledgeBaseId) { res.writeHead(400); res.end(JSON.stringify({ error: "knowledgeBaseId required" })); return; }

  const file = await workspaceFileRepo.getById(fileId);
  if (!file || file.workspaceId !== "default" || file.isFolder) { res.writeHead(404); res.end(JSON.stringify({ error: "file not found" })); return; }
  const content = readWorkspaceFileText(file);
  if (!content?.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: "file content is empty or not previewable" })); return; }

  const base = await knowledgeBaseRepo.getById(body.knowledgeBaseId);
  if (!base || base.workspaceId !== "default") { res.writeHead(404); res.end(JSON.stringify({ error: "knowledge base not found" })); return; }

  const doc = await documentRepo.create({
    knowledgeBaseId: body.knowledgeBaseId,
    title: file.name,
    sourceType: "workspace-file",
    fileType: getFileExtension(file.name),
    fileSize: file.size,
    uploadedBy: user.id,
  });
  writeKnowledgeTempFile(doc.id, content);
  const { ingestDocument } = await import("../knowledge/pipeline");
  ingestDocument(doc.id).catch(() => {});
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ document: doc, status: "processing" }));
});

registerRoute("DELETE", "/api/workspace-files/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const fileId = (req as RequestWithParams).params?.id;
  if (fileId) {
    const files = await workspaceFileRepo.getTree("default");
    const descendants = new Set<string>([fileId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const file of files) {
        if (file.parentId && descendants.has(file.parentId) && !descendants.has(file.id)) {
          descendants.add(file.id);
          changed = true;
        }
      }
    }
    for (const file of files) {
      if (descendants.has(file.id) && file.path && existsSync(file.path)) {
        rmSync(file.path, { force: true });
      }
    }
    await workspaceFileRepo.delete(fileId);
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

// ═══ Memory Search ═══

registerRoute("POST", "/api/memory/search", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as { query?: string; conversationId?: string; topK?: number };
  if (!body.query) { res.writeHead(400); res.end(JSON.stringify({ error: "query required" })); return; }
  const { searchMemory } = await import("../memory/ingestion");
  const results = await searchMemory("default", body.query, { conversationId: body.conversationId, topK: body.topK });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ results }));
});

registerRoute("POST", "/api/memory/summarize", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as { conversationId?: string };
  if (!body.conversationId) { res.writeHead(400); res.end(JSON.stringify({ error: "conversationId required" })); return; }
  const { generateConversationSummary } = await import("../memory/ingestion");
  generateConversationSummary(body.conversationId).catch(() => {});
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "processing" }));
});

/* ── GET /api/memory/state ── */
registerRoute("GET", "/api/memory/state", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) { res.writeHead(400); res.end(JSON.stringify({ error: "conversationId required" })); return; }

  try {
    const msgCount = await prisma.message.count({ where: { conversationId } });
    const recentJobs = await jobRepo.listByConversation(conversationId, { limit: 5 });
    const completedJobs = recentJobs.filter(j => j.status === "completed");
    const conv = await conversationRepo.getById(conversationId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      messageCount: msgCount,
      completedJobCount: completedJobs.length,
      recentJobs: completedJobs.map(j => ({
        id: j.id, title: j.title, summary: j.summary?.slice(0, 200), completedAt: j.completedAt,
      })),
      conversationSummary: conv?.summary ?? null,
      topics: (() => { try { return conv?.topics ? JSON.parse(conv.topics as string) : []; } catch { return []; } })(),
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to load memory state" }));
  }
});

// ═══ MCP Servers ═══

/* ── GET /api/mcp/servers ── */
registerRoute("GET", "/api/mcp/servers", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const servers = await mcpRepo.listByUser(user.id);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ servers }));
});

/* ── POST /api/mcp/servers ── */
registerRoute("POST", "/api/mcp/servers", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = await readJsonBody(req) as { name?: string; protocol?: string; command?: string; url?: string };
  if (!body.name || !body.protocol) { res.writeHead(400); res.end(JSON.stringify({ error: "name and protocol required" })); return; }
  const server = await mcpRepo.create({ userId: user.id, name: body.name, protocol: body.protocol, command: body.command, url: body.url });
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ server }));
});

/* ── PUT /api/mcp/servers/:id ── */
registerRoute("PUT", "/api/mcp/servers/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const serverId = (req as RequestWithParams).params?.id;
  if (!serverId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  const body = await readJsonBody(req) as { name?: string; protocol?: string; command?: string; url?: string };
  const server = await mcpRepo.update(serverId, body);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ server }));
});

/* ── DELETE /api/mcp/servers/:id ── */
registerRoute("DELETE", "/api/mcp/servers/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const serverId = (req as RequestWithParams).params?.id;
  if (serverId) await mcpManager.removeServer(serverId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── POST /api/mcp/servers/:id/connect ── */
registerRoute("POST", "/api/mcp/servers/:id/connect", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const serverId = (req as RequestWithParams).params?.id;
  if (!serverId) { res.writeHead(400); res.end(JSON.stringify({ error: "id required" })); return; }
  try {
    const result = await mcpManager.connectServer(serverId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: true, toolNames: result.toolNames }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Connect failed" }));
  }
});

/* ── POST /api/mcp/servers/:id/disconnect ── */
registerRoute("POST", "/api/mcp/servers/:id/disconnect", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const serverId = (req as RequestWithParams).params?.id;
  if (serverId) await mcpManager.disconnectServer(serverId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

/* ── GET /api/mcp/servers/:id/tools ── */
registerRoute("GET", "/api/mcp/servers/:id/tools", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const serverId = (req as RequestWithParams).params?.id;
  const serverTools = mcpManager.listServerTools().find(s => s.serverId === serverId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ tools: serverTools?.tools ?? [] }));
});

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      size += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}
