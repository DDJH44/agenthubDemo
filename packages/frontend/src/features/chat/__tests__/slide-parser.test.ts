import { parseSlidesArtifact } from "../slide-parser";
import { getPptxFilename } from "../pptx-export";

describe("slide parser", () => {
  it("parses structured slide JSON", () => {
    const slides = parseSlidesArtifact({
      type: "slides",
      filename: "deck.json",
      content: JSON.stringify({
        slides: [
          {
            title: "AgentHub",
            subtitle: "多 Agent 协作",
            blocks: [
              { type: "metric", value: "3", label: "核心能力" },
              { type: "bullet", items: ["主 Agent 调度", "产物预览", "自动部署"] },
            ],
            notes: "开场页",
          },
        ],
      }),
    });

    expect(slides).toHaveLength(1);
    expect(slides[0].title).toBe("AgentHub");
    expect(slides[0].blocks).toHaveLength(2);
    expect(slides[0].notes).toBe("开场页");
  });

  it("parses markdown slides separated by rules", () => {
    const slides = parseSlidesArtifact({
      type: "slides",
      filename: "deck.md",
      content: [
        "# 项目背景",
        "- 课题要求",
        "- 多 Agent 协作",
        "Notes: 这里讲背景",
        "---",
        "## 技术方案",
        "### 展示层",
        "- React 渲染",
        "- JSON 驱动",
      ].join("\n"),
    });

    expect(slides).toHaveLength(2);
    expect(slides[0].title).toBe("项目背景");
    expect(slides[0].notes).toBe("这里讲背景");
    expect(slides[0].blocks[0]).toMatchObject({ type: "bullet", items: ["课题要求", "多 Agent 协作"] });
    expect(slides[1].blocks[0]).toMatchObject({ type: "heading", text: "展示层" });
  });

  it("falls back to one slide for plain content", () => {
    const slides = parseSlidesArtifact({
      type: "slides",
      filename: "notes.md",
      content: "这是一个没有标题的演示内容。",
    });

    expect(slides).toHaveLength(1);
    expect(slides[0].title).toBe("Slide 1");
    expect(slides[0].blocks[0]).toMatchObject({ type: "text" });
  });

  it("normalizes generated slide filenames to pptx", () => {
    expect(getPptxFilename("acceptance-demo.slides.md")).toBe("acceptance-demo.pptx");
    expect(getPptxFilename("review-deck.json")).toBe("review-deck.pptx");
    expect(getPptxFilename("final.pptx")).toBe("final.pptx");
  });
});
