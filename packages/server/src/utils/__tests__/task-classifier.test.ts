import { isArtifactGenerationTask, isContextualQuoteChat, isDeliverableGenerationTask, isLightweightMentionChat, isSimpleChat, parseComposerQuoteIntent } from "../task-classifier";

describe("task classifier", () => {
  describe("isSimpleChat", () => {
    it("keeps greetings in lightweight chat mode", () => {
      expect(isSimpleChat("你好")).toBe(true);
      expect(isSimpleChat("你是谁")).toBe(true);
    });

    it("does not treat creation requests as simple chat", () => {
      expect(isSimpleChat("生成一个小型的放烟花网站")).toBe(false);
      expect(isSimpleChat("帮我做一个 todo 页面")).toBe(false);
    });
  });

  describe("isArtifactGenerationTask", () => {
    it("detects small website and page generation requests", () => {
      expect(isArtifactGenerationTask("生成一个小型的放烟花网站")).toBe(true);
      expect(isArtifactGenerationTask("帮我做一个 todo 页面")).toBe(true);
      expect(isArtifactGenerationTask("create a simple fireworks demo")).toBe(true);
      expect(isArtifactGenerationTask("生成番茄钟")).toBe(true);
      expect(isArtifactGenerationTask("帮我做一个番茄钟应用")).toBe(true);
      expect(isArtifactGenerationTask("create a pomodoro timer")).toBe(true);
      expect(isArtifactGenerationTask("做一个有后端的图书管理系统 轻量化")).toBe(true);
      expect(isArtifactGenerationTask("创建一个图书馆借阅 CRUD 后台")).toBe(true);
    });

    it("does not route pure analysis or casual chat to artifact generation", () => {
      expect(isArtifactGenerationTask("你好")).toBe(false);
      expect(isArtifactGenerationTask("请分析一下这个市场趋势")).toBe(false);
      expect(isArtifactGenerationTask("帮我写一份详细方案")).toBe(false);
    });

    it("keeps duplicate artifact questions out of artifact generation", () => {
      expect(isArtifactGenerationTask("\u4e3a\u4ec0\u4e48\u751f\u62103\u4efd\u76f8\u540c\u7684index.html")).toBe(false);
      expect(isArtifactGenerationTask("why did you generate duplicate index.html files?")).toBe(false);
    });
  });

  describe("isDeliverableGenerationTask", () => {
    it("detects document and slides deliverable requests", () => {
      expect(isDeliverableGenerationTask("生成一份文档说明")).toBe(true);
      expect(isDeliverableGenerationTask("重新生成一份文档")).toBe(true);
      expect(isDeliverableGenerationTask("帮我整理一份项目结题报告")).toBe(true);
      expect(isDeliverableGenerationTask("制作一个答辩 PPT")).toBe(true);
    });

    it("keeps complaints and casual chat out of task execution", () => {
      expect(isDeliverableGenerationTask("为什么你会生成文档")).toBe(false);
      expect(isDeliverableGenerationTask("不要生成文档")).toBe(false);
      expect(isDeliverableGenerationTask("你好")).toBe(false);
    });
  });

  describe("isLightweightMentionChat", () => {
    it("keeps casual mentions out of task execution", () => {
      expect(isLightweightMentionChat("在吗")).toBe(true);
      expect(isLightweightMentionChat("这样可以吗")).toBe(true);
      expect(isLightweightMentionChat("先别动")).toBe(true);
      expect(isLightweightMentionChat("thanks")).toBe(true);
    });

    it("treats duplicate artifact questions as lightweight mention chat", () => {
      expect(isLightweightMentionChat("\u4e3a\u4ec0\u4e48\u751f\u62103\u4efd\u76f8\u540c\u7684index.html")).toBe(true);
      expect(isLightweightMentionChat("why did you generate duplicate index.html files?")).toBe(true);
    });

    it("keeps concrete work requests in task execution", () => {
      expect(isLightweightMentionChat("看一下代码")).toBe(false);
      expect(isLightweightMentionChat("生成一个网站")).toBe(false);
      expect(isLightweightMentionChat("修复这个 bug")).toBe(false);
      expect(isLightweightMentionChat("部署到默认服务器")).toBe(false);
    });
  });

  describe("parseComposerQuoteIntent", () => {
    it("keeps quote-only snippets out of task execution", () => {
      const quote = parseComposerQuoteIntent("引用 PMO 主 Agent：\n> 「选区 · index.html · L4-7」，");
      expect(quote.hasQuote).toBe(true);
      expect(quote.quoteOnly).toBe(true);
      expect(quote.shouldExecute).toBe(false);
      expect(isContextualQuoteChat("引用 PMO 主 Agent：\n> 「选区 · index.html · L4-7」，")).toBe(true);
    });

    it("treats quote questions as lightweight contextual chat", () => {
      expect(isContextualQuoteChat("引用 PMO 主 Agent：\n> 「选区 · index.html · L4-7」，\n\n这是什么意思")).toBe(true);
    });

    it("allows explicit quote execution requests to continue into the task flow", () => {
      const quote = parseComposerQuoteIntent("引用 Frontend Builder：\n> <meta charset=\"UTF-8\">\n\n把这段优化一下并更新到代码里");
      expect(quote.hasQuote).toBe(true);
      expect(quote.quoteOnly).toBe(false);
      expect(quote.shouldExecute).toBe(true);
      expect(isContextualQuoteChat("引用 Frontend Builder：\n> <meta charset=\"UTF-8\">\n\n把这段优化一下并更新到代码里")).toBe(false);
    });
  });
});
