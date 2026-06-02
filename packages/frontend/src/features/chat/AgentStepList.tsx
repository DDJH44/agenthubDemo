"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChatStore } from "@/stores/chat-store";

const TOOL_META: Record<string, { label: string; short: string }> = {
  read_file: { label: "读取文件", short: "READ" },
  write_file: { label: "写入文件", short: "WRITE" },
  edit_file: { label: "编辑文件", short: "EDIT" },
  bash: { label: "执行命令", short: "CMD" },
  glob: { label: "搜索文件", short: "GLOB" },
  grep: { label: "搜索内容", short: "GREP" },
  search: { label: "网络搜索", short: "WEB" },
  code: { label: "代码沙箱", short: "CODE" },
  "web-fetch": { label: "网页抓取", short: "FETCH" },
  deploy: { label: "一键部署", short: "DEPLOY" },
};

function StepIcon({ final }: { final: boolean }) {
  return final ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function AgentStepList() {
  const agentSteps = useChatStore((s) => s.agentSteps);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const [expanded, setExpanded] = useState(false);
  const latestStep = agentSteps[agentSteps.length - 1];

  if (agentSteps.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: "1px solid var(--border)", background: "var(--surface-tinted)" }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          style={{ background: expanded ? "var(--surface-white)" : "transparent", borderBottom: expanded ? "1px solid var(--border)" : "none" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
              style={{ color: "var(--accent)", background: "var(--surface-white)", border: "1px solid var(--accent-border)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 18 22 12 16 6" />
                <path d="M8 6 2 12l6 6" />
                <path d="m14 4-4 16" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                  Agent 执行过程
                </span>
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)" }}>
                  {agentSteps.length} 步
                </span>
              </div>
              <div className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                {latestStep?.isFinal ? "最终结果已生成" : `最近更新：第 ${latestStep?.iteration ?? agentSteps.length} 步`}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isStreaming && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
                执行中
              </span>
            )}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="agent-steps"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="px-3 py-3"
            >
              <div className="relative space-y-2">
                <span className="absolute left-4 top-6 bottom-6 w-px" style={{ background: "var(--divider)" }} />
                {agentSteps.map((step) => {
                  const tool = step.action ? TOOL_META[step.action.tool] ?? { label: step.action.tool, short: "TOOL" } : null;

                  return (
                    <motion.article
                      key={step.timestamp}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative pl-9"
                    >
                      <span
                        className="absolute left-0 top-2 grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold"
                        style={{
                          background: step.isFinal ? "var(--success-subtle)" : "var(--surface-white)",
                          border: step.isFinal ? "1px solid rgba(0, 108, 73, 0.22)" : "1px solid var(--accent-border)",
                          color: step.isFinal ? "var(--success)" : "var(--accent)",
                        }}
                      >
                        <StepIcon final={step.isFinal} />
                      </span>

                      <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold" style={{ color: "var(--fg-primary)" }}>
                            {step.isFinal ? "完成输出" : `第 ${step.iteration} 轮`}
                          </span>
                          <span className="text-[10px] font-semibold" style={{ color: step.isFinal ? "var(--success)" : "var(--fg-tertiary)" }}>
                            {step.isFinal ? "FINAL" : "RUNNING"}
                          </span>
                        </div>

                        {step.thought && (
                          <div className="mb-2">
                            <div className="mb-1 text-[10px] font-bold uppercase" style={{ color: "var(--fg-tertiary)", letterSpacing: 0 }}>
                              思考
                            </div>
                            <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55 }}>
                              {step.thought.slice(0, 300)}
                              {step.thought.length > 300 && "..."}
                            </p>
                          </div>
                        )}

                        {step.action && tool && (
                          <div className="mb-2 rounded-lg px-2.5 py-2" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: "var(--accent)", background: "var(--surface-white)" }}>
                                {tool.short}
                              </span>
                              <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                                {tool.label}
                              </span>
                            </div>
                            <code className="block text-[10px]" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", lineHeight: 1.5, wordBreak: "break-all" }}>
                              {step.action.input.slice(0, 200)}
                              {step.action.input.length > 200 && "..."}
                            </code>
                          </div>
                        )}

                        {step.observation && (
                          <div className="rounded-lg px-2.5 py-2" style={{ background: step.isFinal ? "var(--success-subtle)" : "var(--surface-low)", border: step.isFinal ? "1px solid rgba(0, 108, 73, 0.18)" : "1px solid transparent" }}>
                            <div className="mb-1 text-[10px] font-bold uppercase" style={{ color: step.isFinal ? "var(--success)" : "var(--fg-tertiary)", letterSpacing: 0 }}>
                              {step.isFinal ? "最终答案" : "结果"}
                            </div>
                            <p className="text-xs" style={{ color: "var(--fg-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                              {step.observation.slice(0, 500)}
                              {step.observation.length > 500 && "..."}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
