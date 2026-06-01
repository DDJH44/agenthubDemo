"use client";

import { useState, useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";

const STATUS_COLORS: Record<string, string> = {
  done: "var(--success)",
  running: "var(--warning)",
  waiting: "var(--fg-disabled)",
  failed: "var(--danger)",
};
const STATUS_LABELS: Record<string, string> = {
  done: "已完成", running: "进行中", waiting: "等待中", failed: "失败",
};

export function TasksView() {
  const { taskFlow, taskProgress } = useChatStore();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let items = taskFlow;
    if (filter !== "all") items = items.filter((t) => t.status === filter);
    if (search) items = items.filter((t) => t.taskName.includes(search) || t.agentName.includes(search));
    return items;
  }, [taskFlow, filter, search]);

  const counts = useMemo(() => ({
    all: taskFlow.length,
    running: taskFlow.filter((t) => t.status === "running").length,
    done: taskFlow.filter((t) => t.status === "done").length,
    waiting: taskFlow.filter((t) => t.status === "waiting").length,
  }), [taskFlow]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      <div className="px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--fg-primary)" }}>
              任务管理
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
              {taskProgress ? `完成 ${taskProgress.completed}/${taskProgress.total} · 剩余 ${taskProgress.estimatedRemaining}` : `${taskFlow.length} 个任务`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索任务..."
                className="outline-none rounded-lg pl-8 pr-3"
                style={{ height: 30, fontSize: "var(--text-xs)", background: "var(--surface-low)", color: "var(--fg-primary)", border: "1px solid transparent", width: 200 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(["all", "running", "done", "waiting"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 font-medium transition-all ${filter === f ? "bg-[var(--accent)] text-white" : "text-[var(--fg-secondary)] hover:bg-[var(--surface-low)]"}`}
              style={{ fontSize: "var(--text-2xs)" }}
            >
              {f === "all" ? "全部" : STATUS_LABELS[f]} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ paddingBottom: "8%" }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>暂无匹配的任务</p>
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                {["智能体", "任务名称", "状态", "进度", "时间"].map((h) => (
                  <th key={h} className="text-left px-2 py-2" style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: 0 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id}
                  className="transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ borderBottom: "1px solid var(--divider)" }}
                >
                  <td className="px-2 py-2.5" style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-primary)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white"
                        style={{ fontSize: 9, background: "var(--accent)" }}>
                        {task.agentName[0]}
                      </div>
                      {task.agentName}
                    </div>
                  </td>
                  <td className="px-2 py-2.5" style={{ fontSize: "var(--text-xs)", color: "var(--fg-primary)" }}>{task.taskName}</td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-1" style={{ fontSize: "var(--text-2xs)", color: STATUS_COLORS[task.status] }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[task.status] }} />
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full" style={{ background: "var(--surface-low)", maxWidth: 80 }}>
                        <div className="h-full rounded-full" style={{ width: `${task.progress}%`, background: task.progress === 100 ? "var(--success)" : "var(--accent)" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{task.progress}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5" style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>
                    {new Date(task.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
