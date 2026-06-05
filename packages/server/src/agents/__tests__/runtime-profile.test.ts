import { buildAgentRuntimePrompt, chooseRuntimeAdapterOverrides, chooseRuntimeModel } from "../runtime-profile";

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
    ], { fallbackModel: "platform-default-model" })).toBeUndefined();
  });

  it("prefers private llm config from a selected custom agent", () => {
    expect(chooseRuntimeAdapterOverrides([
      { id: "planner", name: "planner", type: "planner", model: "gpt-4o-mini", tools: [], configured: true },
      {
        id: "fe",
        name: "Frontend Agent",
        type: "frontend",
        provider: "volc-ark",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: "ark-test-key",
        model: "ep-custom",
        tools: ["code_execution"],
        configured: true,
      },
    ])).toEqual({
      type: "generic-openai",
      apiKey: "ark-test-key",
      baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      model: "ep-custom",
    });
  });

  it("ignores incomplete private llm config and falls back to system model selection", () => {
    expect(chooseRuntimeAdapterOverrides([
      {
        id: "ux",
        name: "UX Reviewer",
        type: "reviewer",
        provider: "custom",
        baseURL: "https://example.com/v1",
        model: "custom-model",
        tools: ["file_read"],
        configured: true,
      },
      {
        id: "fe",
        name: "Frontend Agent",
        type: "frontend",
        provider: "inherit",
        model: "gpt-4o",
        tools: ["code_execution"],
        configured: true,
      },
    ])).toEqual({ model: "gpt-4o" });
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
