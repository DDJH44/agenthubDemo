import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createAdapterFromEnv } from "@agenthub/adapter";

const PORT = Number(process.env.WS_PORT) || 3001;

const server = createServer((_req, res) => {
  res.writeHead(200);
  res.end("AgentHub WS Server");
});

const wss = new WebSocketServer({ server, path: "/api/ws" });

async function main() {
  const adapter = createAdapterFromEnv();
  await adapter.connect();
  console.log(`[WS] Adapter connected (${adapter.type})`);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS] Client connected");
    ws.send(JSON.stringify({ type: "connected", clientId: `c-${Date.now()}`, timestamp: Date.now() }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const text: string = msg.text ?? msg.input ?? "";
        if (!text.trim()) return;

        const { createOrchestrator } = await import("./packages/server/src/orchestrator/index");
        const orchestrator = createOrchestrator(adapter);

        console.log(`[WS] Task: ${text.slice(0, 80)}`);

        ws.send(JSON.stringify({ type: "task:created", jobId: `job-${Date.now()}`, timestamp: Date.now() }));

        await orchestrator.run(text, (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const ts = Date.now();

          switch (event.type) {
            case "plan": {
              const plan = event.msg as { steps: Array<{ id: string; task: string; dependsOn: string[] }> };
              ws.send(JSON.stringify({
                type: "plan:created",
                jobId: "",
                plan: plan.steps,
                timestamp: ts,
              }));
              plan.steps.forEach((step) => {
                ws.send(JSON.stringify({
                  type: "step:started",
                  jobId: "", stepId: step.id, task: step.task,
                  agentRole: "worker", timestamp: ts,
                }));
              });
              break;
            }
            case "stream": {
              ws.send(JSON.stringify({
                type: "agent:stream",
                agentId: "worker",
                chunk: String(event.msg),
                messageId: "",
                timestamp: ts,
              }));
              break;
            }
            case "final": {
              const final = event.msg as Record<string, unknown>;
              const stepResults = (final.stepResults as Array<{ id: string; task: string; result: string }>) ?? [];
              stepResults.forEach((step) => {
                ws.send(JSON.stringify({
                  type: "step:completed",
                  jobId: "", stepId: step.id, task: step.task, result: step.result,
                  timestamp: ts,
                }));
              });
              ws.send(JSON.stringify({
                type: "job:completed",
                jobId: "",
                summary: final.summary ?? "",
                stats: { totalSteps: stepResults.length },
                timestamp: ts,
              }));
              break;
            }
            case "system":
            case "research":
            case "critic":
            case "refine":
            case "retry": {
              ws.send(JSON.stringify({
                type: "agent:status",
                agentId: event.type === "critic" ? "critic" : event.type === "research" ? "researcher" : "system",
                status: event.type,
                lastOutput: String(event.msg),
                timestamp: ts,
              }));
              break;
            }
          }
        });

        console.log("[WS] Task complete");
      } catch (err) {
        console.error("[WS] Error:", err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "error", code: "TASK_FAILED",
            message: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
          }));
        }
      }
    });

    ws.on("close", () => console.log("[WS] Client disconnected"));
  });

  server.listen(PORT, () => {
    console.log(`[WS] Server on ws://localhost:${PORT}/api/ws`);
  });
}

main();
