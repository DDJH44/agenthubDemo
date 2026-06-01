export class MemoryStore {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  set(key: string, value: unknown, ttlMs?: number): void {
    this.store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) { this.store.delete(key); return undefined; }
    return entry.value as T;
  }

  has(key: string): boolean { return this.get(key) !== undefined; }
  delete(key: string): void { this.store.delete(key); }

  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) { this.store.delete(key); continue; }
      result[key] = entry.value;
    }
    return result;
  }

  summarize(maxPerKey = 200): string {
    const all = this.getAll();
    return Object.entries(all).map(([key, value]) => `[${key}]: ${(typeof value === "string" ? value : JSON.stringify(value)).slice(0, maxPerKey)}`).join("\n");
  }

  clear(): void { this.store.clear(); }
}
