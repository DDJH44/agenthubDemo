import { isDocumentRequest, shouldRenderDocumentCompletion } from "../assistant-intent";

describe("assistant intent", () => {
  it("does not treat image description as a document request", () => {
    const query = [
      "描述图片内容",
      "",
      "附件上下文：",
      "1. 照片：screen.png（image/png，2.8 MB）",
      "说明：图片内容已随本次请求发送给模型，请直接结合图片画面回答用户问题。",
    ].join("\n");

    expect(isDocumentRequest(query)).toBe(false);
    expect(isDocumentRequest("为什么你会生成文档")).toBe(false);
  });

  it("renders document completion only after an explicit document request", () => {
    const longStructuredAnswer = [
      "# 图片内容分析",
      "这张图展示了一个应用界面。",
      "## 可见主体",
      "- 左侧是导航",
      "- 中间是聊天区",
      "- 底部是输入框",
      "## 可能问题",
      "- 文档卡片被错误触发",
      "- 回复没有直接描述图片",
    ].join("\n").repeat(8);

    expect(shouldRenderDocumentCompletion([
      { role: "user", content: "描述图片内容" },
      { role: "assistant", content: longStructuredAnswer },
    ], 1)).toBe(false);

    expect(shouldRenderDocumentCompletion([
      { role: "user", content: "帮我生成一份图片分析报告" },
      { role: "assistant", content: longStructuredAnswer },
    ], 1)).toBe(true);
  });
});
