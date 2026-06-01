"use client";

import { memo, useState } from "react";

interface StepProgress {
  index: number;
  total: number;
  step: string;
  status: "pending" | "running" | "done";
  result?: string;
}

interface TaskStepsProps {
  steps: StepProgress[];
  planSteps: string[];
}

export const TaskSteps = memo(function TaskSteps({ steps, planSteps }: TaskStepsProps) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0 && planSteps.length === 0) {
    return null;
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length || planSteps.length;

  return (
    <>
      {steps.length > 0 && <div style={{ borderTop: "1px solid var(--border)", margin: "8px 16px" }} />}

      {(planSteps.length > 0 || steps.length > 0) && (
        <div className="px-4 py-2">
          <div className="rounded-xl overflow-hidden flex-1" style={{ border: "1px solid var(--border)", background: "var(--surface-white)", boxShadow: "var(--shadow-xs)" }}>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: expanded ? "1px solid var(--border)" : "none", background: "var(--accent-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--accent)" }}>
                  任务规划
                </span>
                {totalCount > 0 && (
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                    {doneCount}/{totalCount} 完成
                  </span>
                )}
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {expanded && (
              <div className="px-4 py-3 space-y-2">
                {planSteps.map((s, i) => (
                  <div key={`plan-${i}`} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 font-semibold text-white" style={{ background: "var(--accent)", fontSize: 10 }}>{i + 1}</span>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)" }}>{s}</span>
                  </div>
                ))}

                {steps.map((step, i) => {
                  const isDone = step.status === "done";
                  const isRunning = step.status === "running";
                  return (
                    <div key={`step-${i}`} className="flex items-start gap-3 py-1">
                      <div className="w-4 h-4 border-2 rounded-sm flex items-center justify-center shrink-0 mt-0.5" style={{
                        borderColor: isDone ? "var(--success)" : isRunning ? "var(--accent)" : "var(--fg-disabled)",
                      }}>
                        {isDone && <div className="w-2 h-2 rounded-sm" style={{ background: "var(--success)" }} />}
                        {isRunning && <div className="w-2 h-2 rounded-sm" style={{ background: "var(--accent)" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-primary)" }}>{step.step}</span>
                        {step.result && (
                          <pre style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--fg-tertiary)", lineHeight: 1.4, background: "var(--surface-low)", padding: "6px 10px", borderRadius: 6, maxHeight: 80, overflow: "hidden", margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                            {step.result.slice(0, 200)}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
});