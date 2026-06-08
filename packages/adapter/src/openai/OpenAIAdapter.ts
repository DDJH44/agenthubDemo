import OpenAI from "openai";
import { BaseAdapter } from "../base";
import type { AdapterConfig, AdapterCapabilities, AdapterContext } from "../types";

export class OpenAIAdapter extends BaseAdapter {
  public readonly capabilities: AdapterCapabilities = {
    streaming: true, toolCalling: true, vision: true, embeddings: true,
    maxContextTokens: 128000, supportsSystemPrompt: true,
  };
  private client: OpenAI | null = null;

  constructor(config: AdapterConfig) { super(config, "openai"); }

  async connect(): Promise<void> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "sk-missing") {
      throw new Error("OpenAI adapter is not configured. Set OPENAI_API_KEY or configure a user agent API key.");
    }
    this.client = new OpenAI({ apiKey, baseURL: this.config.baseURL ?? process.env.OPENAI_BASE_URL });
    this.connected = true;
  }

  async sendMessage(content: string, context?: AdapterContext): Promise<string> {
    this.ensureConnected();
    if (!this.client) throw new Error("OpenAI adapter is not connected to a real client.");
    const ctx = this.buildContext(context);
    const messages = this.buildMessages(content, ctx);
    const controller = new AbortController();
    const externalSignal = ctx.signal;
    const timeoutHandle = setTimeout(() => controller.abort(), 60000);

    if (externalSignal?.aborted) {
      const err = new Error("Request aborted before starting");
      err.name = "AbortError";
      throw err;
    }

    const onExternalAbort = () => { controller.abort(); };
    externalSignal?.addEventListener("abort", onExternalAbort);

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    };

    try {
      const res = await this.retry(() =>
        this.client!.chat.completions.create({
          model: this.config.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
          temperature: ctx.temperature ?? 0.3, max_tokens: ctx.maxTokens ?? 4096, messages,
        }, { signal: controller.signal })
      );
      return res.choices[0]?.message?.content ?? "";
    } finally {
      cleanup();
    }
  }

  async *streamResponse(content: string, context?: AdapterContext): AsyncGenerator<string, string, unknown> {
    this.ensureConnected();
    if (!this.client) throw new Error("OpenAI adapter is not connected to a real client.");
    const ctx = this.buildContext(context);
    const controller = new AbortController();
    const externalSignal = ctx.signal;
    const timeoutHandle = setTimeout(() => controller.abort(), 120000);

    if (externalSignal?.aborted) {
      const err = new Error("Request aborted before starting");
      err.name = "AbortError";
      throw err;
    }

    const onExternalAbort = () => { controller.abort(); };
    externalSignal?.addEventListener("abort", onExternalAbort);

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    };

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
        temperature: ctx.temperature ?? 0.3, max_tokens: ctx.maxTokens ?? 4096,
        stream: true, messages: this.buildMessages(content, ctx),
      }, { signal: controller.signal });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) { full += delta; yield delta; }
      }
      return full;
    } finally {
      cleanup();
    }
  }

  async executeTool(name: string, _params: Record<string, unknown>): Promise<unknown> {
    throw new Error(`OpenAI adapter cannot execute tool "${name}" directly. Use AgentHub's registered tool layer.`);
  }

  async disconnect(): Promise<void> { this.client = null; this.connected = false; }

  private buildMessages(content: string, ctx: AdapterContext) {
    const sys = ctx.systemPrompt ?? "You are a helpful AI agent.";
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: sys }];
    if (ctx.history) for (const h of ctx.history) msgs.push({ role: h.role as "user" | "assistant", content: h.content });
    msgs.push({ role: "user", content });
    return msgs;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    this.ensureConnected();
    const embKey = process.env.EMBEDDING_API_KEY ?? this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!embKey) return [];
    const embModel = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    const baseUrl = this.config.baseURL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const isVolcArk = baseUrl.includes("volces.com") || baseUrl.includes("volcengine");

    if (isVolcArk && !embModel.startsWith("ep-")) return [];

    try {
      if (embModel.startsWith("ep-")) {
        const resp = await fetch(`${baseUrl}/embeddings/multimodal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${embKey}` },
          body: JSON.stringify({ model: embModel, input: [{ type: "text", text: text.slice(0, 8000) }] }),
        });
        const json = await resp.json() as { data?: { embedding: number[] } };
        if (json.data?.embedding) return json.data.embedding;
        return [];
      }

      if (this.client) {
        const res = await this.client.embeddings.create({ model: embModel, input: text.slice(0, 8000) });
        return res.data[0].embedding;
      }
      return [];
    } catch (err) {
      console.warn(`[OpenAIAdapter] Embedding failed (will use keyword fallback): ${err}`);
      return [];
    }
  }

}
