"use client";

interface Props {
  messageCount: number;
  totalChars: number;
}

const MAX_TOKENS = 128000;
const CHARS_PER_TOKEN_ZH = 1.5;

export function ContextWindowIndicator({ messageCount, totalChars }: Props) {
  if (messageCount === 0) return null;

  const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN_ZH);
  const usagePercent = Math.min(100, Math.round((estimatedTokens / MAX_TOKENS) * 100));

  let color = "var(--success)";
  if (usagePercent > 95) color = "var(--danger)";
  else if (usagePercent > 80) color = "var(--warning)";

  return (
    <div className="flex items-center gap-2 shrink-0" title={`约 ${estimatedTokens} / ${MAX_TOKENS.toLocaleString()} tokens`}>
      <div className="rounded-full overflow-hidden" style={{ width: 48, height: 4, background: "var(--surface-low)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{
          width: `${usagePercent}%`, background: color, minWidth: usagePercent > 0 ? 4 : 0,
        }} />
      </div>
      <span style={{ fontSize: 9, color: "var(--fg-tertiary)", fontWeight: 500, whiteSpace: "nowrap" }}>
        {messageCount} 条 · {usagePercent}%
      </span>
    </div>
  );
}
