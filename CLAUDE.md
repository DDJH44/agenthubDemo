# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
npm run dev           # Next.js frontend only (port 3000)
npm run dev:server    # Backend server only (port from .env.local, default 3002)
npm run dev:all       # Both frontend + backend concurrently
npm run build         # Next.js production build
npm run lint          # ESLint
npx prisma generate --schema=packages/server/src/db/prisma/schema.prisma  # Regenerate Prisma client
npx prisma db push --schema=packages/server/src/db/prisma/schema.prisma   # Sync schema → SQLite
```

## Architecture

Monorepo (npm workspaces) with four packages:

### `packages/shared` (`@agenthub/shared`)
Types, constants, and utilities shared across frontend and server. Key exports:
- **Types**: `WSClientMessage`, `WSServerMessage` (full WebSocket protocol), `Message`, `Conversation`, `Job`, `PlanNode`, `StepResult`, `Artifact`, `AgentState`, `ITool`, `ToolContext`, `IAdapter`
- **Utils**: `parseMentions()` — extracts `@agent` mentions from text; `generateId()`; JSON parser; event factory

### `packages/adapter` (`@agenthub/adapter`)
LLM adapter layer. `createAdapter(type, config)` returns an `IAdapter` instance. Implementations: OpenAI, Claude Code, Codex, Generic OpenAI. Key interface:
```ts
interface IAdapter {
  sendMessage(content, context?): Promise<string>
  streamResponse(content, context?): AsyncGenerator<string>
  executeTool(name, params): Promise<unknown>
}
```

### `packages/server` (`@agenthub/server`)
Standalone HTTP + WebSocket server (`tsx src/index.ts`). Architecture:
- **`ws/gateway.ts`** — WebSocket server on `/api/ws`, room-based broadcasting, persists messages via Prisma, enqueues jobs
- **`orchestrator/index.ts`** — DAG-based task execution: Researcher → Planner → Worker×N (with Critic feedback loop up to `maxRetries`) → Refiner → Summary. Emits `StreamEvent` through callback for real-time WS events
- **`agents/`** — Planner, Worker, Critic, Researcher, Refiner. All extend `BaseAgent`. Worker uses `toolRegistry` for actual tool execution
- **`tools/`** — `ToolRegistry` with four tools: search (Tavily), code (e2b sandbox), web-fetch, deploy (Vercel). `registerAllTools()` called once on orchestrator init
- **`queue/`** — `MemoryQueue` executes orchestrator jobs async, bridges orchestrator events → WSServerMessage broadcast
- **`db/`** — Prisma 7 + SQLite via `@prisma/adapter-libsql`. Schema: User, Session, Workspace, WorkspaceMember, Agent, Conversation, Message, Job, JobEvent, Artifact
- **`api/`** — REST endpoints: `POST /api/chat` (SSE stream), `POST /api/run`, `GET /api/health`

### `packages/frontend` (`@agenthub/frontend`, alias `@/`)
Next.js App Router client code, rendered from `src/app/page.tsx`:
- **`stores/`** — Zustand: `chat-store` (connected state, conversations, messages, streaming), `workspace-store` (plan, step results, artifacts, deploy), `settings-store` (locale), `navigation-store` (active sidebar nav)
- **`features/chat/`** — `AgentChatPanel`, `ConversationSidebar`, `MentionSuggestions`
- **`features/workspace/`** — `BottomTabBar` (task/files/diff/preview/deploy tabs), `RightDrawer` (tabbed detail panel)
- **`features/views/`** — Placeholder views for non-chat nav items (dashboard, agents, tasks, projects, etc.)
- **`hooks/`** — `useWebSocket` (connect, handle 11 WS message types, update stores), `useT` (i18n)
- **`lib/`** — `i18n.ts` (zh/en translations), `ws-client.ts`, `api-client.ts`

## Key conventions

- **Design tokens**: All styling uses CSS custom properties defined in `src/app/globals.css` (MD3-inspired: `--page-bg`, `--surface-white`, `--surface-low`, `--accent`, `--accent-container`, etc.). Components use inline `style={{ background: "var(--bg-surface)" }}` patterns, not Tailwind classes for visual properties
- **Tailwind v4**: Uses `@import "tailwindcss"` syntax (not v3 `@tailwind base`). `@theme inline` block maps CSS vars to Tailwind tokens. No `tailwind.config.ts`
- **Fonts**: Inter (body), JetBrains Mono (code), Plus Jakarta Sans (headings) loaded via `next/font/google` in `layout.tsx`
- **WebSocket protocol**: Frontend sends `WSClientMessage`, server responds with `WSServerMessage` (both defined in `shared/types/ws.ts`). All real-time data flows through WS
- **Sidebar navigation**: 9 nav items switch views client-side via `navigation-store`. No Next.js routing — single-page app
- **Prisma 7**: `url` is removed from `schema.prisma` datasource. Connection URL goes in `prisma.config.ts`. Client uses adapter: `new PrismaClient({ adapter: new PrismaLibSql({ url: '...' }) })`
- **Port conventions**: Frontend 3000, backend 3002 (set in `.env.local` as `PORT=3002`). Frontend connects WS to `ws://localhost:3002/api/ws`
