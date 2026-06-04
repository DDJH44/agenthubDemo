import {
  buildInitialConversationAgentNames,
  getEffectiveEnabledAgentNames,
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
});
