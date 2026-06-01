import type { IAdapter } from "@agenthub/adapter";
import { PlannerAgent } from "./planner";
import { WorkerAgent } from "./worker";
import { CriticAgent } from "./critic";
import { ResearcherAgent } from "./researcher";
import { RefinerAgent } from "./refiner";
import { MemoryStore } from "../memory/store";

export class AgentRegistry {
  private agents = new Map<string, PlannerAgent | WorkerAgent | CriticAgent | ResearcherAgent | RefinerAgent>();

  constructor(adapter?: IAdapter) {
    const memory = new MemoryStore();
    this.agents.set("planner", new PlannerAgent(adapter));
    this.agents.set("worker", new WorkerAgent(memory, adapter));
    this.agents.set("critic", new CriticAgent(adapter));
    this.agents.set("researcher", new ResearcherAgent(adapter));
    this.agents.set("refiner", new RefinerAgent(adapter));
  }

  get<T>(name: string): T | undefined { return this.agents.get(name) as T | undefined; }
  list(): string[] { return Array.from(this.agents.keys()); }
  setAdapter(adapter: IAdapter): void { for (const agent of this.agents.values()) agent.setAdapter(adapter); }
}
