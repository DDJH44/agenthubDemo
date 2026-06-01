import type { IAdapter, AdapterConfig } from "./types";
import { OpenAIAdapter } from "./openai";
import { GenericOpenAIAdapter } from "./generic";
import { ClaudeCodeAdapter } from "./claude-code";
import { CodexAdapter } from "./codex";

export function createAdapter(config: AdapterConfig): IAdapter {
  switch (config.type) {
    case "openai": return new OpenAIAdapter(config);
    case "generic-openai": return new GenericOpenAIAdapter(config);
    case "claude-code": return new ClaudeCodeAdapter(config);
    case "codex": return new CodexAdapter(config);
    default: throw new Error(`Unknown adapter type: ${config.type}`);
  }
}

export function createAdapterFromEnv(overrides?: Partial<AdapterConfig>): IAdapter {
  const type = (overrides?.type ?? process.env.ADAPTER_TYPE ?? "openai") as AdapterConfig["type"];
  return createAdapter({ type, apiKey: overrides?.apiKey ?? process.env.OPENAI_API_KEY, baseURL: overrides?.baseURL ?? process.env.OPENAI_BASE_URL, model: overrides?.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini", cliPath: overrides?.cliPath, maxTokens: overrides?.maxTokens, temperature: overrides?.temperature });
}
