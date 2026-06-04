import { splitMessageContent } from "../message-content-parser";

const HTML_CODE = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Demo</title></head>
<body>
  <canvas id="stage"></canvas>
  <script>
    const canvas = document.getElementById("stage");
    function renderLoop() {
      requestAnimationFrame(renderLoop);
    }
    renderLoop();
  </script>
</body>
</html>`;

describe("message content parser", () => {
  it("keeps fenced html in a code part and surrounding prose as text", () => {
    const parts = splitMessageContent(`这是可直接运行的页面：\n\n\`\`\`html\n${HTML_CODE}\n\`\`\`\n\n交付已完成，可以预览。`);

    expect(parts.map((part) => part.type)).toEqual(["text", "code", "text"]);
    expect(parts[1]).toMatchObject({ type: "code", language: "html", value: HTML_CODE });
    expect(parts[2]).toMatchObject({ type: "text" });
    expect(parts[2].value).toContain("交付已完成");
  });

  it("splits loose html from trailing delivery notes", () => {
    const parts = splitMessageContent(`这里是完整产物：\n${HTML_CODE}\n\n交付说明：页面已完成。`);

    expect(parts.map((part) => part.type)).toEqual(["text", "code", "text"]);
    expect(parts[1]).toMatchObject({ type: "code", language: "html", filename: "index.html" });
    expect(parts[1].value).toContain("</html>");
    expect(parts[1].value).not.toContain("交付说明");
    expect(parts[2].value).toContain("交付说明");
  });

  it("splits html at the beginning from following prose", () => {
    const parts = splitMessageContent(`${HTML_CODE}\n\n交付说明：可以直接预览。`);

    expect(parts.map((part) => part.type)).toEqual(["code", "text"]);
    expect(parts[0]).toMatchObject({ type: "code", language: "html" });
    expect(parts[0].value).not.toContain("交付说明");
    expect(parts[1].value).toContain("可以直接预览");
  });

  it("treats a dangling closing fence after code as text boundary", () => {
    const parts = splitMessageContent(`${HTML_CODE}\n\`\`\`\n萌宠乐园已交付。\n\n## 执行 Agent 工作报告`);

    expect(parts.map((part) => part.type)).toEqual(["code", "text"]);
    expect(parts[0]).toMatchObject({ type: "code", language: "html" });
    expect(parts[0].value).toContain("renderLoop");
    expect(parts[0].value).not.toContain("萌宠乐园已交付");
    expect(parts[1].value).toContain("萌宠乐园已交付");
    expect(parts[1].value).toContain("执行 Agent 工作报告");
  });

  it("does not turn an unmatched prose fence into a code card", () => {
    const parts = splitMessageContent("我会继续处理这个任务。\n```交付说明\n这不是代码，只是一段说明。");

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "text" });
    expect(parts[0].value).toContain("这不是代码");
  });
});
