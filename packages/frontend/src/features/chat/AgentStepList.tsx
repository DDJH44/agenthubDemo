"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore } from "@/stores/chat-store";

const TOOL_ICONS: Record<string, string> = {
  read_file: "📖",
  write_file: "✏️",
  edit_file: "🔧",
  bash: "⚡",
  glob: "🔍",
  grep: "🔎",
  search: "🌐",
  code: "💻",
  "web-fetch": "📥",
  deploy: "🚀",
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "读取文件",
  write_file: "写入文件",
  edit_file: "编辑文件",
  bash: "执行命令",
  glob: "搜索文件",
  grep: "搜索内容",
  search: "网络搜索",
  code: "代码沙箱",
  "web-fetch": "网页抓取",
  deploy: "一键部署",
};

export function AgentStepList() {
  const agentSteps = useChatStore((s) => s.agentSteps);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const [expanded, setExpanded] = useState(false);

  if (agentSteps.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--accent-border)", background: "var(--surface-white)" }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2.5 flex items-center justify-between"
          style={{ background: "var(--accent-subtle)", borderBottom: expanded ? "1px solid var(--accent-border)" : "none" }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent)" }}>
              Agent 执行过程
            </span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
              {agentSteps.length} 步
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <span className="flex items-center gap-1" style={{ fontSize: "var(--text-2xs)", color: "var(--accent)" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                执行中
              </span>
            )}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>

        {expanded && (
        <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
          <AnimatePresence>
            {agentSteps.map((step) => (
              <motion.div
                key={step.timestamp}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-2.5"
              >
                {/* 轮次标题 */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white"
                    style={{ background: step.isFinal ? "var(--success)" : "var(--accent)" }}>
                    {step.iteration}
                  </span>
                  <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-secondary)" }}>
                    {step.isFinal ? "完成" : "思考与行动"}
                  </span>
                </div>

                {/* 思考 */}
                {step.thought && (
                  <div className="mb-1.5 rounded-lg px-3 py-2" style={{ background: "var(--surface-low)" }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", marginBottom: 2, display: "block" }}>
                      💭 思考
                    </span>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {step.thought.slice(0, 300)}
                      {step.thought.length > 300 && "..."}
                    </p>
                  </div>
                )}

                {/* 行动 */}
                {step.action && (
                  <div className="mb-1.5 rounded-lg px-3 py-2" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--accent)", marginBottom: 2, display: "block" }}>
                      {TOOL_ICONS[step.action.tool] || "🔨"} {TOOL_LABELS[step.action.tool] || step.action.tool}
                    </span>
                    <code style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                      {step.action.input.slice(0, 200)}
                      {step.action.input.length > 200 && "..."}
                    </code>
                  </div>
                )}

                {/* 观察 */}
                {step.observation && (
                  <div className="rounded-lg px-3 py-2" style={{ background: step.action ? "var(--surface-low)" : "rgba(0,108,73,0.06)", border: step.action ? "none" : "1px solid rgba(0,108,73,0.2)" }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: step.action ? "var(--fg-tertiary)" : "var(--success)", marginBottom: 2, display: "block" }}>
                      {step.action ? "📋 结果" : "✅ 最终答案"}
                    </span>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
                      {step.observation.slice(0, 500)}
                      {step.observation.length > 500 && "..."}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        )}
      </div>
    </div>
  );
}
