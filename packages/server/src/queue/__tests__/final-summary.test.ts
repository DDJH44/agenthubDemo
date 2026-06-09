import { shouldCreateFinalSummaryMessage, stripCodeFromFinalSummary } from "../memory";

describe("queue final summary handling", () => {
  it("replaces code-heavy final summaries with a concise artifact handoff", () => {
    const summary = [
      "我来帮你生成一个小游戏网页。",
      "```html",
      "<!DOCTYPE html><html><body>demo</body></html>",
      "```",
      "玩法说明会在页面里展示。",
    ].join("\n");

    expect(stripCodeFromFinalSummary(summary, true, "生成一个简单的贪吃蛇小游戏网页")).toBe(
      "已生成产物：一个简单的贪吃蛇小游戏网页\n\n代码已放入产物卡片，可预览、继续编辑或部署。"
    );
  });

  it("skips final summary messages that duplicate the only streamed result", () => {
    const final = {
      summary: "还没看到已生成的产物，可以继续让我生成一份。",
      stepResults: [{ result: "还没看到已生成的产物，可以继续让我生成一份。" }],
    };

    expect(shouldCreateFinalSummaryMessage(final, String(final.summary), {
      hasPublishedCodeArtifacts: false,
      deliverableArtifactCreated: false,
    })).toBe(false);
  });

  it("keeps concise handoff messages for published code artifacts", () => {
    const final = {
      summary: "完整代码已生成。",
      stepResults: [{ result: "完整代码已生成。" }],
    };

    expect(shouldCreateFinalSummaryMessage(final, "已生成产物：index.html", {
      hasPublishedCodeArtifacts: true,
      deliverableArtifactCreated: false,
    })).toBe(true);
  });
});
