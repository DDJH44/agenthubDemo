export function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="coze-code-block" data-lang="${lang}">
      <div class="coze-code-header">
        <span class="coze-code-lang">${lang || "code"}</span>
        <button class="coze-code-copy" onclick="navigator.clipboard.writeText(this.closest('.coze-code-block').querySelector('code').textContent)">复制</button>
      </div>
      <pre><code>${code.trim()}</code></pre>
    </div>`;
  });

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^([ \t]*)\[x\]\s+(.+)$/gm, '<div class="coze-checkbox checked"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg><span>$2</span></div>');
  html = html.replace(/^([ \t]*)\[ \]\s+(.+)$/gm, '<div class="coze-checkbox"><div class="coze-checkbox-empty"></div><span>$2</span></div>');
  html = html.replace(/^([ \t]*)[-*•]\s+(.+)$/gm, '<li data-list="bullet">$2</li>');
  html = html.replace(/(^|\n+)((?:<li data-list="bullet">[\s\S]*?<\/li>\n?)+)/gm, (_, prefix, items) => `${prefix}<ul>${items.trim().replace(/\n+/g, "")}</ul>`);
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li data-list="ordered">$1</li>');
  html = html.replace(/(^|\n+)((?:<li data-list="ordered">[\s\S]*?<\/li>\n?)+)/gm, (_, prefix, items) => `${prefix}<ol>${items.trim().replace(/\n+/g, "")}</ol>`);
  html = html.replace(/\sdata-list="(?:bullet|ordered)"/g, "");
  html = html.replace(/^&gt;\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^---$/gm, "<hr>");
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const normalized = trimmed.replace(/\n/g, "<br>");
      if (/^<(?:ul|ol|div|h[1-6]|blockquote|hr)\b/.test(normalized)) return normalized;
      return `<p>${normalized}</p>`;
    })
    .join("");

  return html;
}
