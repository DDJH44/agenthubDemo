"use client";

import { useState } from "react";
import type { Artifact, PlanNode, StepResult, Message } from "@agenthub/shared";
import { AGENT_COLORS } from "@agenthub/shared";
import { useT } from "@/hooks/useT";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNavigationStore } from "@/stores/navigation-store";

export type ContextTab = "task" | "files" | "agents";

interface StepProgress { index: number; total: number; step: string; status: "pending"|"running"|"done"; result?: string; }

interface Props {
  steps: StepProgress[]; plan: PlanNode[]; artifacts: Artifact[];
  dagNodes: Array<{ id: string; task: string; dependsOn: string[]; status: string }>;
  taskSummary: string; stepResults: StepResult[]; messages: Message[];
}

export function ContextPanel({ steps, plan, artifacts, dagNodes, taskSummary }: Props) {
  const t = useT();
  const chat = useChatStore();
  const workspace = useWorkspaceStore();
  const { activeNav } = useNavigationStore();
  const [tab, setTab] = useState<ContextTab>("task");

  const isChat = activeNav === "chat";
  const hasActivity = steps.length > 0 || plan.length > 0 || artifacts.length > 0;
  const activeConv = chat.conversations.find((c) => c.id === chat.activeConversationId);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)", borderLeft: "1px solid var(--border)" }}>
      {/* Tabs */}
      <div className="flex items-center shrink-0" style={{ height: 38, borderBottom: "1px solid var(--border)", background: "transparent" }}>
        {(["task", "files", "agents"] as ContextTab[]).map((key) => {
          const isActive = tab === key;
          const labels: Record<ContextTab, string> = { task: "任务", files: "文件", agents: "状态" };
          const counts: Record<ContextTab, number> = { task: steps.length, files: artifacts.length, agents: 5 };
          return (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 h-full flex items-center justify-center gap-1.5 relative transition-all"
              style={{ fontSize: "var(--text-2xs)", fontWeight: isActive ? 600 : 400, color: isActive ? "var(--fg-primary)" : "var(--fg-tertiary)" }}>
              {labels[key]}
              {counts[key] > 0 && <span className="rounded-full flex items-center justify-center font-semibold" style={{ fontSize: 9, background: "var(--accent-subtle)", color: "var(--accent)", minWidth: 16, height: 16 }}>{counts[key]}</span>}
              {isActive && <div className="absolute bottom-0 left-3 right-3" style={{ height: 2, background: "var(--accent)", borderRadius: "2px 2px 0 0" }} />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "task" && (
          <div className="p-4">
            {!hasActivity ? (
              <EmptyHint icon="⊞" text={isChat ? "发送任务后在聊天中查看进度" : "暂无任务"} />
            ) : (
              <div className="space-y-2">
                {/* Current task summary */}
                {taskSummary && (
                  <div className="rounded-xl p-3 mb-3" style={{ background: "var(--success-subtle)", border: "1px solid rgba(0,108,73,.15)" }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--success)" }}>完成</span>
                    </div>
                    <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-secondary)", lineHeight: 1.5 }}>{taskSummary.slice(0, 150)}</p>
                  </div>
                )}

                {/* Step progress */}
                {steps.length > 0
                  ? steps.map((step, i) => <StepCard key={i} i={i} label={step.step} status={step.status} result={step.result} />)
                  : dagNodes.map((n, i) => <StepCard key={i} i={i} label={n.task} status={n.status as StepProgress["status"]} />)
                }

                {/* Connection status */}
                <div className="flex items-center gap-2 px-1 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: chat.connected ? "var(--success)" : "var(--fg-disabled)" }} />
                  {chat.connected ? "WebSocket 已连接" : "未连接"}
                  {chat.isStreaming && <span style={{ color: "var(--accent)", marginLeft: "auto" }}>接收中...</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="p-4">
            {artifacts.length === 0 ? (
              <EmptyHint icon="📄" text="任务执行后生成的文件将显示在这里" />
            ) : (
              <div className="space-y-2">
                {artifacts.map((a) => (
                  <div key={a.id} className="rounded-lg p-3 animate-fade-in-up" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 8, background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        {a.type.toUpperCase()}
                      </span>
                      <span className="truncate flex-1" style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>{a.filename || a.id.slice(0, 8)}</span>
                    </div>
                    <pre style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-tertiary)", lineHeight: 1.4, maxHeight: 100, overflow: "hidden", margin: 0 }}>
                      {(a.content || "").slice(0, 300)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "agents" && (
          <div className="p-4">
            {/* Conversation info */}
            {activeConv && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 4 }}>{activeConv.title}</p>
                <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                  {activeConv.participants.length} 参与者 · {activeConv.type === "group" ? "群聊" : "任务"}
                </p>
              </div>
            )}

            {/* Agent status list */}
            <p style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0 }}>智能体状态</p>
            <div className="space-y-1.5">
              {["planner", "worker", "critic", "researcher", "refiner"].map((name) => {
                const state = chat.agentStates[name];
                const isBusy = state?.status === "acting";
                return (
                  <div key={name} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                    <div className="w-6 h-6 rounded flex items-center justify-center font-bold text-white shrink-0" style={{ background: AGENT_COLORS[name] ?? "var(--fg-tertiary)", fontSize: 8 }}>
                      {name[0].toUpperCase()}
                    </div>
                    <span className="flex-1" style={{ fontSize: "var(--text-xs)" }}>{t(`agent.${name}`)}</span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: isBusy ? "var(--warning)" : "var(--success)" }} />
                  </div>
                );
              })}
            </div>

            {/* Deploy status */}
            {workspace.deployStatus && (
              <div className="rounded-xl p-3 mt-4" style={{ background: workspace.deployStatus === "done" ? "var(--success-subtle)" : "var(--warning-subtle)", border: "1px solid", borderColor: workspace.deployStatus === "done" ? "rgba(0,108,73,.15)" : "rgba(130,81,0,.15)" }}>
                <p style={{ fontSize: "var(--text-2xs)", fontWeight: 600, marginBottom: 2 }}>
                  {workspace.deployStatus === "done" ? "已部署" : "部署中..."}
                </p>
                {workspace.deployUrl && (
                  <a href={workspace.deployUrl} target="_blank" rel="noopener" style={{ fontSize: "var(--text-2xs)", color: "var(--accent)" }}>
                    {workspace.deployUrl}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({ i, label, status, result }: { i: number; label: string; status: string; result?: string }) {
  const isDone = status === "done"; const isRunning = status === "running";
  return (
    <div className="rounded-lg p-3 animate-fade-in-up" style={{
      background: "var(--surface-white)", border: "1px solid",
      borderColor: isDone ? "rgba(0,108,73,.15)" : isRunning ? "var(--accent-border)" : "var(--border)",
      opacity: status === "pending" ? 0.6 : 1, animationDelay: `${i * 40}ms`,
    }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
          background: isDone ? "var(--success)" : isRunning ? "var(--accent)" : "var(--fg-disabled)",
          ...(isRunning ? { animation: "pulse-dot 1.4s ease-in-out infinite" } as React.CSSProperties : {}),
        }} />
        <span className="flex-1 truncate" style={{ fontSize: "var(--text-xs)", fontWeight: 450 }}>{label}</span>
        <span style={{ fontSize: 9, color: isDone ? "var(--success)" : isRunning ? "var(--accent)" : "var(--fg-tertiary)" }}>
          {isDone ? "✓" : isRunning ? "●" : "○"}
        </span>
      </div>
      {result && (
        <pre className="mt-2 p-2 rounded overflow-hidden" style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-tertiary)", background: "var(--surface-low)", maxHeight: 80, lineHeight: 1.4, margin: 0 }}>
          {result.slice(0, 200)}
        </pre>
      )}
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-12">
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>{text}</p>
    </div>
  );
}
