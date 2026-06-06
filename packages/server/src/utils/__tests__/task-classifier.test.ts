import { isArtifactGenerationTask, isLightweightMentionChat, isSimpleChat } from "../task-classifier";

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
  });

  describe("isLightweightMentionChat", () => {
    it("keeps casual mentions out of task execution", () => {
      expect(isLightweightMentionChat("在吗")).toBe(true);
      expect(isLightweightMentionChat("这样可以吗")).toBe(true);
      expect(isLightweightMentionChat("先别动")).toBe(true);
      expect(isLightweightMentionChat("thanks")).toBe(true);
    });

    it("keeps concrete work requests in task execution", () => {
      expect(isLightweightMentionChat("看一下代码")).toBe(false);
      expect(isLightweightMentionChat("生成一个网站")).toBe(false);
      expect(isLightweightMentionChat("修复这个 bug")).toBe(false);
      expect(isLightweightMentionChat("部署到默认服务器")).toBe(false);
    });
  });
});
