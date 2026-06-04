export type MessageContentPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language?: string; filename?: string; open?: boolean };

const CODE_LANGUAGES = new Set([
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "go",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "jsx",
  "markdown",
  "md",
  "php",
  "py",
  "python",
  "rust",
  "sh",
  "shell",
  "sql",
  "svg",
  "tsx",
  "ts",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

function cleanText(value: string) {
  return value.replace(/^\s+|\s+$/g, "");
}

function pushText(parts: MessageContentPart[], value: string) {
  if (value.trim()) parts.push({ type: "text", value });
}

function pushCode(parts: MessageContentPart[], value: string, language?: string, filename?: string, open?: boolean) {
  const code = value.trim();
  if (code) parts.push({ type: "code", value: code, language, filename, open });
}

function normalizeFenceLanguage(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (!/^[a-zA-Z0-9_+#.-]{1,32}$/.test(candidate)) return undefined;
  return candidate;
}

function parseFenceHeader(header: string) {
  const trimmed = header.trim();
  const filenameMatch = trimmed.match(/(?:filename|file)=["']?([^"'\s]+)["']?/i);
  const languageCandidate = trimmed.split(/\s+/).find((token) => token && !token.includes("="));
  const language = normalizeFenceLanguage(languageCandidate);
  return {
    language,
    filename: filenameMatch?.[1],
  };
}

function htmlBoundary(content: string) {
  const htmlStart = content.search(/<!doctype html|<html[\s>]/i);
  if (htmlStart < 0) return null;
  const htmlEndMatch = /<\/html\s*>/i.exec(content.slice(htmlStart));
  const htmlEnd = htmlEndMatch ? htmlStart + htmlEndMatch.index + htmlEndMatch[0].length : content.length;
  if (htmlEnd - htmlStart < 40) return null;
  return { htmlStart, htmlEnd };
}

function looksLikeCode(value: string) {
  const sample = value.trim();
  if (sample.length < 40) return false;
  if (/<!doctype html|<html[\s>]|<\/script\s*>|<\/style\s*>/i.test(sample)) return true;

  const lines = sample.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 3) return false;
  const codeLines = lines.filter((line) =>
    /(;|{|}|\bfunction\b|\bconst\b|\blet\b|\bvar\b|=>|<\/?[a-z][\w:-]*[\s>])/i.test(line)
  ).length;
  const markCount = (sample.match(/[{}();=<>]/g) ?? []).length;
  return codeLines / lines.length >= 0.35 && markCount >= 18;
}

function splitLooseHtml(content: string): MessageContentPart[] | null {
  const boundary = htmlBoundary(content);
  if (!boundary) return null;

  const parts: MessageContentPart[] = [];
  pushText(parts, content.slice(0, boundary.htmlStart));
  pushCode(parts, content.slice(boundary.htmlStart, boundary.htmlEnd), "html", "index.html");

  const after = content
    .slice(boundary.htmlEnd)
    .replace(/^[ \t]*```[ \t]*(?:\r?\n|$)/, "")
    .trim();
  pushText(parts, after);
  return parts.length > 0 ? parts : null;
}

function splitDanglingClosingFence(content: string): MessageContentPart[] | null {
  const firstFence = content.search(/^[ \t]*```/m);
  if (firstFence <= 0) return null;

  const before = content.slice(0, firstFence);
  if (!looksLikeCode(before)) return null;

  const afterFence = content.slice(firstFence).replace(/^[ \t]*```[ \t]?/, "").replace(/^[ \t]*\r?\n/, "");
  const parts: MessageContentPart[] = [];
  pushCode(parts, before, inferCodeLanguage(undefined, before), undefined);
  pushText(parts, afterFence);
  return parts.length > 0 ? parts : null;
}

function findClosingFence(content: string, start: number) {
  const closingRegex = /^[ \t]*```/gm;
  closingRegex.lastIndex = start;
  return closingRegex.exec(content);
}

function splitFencedCodeBlocks(content: string): MessageContentPart[] | null {
  const parts: MessageContentPart[] = [];
  const fenceRegex = /^[ \t]*```([^\r\n`]*)[ \t]*(?:\r?\n|$)/gm;
  let cursor = 0;
  let hasCode = false;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > cursor) {
      pushText(parts, content.slice(cursor, match.index));
    }

    const { language, filename } = parseFenceHeader(match[1] || "");
    const codeStart = fenceRegex.lastIndex;
    const closeMatch = findClosingFence(content, codeStart);

    if (!closeMatch) {
      const rest = content.slice(codeStart);
      if (looksLikeCode(rest) || language) {
        pushCode(parts, rest, language, filename, true);
        hasCode = true;
      } else {
        pushText(parts, content.slice(match.index));
      }
      cursor = content.length;
      break;
    }

    pushCode(parts, content.slice(codeStart, closeMatch.index), language, filename);
    hasCode = true;
    cursor = closeMatch.index + closeMatch[0].length;
    const sameLineTail = content.slice(cursor).match(/^[^\r\n]+/);
    if (sameLineTail?.[0].trim()) {
      pushText(parts, sameLineTail[0]);
      cursor += sameLineTail[0].length;
    }
    fenceRegex.lastIndex = cursor;
  }

  if (cursor < content.length) {
    pushText(parts, content.slice(cursor));
  }

  return hasCode ? parts : null;
}

export function splitMessageContent(content: string): MessageContentPart[] {
  const dangling = splitDanglingClosingFence(content);
  if (dangling) return dangling;

  const fenced = splitFencedCodeBlocks(content);
  if (fenced) return fenced;

  const looseHtml = splitLooseHtml(content);
  if (looseHtml) return looseHtml;

  return [{ type: "text", value: cleanText(content) }];
}

export function inferCodeLanguage(language: string | undefined, code: string) {
  const normalized = language?.toLowerCase();
  if (normalized && CODE_LANGUAGES.has(normalized)) return normalized;
  const trimmed = code.trim();
  if (/^<!doctype html|^<html[\s>]/i.test(trimmed)) return "html";
  if (/^\s*[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {}
  }
  if (/^(import|export|const|let|var|function)\s/m.test(trimmed)) return "javascript";
  if (/^[.#]?[a-z-]+\s*\{[\s\S]*\}/i.test(trimmed)) return "css";
  return normalized;
}

export function getCodeFilename(language?: string) {
  const normalized = language?.toLowerCase();
  const extensionMap: Record<string, string> = {
    html: "html",
    css: "css",
    js: "js",
    javascript: "js",
    ts: "ts",
    typescript: "ts",
    tsx: "tsx",
    jsx: "jsx",
    json: "json",
    py: "py",
    python: "py",
    md: "md",
    markdown: "md",
    bash: "sh",
    shell: "sh",
  };
  return `snippet.${extensionMap[normalized ?? ""] ?? normalized ?? "txt"}`;
}
