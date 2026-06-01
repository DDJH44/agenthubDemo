import type { IAdapter } from "@agenthub/adapter";
import { parseMentions } from "@agenthub/shared";
import { AgentRegistry } from "../agents/registry";
import { createOrchestrator, type StreamEvent } from "../orchestrator/index";

export class OrchestrationService {
  private adapter?: IAdapter;
  constructor(adapter?: IAdapter) { this.adapter = adapter; }
  setAdapter(adapter: IAdapter): void { this.adapter = adapter; }

  async handleMessage(text: string, onStream: (e: StreamEvent) => void) {
    const { agents, cleanText, isAllAgents } = parseMentions(text);
    if (isAllAgents || agents.length === 0) {
      const orchestrator = createOrchestrator(this.adapter);
      return orchestrator.run(cleanText || text, onStream);
    }
    const registry = new AgentRegistry(this.adapter);
    for (const agentName of agents) {
      const agent = registry.get<{ run: (input: unknown, onStream?: (msg: string) => void) => Promise<unknown> }>(agentName);
      if (agent) {
        onStream({ type: "system", msg: `派发到 @${agentName}` });
        await agent.run({ task: cleanText }, (chunk) => onStream({ type: "stream", msg: `[${agentName}] ${chunk}` }));
      }
    }
    return { agents, cleanText };
  }
}
