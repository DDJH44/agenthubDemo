import {
  buildInitialConversationAgentNames,
  getEffectiveEnabledAgentNames,
  resolveConversationMentions,
  resolveVisibleAgentForRole,
  selectEnabledAgentsForTask,
} from "../conversation-routing";

describe("conversation agent routing", () => {
  it("initializes group agents from selected participants instead of all defaults", () => {
    const agents = buildInitialConversationAgentNames([
      "__main__",
      "Frontend Agent",
      "Design Agent",
      "12708080461435579",
      "c20b4a7e-8ef2-4efa-8e2a-8247c1f07a77",
    ], "group");

    expect(agents).toEqual(["planner", "Frontend Agent", "Design Agent"]);
  });

  it("uses participants to override legacy default enabled entries", () => {
    const effective = getEffectiveEnabledAgentNames(
      ["__main__", "Frontend Agent"],
      "group",
      [
        { agentName: "planner", enabled: true },
        { agentName: "worker", enabled: true },
        { agentName: "critic", enabled: true },
        { agentName: "researcher", enabled: true },
        { agentName: "refiner", enabled: true },
      ]
    );

    expect(effective).toEqual(["planner", "Frontend Agent"]);
  });

  it("maps built-in task roles onto selected custom agents", () => {
    expect(selectEnabledAgentsForTask(["worker"], ["planner", "Frontend Agent", "Design Agent"])).toEqual(["Frontend Agent"]);
    expect(selectEnabledAgentsForTask(["critic"], ["planner", "Frontend Agent", "Test Agent"])).toEqual(["Test Agent"]);
    expect(selectEnabledAgentsForTask(["refiner"], ["planner", "Frontend Agent", "UX Reviewer"])).toEqual(["UX Reviewer"]);
  });

  it("resolves stream roles to visible conversation agents", () => {
    const activeAgents = ["planner", "Frontend Agent", "UX Reviewer"];

    expect(resolveVisibleAgentForRole("worker", activeAgents)).toBe("Frontend Agent");
    expect(resolveVisibleAgentForRole("refiner", activeAgents)).toBe("UX Reviewer");
    expect(resolveVisibleAgentForRole("planner", activeAgents)).toBe("planner");
  });

  it("resolves custom agent mentions with spaces or separators", () => {
    const enabledAgents = ["planner", "Frontend Builder", "claude code"];

    expect(resolveConversationMentions("@claude code", enabledAgents)).toMatchObject({
      agents: ["claude code"],
      cleanText: "",
      hasMention: true,
    });
    expect(resolveConversationMentions("@claude-code 审查一下代码", enabledAgents)).toMatchObject({
      agents: ["claude code"],
      cleanText: "审查一下代码",
      hasMention: true,
    });
    expect(resolveConversationMentions("@Frontend Builder 生成登录页", enabledAgents)).toMatchObject({
      agents: ["Frontend Builder"],
      cleanText: "生成登录页",
      hasMention: true,
    });
  });

  it("keeps built-in mention routing available", () => {
    expect(resolveConversationMentions("@worker 生成网页", ["planner", "Frontend Builder"])).toMatchObject({
      agents: ["worker"],
      cleanText: "生成网页",
      hasMention: true,
    });
    expect(resolveConversationMentions("@all 做一次检查", ["planner", "Frontend Builder"])).toMatchObject({
      isAllAgents: true,
      cleanText: "做一次检查",
      hasMention: true,
    });
  });
});
