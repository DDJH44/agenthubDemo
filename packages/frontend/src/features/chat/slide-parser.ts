import type { Artifact } from "@agenthub/shared";

export type SlideLayout = "title" | "content" | "image" | "section" | "summary";

export type SlideBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "image"; src: string; alt?: string }
  | { type: "code"; code: string; language?: string }
  | { type: "quote"; text: string }
  | { type: "metric"; value: string; label: string; helper?: string };

export interface ParsedSlide {
  id: string;
  title: string;
  subtitle?: string;
  layout: SlideLayout;
  blocks: SlideBlock[];
  notes?: string;
}

const SLIDE_LAYOUTS = new Set<SlideLayout>(["title", "content", "image", "section", "summary"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function safeLayout(value: unknown, fallback: SlideLayout): SlideLayout {
  const layout = typeof value === "string" ? value.toLowerCase() : "";
  return SLIDE_LAYOUTS.has(layout as SlideLayout) ? layout as SlideLayout : fallback;
}

function normalizeBlock(raw: unknown): SlideBlock | null {
  if (typeof raw === "string") {
    return raw.trim() ? { type: "text", text: raw.trim() } : null;
  }

  const block = asRecord(raw);
  if (!block) return null;

  const type = String(block.type ?? block.kind ?? "text").toLowerCase();
  if (type === "heading" || type === "title") {
    const text = stringField(block.text ?? block.content ?? block.title);
    return text ? { type: "heading", text } : null;
  }
  if (type === "bullet" || type === "bullets" || type === "list") {
    const items = stringArray(block.items ?? block.children ?? block.points);
    const text = stringField(block.text ?? block.content);
    return items.length > 0 ? { type: "bullet", items } : text ? { type: "bullet", items: [text] } : null;
  }
  if (type === "image" || type === "picture") {
    const src = stringField(block.src ?? block.url ?? block.href);
    return src ? { type: "image", src, alt: stringField(block.alt ?? block.caption) } : null;
  }
  if (type === "code") {
    const code = stringField(block.code ?? block.content ?? block.text);
    return code ? { type: "code", code, language: stringField(block.language ?? block.lang) } : null;
  }
  if (type === "quote") {
    const text = stringField(block.text ?? block.content);
    return text ? { type: "quote", text } : null;
  }
  if (type === "metric" || type === "stat") {
    const value = stringField(block.value ?? block.number);
    const label = stringField(block.label ?? block.title);
    return value && label ? { type: "metric", value, label, helper: stringField(block.helper ?? block.description) } : null;
  }

  const text = stringField(block.text ?? block.content ?? block.body);
  return text ? { type: "text", text } : null;
}

function markdownBodyToBlocks(body: string): SlideBlock[] {
  const blocks: SlideBlock[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage: string | undefined;
  let inCode = false;

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ type: "text", text });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length > 0) blocks.push({ type: "bullet", items: bullets });
    bullets = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const codeFence = trimmed.match(/^```(\w*)/);
    if (codeFence) {
      if (inCode) {
        blocks.push({ type: "code", code: codeLines.join("\n"), language: codeLanguage });
        codeLines = [];
        codeLanguage = undefined;
        inCode = false;
      } else {
        flushParagraph();
        flushBullets();
        inCode = true;
        codeLanguage = codeFence[1] || undefined;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (image) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "image", alt: image[1], src: image[2] });
      continue;
    }

    const heading = trimmed.match(/^#{3,4}\s+(.+)/);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "heading", text: cleanInlineMarkdown(heading[1]) });
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)/) ?? trimmed.match(/^\d+[.)]\s+(.+)/);
    if (bullet) {
      flushParagraph();
      bullets.push(cleanInlineMarkdown(bullet[1]));
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "quote", text: cleanInlineMarkdown(trimmed.replace(/^>\s?/, "")) });
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCode) blocks.push({ type: "code", code: codeLines.join("\n"), language: codeLanguage });
  flushParagraph();
  flushBullets();

  return blocks;
}

function splitMarkdownSlides(markdown: string): string[] {
  const content = markdown.replace(/\r\n/g, "\n").trim();
  if (!content) return [];
  if (/^---+$/m.test(content)) {
    return content.split(/^---+$/m).map((part) => part.trim()).filter(Boolean);
  }

  const lines = content.split("\n");
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^#{1,2}\s+/.test(line.trim())) starts.push(index);
  });
  if (starts.length === 0) return [content];

  const parts: string[] = [];
  if (starts[0] > 0) {
    const preface = lines.slice(0, starts[0]).join("\n").trim();
    if (preface) parts.push(preface);
  }
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    parts.push(lines.slice(start, end).join("\n").trim());
  });
  return parts.filter(Boolean);
}

function parseMarkdownSlide(segment: string, index: number): ParsedSlide {
  const lines = segment.split("\n");
  const titleLineIndex = lines.findIndex((line) => /^#{1,2}\s+/.test(line.trim()));
  const title = titleLineIndex >= 0
    ? cleanInlineMarkdown(lines[titleLineIndex].replace(/^#{1,2}\s+/, ""))
    : `Slide ${index + 1}`;
  const bodyLines = titleLineIndex >= 0
    ? [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)]
    : lines;

  const notes: string[] = [];
  const contentLines: string[] = [];
  let inNotes = false;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (/^(notes?|speaker notes?)\s*[:：]/i.test(trimmed)) {
      inNotes = true;
      const noteText = trimmed.replace(/^(notes?|speaker notes?)\s*[:：]/i, "").trim();
      if (noteText) notes.push(noteText);
      continue;
    }
    if (inNotes) notes.push(line);
    else contentLines.push(line);
  }

  const blocks = markdownBodyToBlocks(contentLines.join("\n"));
  return {
    id: `slide-${index + 1}`,
    title,
    layout: index === 0 && blocks.length <= 2 ? "title" : "content",
    blocks,
    notes: notes.join("\n").trim() || undefined,
  };
}

function normalizeJsonSlide(raw: unknown, index: number): ParsedSlide | null {
  const slide = asRecord(raw);
  if (!slide) return null;
  const title = stringField(slide.title ?? slide.heading ?? slide.name) ?? `Slide ${index + 1}`;
  const subtitle = stringField(slide.subtitle ?? slide.kicker ?? slide.description);
  const rawBlocks = Array.isArray(slide.blocks)
    ? slide.blocks
    : Array.isArray(slide.content)
      ? slide.content
      : [];
  const blocks = rawBlocks.map(normalizeBlock).filter(Boolean) as SlideBlock[];
  const bullets = stringArray(slide.bullets ?? slide.points ?? slide.items);
  if (bullets.length > 0) blocks.push({ type: "bullet", items: bullets });

  const content = stringField(slide.content ?? slide.body ?? slide.text);
  if (content) blocks.push(...markdownBodyToBlocks(content));

  return {
    id: stringField(slide.id) ?? `slide-${index + 1}`,
    title,
    subtitle,
    layout: safeLayout(slide.layout, index === 0 ? "title" : "content"),
    blocks,
    notes: stringField(slide.notes ?? slide.speakerNotes),
  };
}

function parseSlidesFromJson(content: string): ParsedSlide[] {
  try {
    const data = JSON.parse(content);
    const record = asRecord(data);
    const rawSlides = Array.isArray(data)
      ? data
      : Array.isArray(record?.slides)
        ? record.slides
        : Array.isArray(record?.pages)
          ? record.pages
          : [];
    return rawSlides.map(normalizeJsonSlide).filter(Boolean) as ParsedSlide[];
  } catch {
    return [];
  }
}

function parseSlidesFromMarkdown(content: string): ParsedSlide[] {
  return splitMarkdownSlides(content).map(parseMarkdownSlide);
}

export function parseSlidesArtifact(artifact: Pick<Artifact, "content" | "filename" | "type">): ParsedSlide[] {
  const content = artifact.content?.trim() ?? "";
  if (!content) return [];

  const filename = artifact.filename?.toLowerCase() ?? "";
  const shouldTryJson = artifact.type === "slides" || filename.endsWith(".json") || content.startsWith("{") || content.startsWith("[");
  if (shouldTryJson) {
    const jsonSlides = parseSlidesFromJson(content);
    if (jsonSlides.length > 0) return jsonSlides;
  }

  return parseSlidesFromMarkdown(content);
}
