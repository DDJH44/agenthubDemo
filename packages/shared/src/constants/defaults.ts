export const DEFAULTS = {
  ORCHESTRATOR: { maxRetries: 2, criticThreshold: 6, enableResearcher: true, enableRefiner: true, concurrency: 5, maxSteps: 10 },
  LLM: { model: "gpt-4o-mini", temperature: 0.7, maxTokens: 4096 },
  ADAPTER: { type: "openai" as const },
  WS: { path: "/api/ws", reconnectInterval: 3000, maxReconnectAttempts: 5 },
} as const;
