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
  html = html.replace(/^(\s*)\[x\]\s+(.+)$/gm, '<div class="coze-checkbox checked"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg><span>$2</span></div>');
  html = html.replace(/^(\s*)\[ \]\s+(.+)$/gm, '<div class="coze-checkbox"><div class="coze-checkbox-empty"></div><span>$2</span></div>');
  html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/^&gt;\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/^(.+)$/gm, (m) => {
    if (m.startsWith("<") || m.includes("</p>")) return m;
    return `<p>${m}</p>`;
  });

  return html;
}
