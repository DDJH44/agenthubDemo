import { OpenAIAdapter } from "../openai/OpenAIAdapter";
import type { AdapterConfig, AdapterCapabilities } from "../types";

export class GenericOpenAIAdapter extends OpenAIAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true, toolCalling: false, vision: false, embeddings: true,
    maxContextTokens: 32000, supportsSystemPrompt: true,
  };
  constructor(config: AdapterConfig) {
    super({ ...config, type: "generic-openai" });
    if (!config.baseURL) throw new Error("GenericOpenAIAdapter requires baseURL");
  }
}
