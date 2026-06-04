import { artifactAnswerFromTool } from "../agent-loop";

describe("agent loop artifact handoff", () => {
  it("turns a successful write_file html action into a code artifact answer", () => {
    const answer = artifactAnswerFromTool("write_file", {
      path: "index.html",
      content: "<!DOCTYPE html><html><head><title>Demo</title></head><body><h1>OK</h1></body></html>",
    });

    expect(answer).toContain("Generated artifact: index.html");
    expect(answer).toContain("```html");
    expect(answer).toContain("<!DOCTYPE html>");
  });

  it("ignores short non-artifact writes", () => {
    expect(artifactAnswerFromTool("write_file", {
      path: "notes.tmp",
      content: "small note",
    })).toBeUndefined();
  });
});
