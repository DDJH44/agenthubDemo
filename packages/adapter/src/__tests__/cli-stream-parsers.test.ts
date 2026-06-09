import { extractClaudeStreamText } from "../claude-code/ClaudeCodeAdapter";
import { extractCodexStreamText } from "../codex/CodexAdapter";

describe("CLI stream parsers", () => {
  it("extracts visible Claude Code text deltas and ignores thinking deltas", () => {
    expect(extractClaudeStreamText(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "internal reasoning" },
      },
    }))).toEqual({});

    expect(extractClaudeStreamText(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "测试" },
      },
    }))).toEqual({ chunk: "测试" });

    expect(extractClaudeStreamText(JSON.stringify({
      type: "result",
      result: "测试流",
    }))).toEqual({ final: "测试流" });
  });

  it("extracts Codex output text deltas from JSONL events", () => {
    expect(extractCodexStreamText(JSON.stringify({
      type: "response.output_text.delta",
      delta: "增量",
    }))).toEqual({ chunk: "增量" });

    expect(extractCodexStreamText(JSON.stringify({
      type: "agent_message_delta",
      delta: { text: "内容" },
    }))).toEqual({ chunk: "内容" });
  });

  it("uses completed Codex assistant messages as final fallback without leaking internals", () => {
    expect(extractCodexStreamText(JSON.stringify({
      type: "item.completed",
      item: { type: "reasoning", text: "hidden reasoning" },
    }))).toEqual({});

    expect(extractCodexStreamText(JSON.stringify({
      type: "item.completed",
      item: { type: "assistant_message", text: "最终回答" },
    }))).toEqual({ final: "最终回答" });
  });
});
