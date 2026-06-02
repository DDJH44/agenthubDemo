import { isArtifactGenerationTask, isSimpleChat } from "../task-classifier";

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
    });

    it("does not route pure analysis or casual chat to artifact generation", () => {
      expect(isArtifactGenerationTask("你好")).toBe(false);
      expect(isArtifactGenerationTask("请分析一下这个市场趋势")).toBe(false);
      expect(isArtifactGenerationTask("帮我写一份详细方案")).toBe(false);
    });
  });
});
