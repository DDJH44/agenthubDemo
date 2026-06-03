import { TextDecoder } from "util";

// 语义 Chunk 引擎：按文档结构切分，不做固定长度硬切

interface ChunkResult {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  sectionTitle?: string;
  chunkType: "heading" | "paragraph" | "code_block" | "table" | "list_item";
  metadata?: Record<string, unknown>;
}

interface LinkedChunk extends ChunkResult {
  prevChunkId?: string;
  nextChunkId?: string;
}

function estimateTokens(text: string): number {
  // 中文约 1.5 字符/token，英文约 4 字符/token
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const other = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + other / 4);
}

// Layer 1: 文档结构解析
function splitBySections(text: string, fileType?: string): Array<{ title?: string; content: string }> {
  if (fileType === "md" || fileType === "markdown") {
    return splitMarkdownSections(text);
  }
  // fallback: 按连续空行拆分
  const sections: Array<{ title?: string; content: string }> = [];
  const paragraphs = text.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    sections.push({ content: trimmed });
  }
  return sections;
}

function splitMarkdownSections(text: string): Array<{ title?: string; content: string }> {
  const sections: Array<{ title?: string; content: string }> = [];
  const lines = text.split("\n");
  let currentTitle: string | undefined;
  let buffer = "";

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      if (buffer.trim()) sections.push({ title: currentTitle, content: buffer.trim() });
      currentTitle = headerMatch[2];
      buffer = line + "\n";
    } else {
      buffer += line + "\n";
    }
  }
  if (buffer.trim()) sections.push({ title: currentTitle, content: buffer.trim() });
  return sections;
}

// Layer 2: 语义单元切分
function splitSemantic(section: { title?: string; content: string }, maxTokens: number): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let index = 0;

  // 检测代码块
  const codeBlocks: string[] = section.content.match(/```[\s\S]*?```/g) || [];
  let remaining = section.content;

  for (let ci = 0; ci < codeBlocks.length; ci++) {
    remaining = remaining.replace(codeBlocks[ci], `__CODE_BLOCK_${ci}__`);
  }

  // 按段落切分
  const parts = remaining.split(/\n\n+/);
  let buffer = "";
  let bufferTokens = 0;

  const flush = () => {
    if (!buffer.trim()) return;
    const type = buffer.startsWith("__CODE_BLOCK_") ? "code_block" as const : buffer.match(/^#{1,6}\s/) ? "heading" as const : buffer.match(/^[-*+]\s|\d+\.\s/) ? "list_item" as const : "paragraph" as const;
    chunks.push({ chunkIndex: index++, content: buffer.trim(), tokenCount: estimateTokens(buffer), sectionTitle: section.title, chunkType: type });
    buffer = ""; bufferTokens = 0;
  };

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    // 还原代码块
    for (let j = 0; j < codeBlocks.length; j++) {
      part = part.replace(`__CODE_BLOCK_${j}__`, codeBlocks[j] as string);
    }

    const partTokens = estimateTokens(part);

    if (bufferTokens + partTokens > maxTokens && bufferTokens > 0) {
      flush();
    }

    if (partTokens > maxTokens) {
      // 单个超长元素：在句子边界断开
      if (buffer) flush();
      const sentences = part.split(/(?<=[。！？.!?\n])\s*/);
      let subBuffer = "";
      let subTokens = 0;
      for (const s of sentences) {
        const st = estimateTokens(s);
        if (subTokens + st > maxTokens && subTokens > 0) {
          chunks.push({ chunkIndex: index++, content: subBuffer.trim(), tokenCount: subTokens, sectionTitle: section.title, chunkType: "paragraph" });
          subBuffer = s; subTokens = st;
        } else {
          subBuffer += s; subTokens += st;
        }
      }
      if (subBuffer.trim()) {
        chunks.push({ chunkIndex: index++, content: subBuffer.trim(), tokenCount: subTokens, sectionTitle: section.title, chunkType: "paragraph" });
      }
    } else {
      buffer += (buffer ? "\n\n" : "") + part;
      bufferTokens += partTokens;
    }
  }
  flush();
  return chunks;
}

// Layer 3: 上下文链表链接
function linkChunks(chunks: ChunkResult[]): LinkedChunk[] {
  const linked: LinkedChunk[] = chunks.map((c, i) => ({
    ...c,
    prevChunkId: i > 0 ? `chunk-${i - 1}` : undefined,
    nextChunkId: i < chunks.length - 1 ? `chunk-${i + 1}` : undefined,
  }));
  return linked;
}

// 主入口
export function chunkDocument(
  text: string,
  options?: { maxTokens?: number; fileType?: string }
): LinkedChunk[] {
  const maxTokens = options?.maxTokens ?? 600;
  const sections = splitBySections(text, options?.fileType);

  const allChunks: ChunkResult[] = [];
  for (const section of sections) {
    const sectionChunks = splitSemantic(section, maxTokens);
    allChunks.push(...sectionChunks);
  }

  // 重新编号
  const reindexed = allChunks.map((c, i) => ({ ...c, chunkIndex: i }));

  return linkChunks(reindexed);
}

export function parseFileContent(buffer: Buffer, fileType: string): string {
  const text = decodeTextBuffer(buffer);

  if (fileType === "html") {
    return text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return text;
}

function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length === 0) return "";

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return cleanupDecodedText(new TextDecoder("utf-16le").decode(buffer.subarray(2)));
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return cleanupDecodedText(new TextDecoder("utf-16le").decode(swapped));
  }

  try {
    return cleanupDecodedText(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    // Windows/legacy Chinese text files are often GBK/GB18030. This fallback
    // prevents knowledge-base snippets from becoming mojibake after upload.
    try {
      return cleanupDecodedText(new TextDecoder("gb18030").decode(buffer));
    } catch {
      return cleanupDecodedText(buffer.toString("utf-8"));
    }
  }
}

function cleanupDecodedText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
