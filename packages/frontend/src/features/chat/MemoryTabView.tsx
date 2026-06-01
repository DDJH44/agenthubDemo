"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface RecentJob {
  id: string;
  title: string;
  summary?: string;
  completedAt: string | null;
}

interface MemoryState {
  messageCount: number;
  completedJobCount: number;
  recentJobs: RecentJob[];
  conversationSummary: string | null;
  topics: string[];
}

export function MemoryTabView({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<MemoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MemoryState>(
        `/api/memory/state?conversationId=${encodeURIComponent(conversationId)}`
      );
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadState();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadState]);

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      await api.post("/api/memory/summarize", { conversationId });
      // 等待后台处理完成后刷新
      setTimeout(() => loadState(), 2000);
    } catch {
      setError("摘要生成失败");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        <p className="mt-3" style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>加载记忆状态...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p style={{ fontSize: "var(--text-sm)", color: "var(--danger)" }}>加载失败</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 4 }}>{error}</p>
        <button onClick={loadState} className="mt-3 px-3 py-1.5 rounded-lg transition-all"
          style={{ fontSize: "var(--text-xs)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
          重试
        </button>
      </div>
    );
  }

  if (!state) return null;

  const hasMemory = state.messageCount > 0 || state.completedJobCount > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="消息总数" value={state.messageCount} color="var(--accent)" />
        <StatCard label="完成任务" value={state.completedJobCount} color="var(--success)" />
      </div>

      {/* 会话摘要 */}
      {state.conversationSummary && (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            会话摘要
          </span>
          <p className="mt-1.5" style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)", lineHeight: 1.6 }}>
            {state.conversationSummary}
          </p>
        </div>
      )}

      {/* 主题标签 */}
      {state.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {state.topics.map((topic) => (
            <span key={topic} className="px-2 py-0.5 rounded-full"
              style={{ fontSize: "var(--text-2xs)", background: "var(--accent-subtle)", color: "var(--accent)", fontWeight: 500 }}>
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* 近期任务 */}
      {state.recentJobs.length > 0 && (
        <div>
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            近期完成的任务
          </span>
          <div className="flex flex-col gap-2 mt-2">
            {state.recentJobs.map((job) => (
              <div key={job.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 550, color: "var(--fg-primary)" }}>
                    {job.title}
                  </span>
                </div>
                {job.summary && (
                  <p className="mt-1" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", lineHeight: 1.5 }}>
                    {job.summary.slice(0, 200)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!hasMemory && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
            style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9h2m10 0h2M5 15h2m10 0h2m-8-4h4a2 2 0 012 2v2a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2a2 2 0 012-2z" />
            </svg>
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)", fontWeight: 500 }}>暂无记忆</p>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", marginTop: 4 }}>
            在对话中发送任务后，智能体会记录上下文
          </p>
        </div>
      )}

      {/* 操作区 */}
      <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <button onClick={handleSummarize} disabled={summarizing}
          className="w-full py-2 rounded-lg transition-all flex items-center justify-center gap-2"
          style={{
            fontSize: "var(--text-xs)", fontWeight: 500,
            color: summarizing ? "var(--fg-disabled)" : "var(--accent)",
            background: "var(--accent-subtle)",
            border: "1px solid var(--accent-border)",
            cursor: summarizing ? "not-allowed" : "pointer",
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8" />
            <path d="M8 17h5" />
          </svg>
          {summarizing ? "生成中..." : "生成会话摘要"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color }}>
        {value}
      </span>
      <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
        {label}
      </p>
    </div>
  );
}
