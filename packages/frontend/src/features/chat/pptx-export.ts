import type { ParsedSlide, SlideBlock } from "./slide-parser";

const PPTX_EXTENSION_RE = /\.(ppt|pptx|md|markdown|json)$/i;

function cleanText(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function getPptxFilename(filename?: string) {
  const raw = (filename || "agenthub-slides.pptx").trim();
  if (/\.pptx$/i.test(raw)) return raw;
  const withoutKnownExt = raw
    .replace(/\.slides\.(md|markdown|json)$/i, "")
    .replace(PPTX_EXTENSION_RE, "");
  return `${withoutKnownExt || "agenthub-slides"}.pptx`;
}

export async function downloadSlidesAsPptx(slides: ParsedSlide[], filename?: string) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  const fileName = getPptxFilename(filename);

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AgentHub";
  pptx.company = "AgentHub";
  pptx.subject = "AgentHub generated presentation";
  pptx.title = fileName.replace(/\.pptx$/i, "");
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  const renderBlock = (slide: ReturnType<typeof pptx.addSlide>, block: SlideBlock, y: number) => {
    switch (block.type) {
      case "heading":
        slide.addText(truncateText(cleanText(block.text), 84), {
          x: 0.75,
          y,
          w: 11.8,
          h: 0.35,
          fontFace: "Aptos Display",
          fontSize: 18,
          bold: true,
          color: "16213E",
          margin: 0,
        });
        return y + 0.52;
      case "bullet":
        slide.addText(block.items.map((item) => `• ${truncateText(cleanText(item), 96)}`).join("\n"), {
          x: 0.9,
          y,
          w: 11.6,
          h: Math.min(2.25, Math.max(0.55, block.items.length * 0.35)),
          fontSize: 15,
          breakLine: false,
          color: "334155",
          margin: 0.02,
          fit: "shrink",
        });
        return y + Math.min(2.4, Math.max(0.72, block.items.length * 0.38));
      case "metric":
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.75,
          y,
          w: 3.4,
          h: 1.05,
          rectRadius: 0.08,
          fill: { color: "EEF2FF" },
          line: { color: "D8DDFC" },
        });
        slide.addText(block.value, {
          x: 0.95,
          y: y + 0.15,
          w: 2.95,
          h: 0.38,
          fontSize: 24,
          bold: true,
          color: "4F46E5",
          margin: 0,
        });
        slide.addText(truncateText(cleanText(block.label), 34), {
          x: 0.95,
          y: y + 0.58,
          w: 2.95,
          h: 0.28,
          fontSize: 10,
          bold: true,
          color: "16213E",
          margin: 0,
        });
        if (block.helper) {
          slide.addText(truncateText(cleanText(block.helper), 42), {
            x: 4.35,
            y: y + 0.28,
            w: 7.6,
            h: 0.35,
            fontSize: 12,
            color: "64748B",
            margin: 0,
          });
        }
        return y + 1.24;
      case "code":
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.75,
          y,
          w: 11.8,
          h: 1.35,
          rectRadius: 0.08,
          fill: { color: "111827" },
          line: { color: "1F2937" },
        });
        slide.addText(truncateText(block.code, 520), {
          x: 0.95,
          y: y + 0.15,
          w: 11.4,
          h: 1.05,
          fontFace: "Cascadia Mono",
          fontSize: 8.5,
          color: "E5EDFF",
          breakLine: false,
          fit: "shrink",
          margin: 0,
        });
        return y + 1.55;
      case "quote":
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.75,
          y,
          w: 0.06,
          h: 0.55,
          fill: { color: "5B5CF6" },
          line: { color: "5B5CF6" },
        });
        slide.addText(truncateText(cleanText(block.text), 160), {
          x: 0.95,
          y,
          w: 11.3,
          h: 0.58,
          italic: true,
          fontSize: 13,
          color: "475569",
          margin: 0,
        });
        return y + 0.78;
      case "image":
        slide.addText(truncateText(block.alt || "图片内容已保留在 AgentHub 预览中", 64), {
          x: 0.75,
          y,
          w: 11.8,
          h: 0.38,
          fontSize: 12,
          color: "64748B",
          margin: 0,
        });
        return y + 0.56;
      case "text":
      default:
        slide.addText(truncateText(cleanText(block.text), 280), {
          x: 0.75,
          y,
          w: 11.8,
          h: 0.86,
          fontSize: 14,
          color: "334155",
          breakLine: false,
          fit: "shrink",
          margin: 0,
        });
        return y + 1.02;
    }
  };

  slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    const title = item.title || `Slide ${index + 1}`;
    slide.background = { color: "F8FAFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.22,
      fill: { color: "5B5CF6" },
      line: { color: "5B5CF6" },
    });
    slide.addText("AgentHub", {
      x: 0.75,
      y: 0.45,
      w: 1.55,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: "5B5CF6",
      margin: 0,
    });
    slide.addText(title, {
      x: 0.75,
      y: 0.88,
      w: 11.8,
      h: 0.62,
      fontFace: "Aptos Display",
      fontSize: item.layout === "title" ? 30 : 24,
      bold: true,
      color: "0F172A",
      margin: 0,
      fit: "shrink",
    });
    if (item.subtitle) {
      slide.addText(truncateText(cleanText(item.subtitle), 120), {
        x: 0.75,
        y: 1.58,
        w: 11.8,
        h: 0.35,
        fontSize: 13,
        color: "64748B",
        margin: 0,
      });
    }

    let cursorY = item.subtitle ? 2.18 : 1.88;
    for (const block of item.blocks.slice(0, 8)) {
      if (cursorY > 6.45) break;
      cursorY = renderBlock(slide, block, cursorY);
    }
    if (item.notes) {
      slide.addNotes(item.notes);
    }
    slide.addText(`${index + 1} / ${slides.length}`, {
      x: 11.55,
      y: 7.05,
      w: 1.05,
      h: 0.22,
      fontSize: 8.5,
      color: "94A3B8",
      margin: 0,
      align: "right",
    });
  });

  await pptx.writeFile({ fileName, compression: true });
}
