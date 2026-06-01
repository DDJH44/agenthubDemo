function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code style=\"background:#f0f0f0;padding:1px 4px;border-radius:3px;\">$1</code>");
  html = html.replace(/^### (.+)$/gm, "<h3 style=\"margin-top:20px;color:#333;\">$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2 style=\"margin-top:24px;color:#222;border-bottom:1px solid #eee;padding-bottom:6px;\">$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1 style=\"margin-top:28px;color:#111;font-size:1.6em;\">$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^- (.+)$/gm, "<li style=\"margin:4px 0;\">$1</li>");
  html = html.replace(/^\d+\. (.+)$/gm, "<li style=\"margin:4px 0;\">$1</li>");
  html = html.replace(/(<li[\s\S]*?<\/li>)/g, "<ul style=\"padding-left:20px;margin:8px 0;\">$1</ul>");
  html = html.replace(/\n{2,}/g, "</p><p style=\"margin:10px 0;line-height:1.8;\">");
  html = html.replace(/\n/g, "<br>");
  html = `<p style="margin:10px 0;line-height:1.8;">${html}</p>`;

  return html;
}

export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.md$/, "")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDF(content: string, filename: string) {
  const htmlBody = markdownToHtml(content);
  const printWin = window.open("", "_blank", "width=800,height=600");
  if (!printWin) return;
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#222;line-height:1.8;}h1{font-size:1.6em}h2{font-size:1.3em}h3{font-size:1.1em}pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}code{font-family:'JetBrains Mono',monospace;font-size:0.9em}@media print{body{margin:0;padding:0 15mm}}</style></head><body>${htmlBody}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); printWin.close(); }, 500);
}

export function downloadDOCX(content: string, filename: string) {
  const htmlBody = markdownToHtml(content);
  const docHTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${filename}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:'Segoe UI',sans-serif;margin:20mm;line-height:1.8;color:#222}h1{font-size:18pt}h2{font-size:14pt}h3{font-size:12pt}pre{background:#f5f5f5;padding:10px}p{margin:8pt 0}</style></head><body>${htmlBody}</body></html>`;

  const blob = new Blob([docHTML], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.(docx|doc)$/, "")}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
