declare module "@e2b/code-interpreter" {
  interface CodeResult {
    logs: { stdout: string[]; stderr: string[] };
    text: string;
    error?: { value: string };
  }
  export class Sandbox {
    static create(): Promise<Sandbox>;
    runCode(code: string, options?: { language?: string }): Promise<CodeResult>;
    close(): Promise<void>;
  }
}
