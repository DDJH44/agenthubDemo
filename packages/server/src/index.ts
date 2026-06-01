import { createServer } from "http";
import { mkdirSync, existsSync } from "fs";
import { setupWebSocket } from "./ws/gateway";
import { handleApiRequest } from "./api/index";
import { config } from "./config";
import { ensureDefaults } from "./db";
import { resumeMcpConnections } from "./mcp/manager";
import { logger } from "./utils/logger";

async function main() {
  await ensureDefaults();
  resumeMcpConnections().catch(() => {});

  // Ensure file upload directory exists
  if (!existsSync(config.files.uploadDir)) {
    mkdirSync(config.files.uploadDir, { recursive: true });
  }

  // Resume stuck jobs from previous server run
  try {
    const { getQueue } = await import("./queue/index");
    await getQueue().resume();
  } catch { /* queue resume is best-effort */ }

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", config.cors.origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Try API routes first
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      // Fallback: health check
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "agenthub-server" }));
    }
  });

  setupWebSocket(server);

  server.listen(config.port, () => {
    logger.info(`AgentHub ready on http://localhost:${config.port}`, 'Server');
    logger.info(`WebSocket: ws://localhost:${config.port}${config.wsPath}`, 'Server');
    logger.info(`API routes: POST /api/chat, POST /api/run, GET /api/health, POST /api/auth/register, POST /api/auth/login`, 'Server');
  });

  process.on("SIGINT", () => { server.close(); process.exit(0); });
}

main().catch((err) => { logger.error("Server failed", err as Error, 'Server'); process.exit(1); });
