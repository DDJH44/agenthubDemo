import type { IAdapter, AdapterConfig, AdapterCapabilities, AdapterContext } from "./types";

export abstract class BaseAdapter implements IAdapter {
  public readonly id: string;
  public readonly type: string;
  public abstract readonly capabilities: AdapterCapabilities;
  protected config: AdapterConfig;
  protected connected = false;

  constructor(config: AdapterConfig, type: string) {
    this.id = `adapter-${type}-${Date.now()}`;
    this.type = type;
    this.config = { temperature: 0.3, maxTokens: 4096, ...config };
  }

  abstract connect(): Promise<void>;
  abstract sendMessage(content: string, context?: AdapterContext): Promise<string>;
  abstract streamResponse(content: string, context?: AdapterContext): AsyncGenerator<string, string, unknown>;
  abstract executeTool(name: string, params: Record<string, unknown>): Promise<unknown>;
  abstract generateEmbedding(text: string): Promise<number[]>;
  abstract disconnect(): Promise<void>;

  protected buildContext(overrides?: AdapterContext): AdapterContext {
    return { temperature: this.config.temperature, maxTokens: this.config.maxTokens, ...overrides };
  }

  protected async retry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        if (i === maxRetries) throw err;
        const jitter = Math.random() * 500;
        await this.sleep(1000 * (i + 1) + jitter);
      }
    }
    throw new Error("Unreachable");
  }

  protected sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
  protected ensureConnected(): void { if (!this.connected) throw new Error(`Adapter ${this.type} not connected`); }
}
