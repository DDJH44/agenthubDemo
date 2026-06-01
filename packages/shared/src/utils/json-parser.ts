function extractBalanced(text: string, open: string, close: string): string | null {
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) { if (depth === 0) start = i; depth++; }
    else if (text[i] === close) { depth--; if (depth === 0 && start !== -1) return text.substring(start, i + 1); }
  }
  return null;
}

export function parseLLMJSON<T = unknown>(raw: string, label = "LLM response"): T {
  try { return JSON.parse(raw) as T; } catch {}
  const jsonFence = raw.match(/```json\s*([\s\S]*?)```/);
  if (jsonFence) { try { return JSON.parse(jsonFence[1].trim()) as T; } catch {} }
  const anyFence = raw.match(/```\s*([\s\S]*?)```/);
  if (anyFence) { try { return JSON.parse(anyFence[1].trim()) as T; } catch {} }
  const obj = extractBalanced(raw, "{", "}");
  if (obj) { try { return JSON.parse(obj) as T; } catch {} }
  const arr = extractBalanced(raw, "[", "]");
  if (arr) { try { return JSON.parse(arr) as T; } catch {} }
  throw new Error(`Failed to parse JSON from ${label}: ${raw.substring(0, 200)}`);
}
