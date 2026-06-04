import { buildAgentRuntimePrompt, chooseRuntimeModel } from "../runtime-profile";

describe("agent runtime profiles", () => {
  it("chooses a non-coordinator model preference first", () => {
    expect(chooseRuntimeModel([
      { id: "planner", name: "planner", type: "planner", model: "gpt-4o-mini", tools: [], configured: true },
      { id: "fe", name: "Frontend Agent", type: "frontend", model: "gpt-4o", tools: ["code_execution"], configured: true },
    ])).toBe("gpt-4o");
  });

  it("ignores the sample model when the server has a different default model", () => {
    expect(chooseRuntimeModel([
      { id: "fe", name: "Frontend Agent", type: "frontend", model: "gpt-4o-mini", tools: ["code_execution"], configured: true },
    ], { fallbackModel: "ep-20260508214225-g6x7g" })).toBeUndefined();
  });

  it("builds a runtime prompt from configured agents", () => {
    const prompt = buildAgentRuntimePrompt([
      {
        id: "fe",
        name: "Frontend Agent",
        type: "frontend",
        model: "gpt-4o-mini",
        systemPrompt: "你负责生成简洁可运行的前端代码。",
        tools: ["code_execution", "file_write"],
        configured: true,
      },
      { id: "ghost", name: "Ghost", type: "custom", tools: [], configured: false },
    ]);

    expect(prompt).toContain("当前会话已选智能体配置");
    expect(prompt).toContain("Frontend Agent");
    expect(prompt).toContain("你负责生成简洁可运行的前端代码。");
    expect(prompt).toContain("code_execution, file_write");
    expect(prompt).not.toContain("Ghost");
  });
});
