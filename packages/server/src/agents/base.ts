import type { IAdapter } from "@agenthub/adapter";
export abstract class BaseAgent {
  name: string;
  protected adapter?: IAdapter;
  constructor(name: string, adapter?: IAdapter) { this.name = name; this.adapter = adapter; }
  setAdapter(adapter: IAdapter): void { this.adapter = adapter; }
  abstract run(input: unknown, onStream?: (msg: string) => void): Promise<unknown>;
}
