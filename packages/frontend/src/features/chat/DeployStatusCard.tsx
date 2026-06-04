"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { getDeployProviderLabel } from "./deploy-platforms";

function normalizeStatus(status: string | null) {
  if (status === "done" || status === "completed" || status === "success") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "deploying" || status === "building" || status === "running") return "deploying";
  return "idle";
}

export function DeployStatusCard() {
  const { deployStatus, deployUrl, deployProgress, deployProvider, deployError } = useWorkspaceStore();

  if (!deployStatus) return null;

  const status = normalizeStatus(deployStatus);
  const isDone = status === "success";
  const isFailed = status === "failed";
  const isBuilding = status === "deploying";
  const color = isDone ? "var(--success)" : isFailed ? "var(--danger)" : "#174ea6";
  const bg = isDone ? "var(--success-subtle)" : isFailed ? "var(--danger-subtle)" : "rgba(23, 78, 166, 0.07)";
  const border = isDone ? "var(--success-border)" : isFailed ? "var(--danger-border)" : "rgba(23, 78, 166, 0.18)";
  const label = isDone ? "部署成功" : isFailed ? "部署失败" : "部署中";
  const progress = deployProgress ?? (isDone || isFailed ? 100 : 35);
  const providerLabel = deployProvider ? getDeployProviderLabel(deployProvider) : null;

  return (
    <div className="px-4 py-2">
      <div className="rounded-lg border p-3" style={{ borderColor: border, background: bg }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: color,
                animation: isBuilding ? "pulse-dot 1.4s ease-in-out infinite" : undefined,
              }}
            />
            <span className="truncate text-xs font-bold" style={{ color }}>
              {label}
            </span>
          </div>
          {providerLabel && (
            <span className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--fg-secondary)", background: "var(--surface-white)" }}>
              {providerLabel}
            </span>
          )}
        </div>

        {isBuilding && (
          <div className="mb-2 h-1 overflow-hidden rounded-sm" style={{ background: "var(--surface-white)" }}>
            <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(0, Math.min(progress, 100))}%`, background: color }} />
          </div>
        )}

        {deployError && <p className="mb-2 text-xs" style={{ color: "var(--danger)" }}>{deployError}</p>}

        {deployUrl && (
          <a
            href={deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold no-underline"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", color: "#174ea6" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
            <span className="truncate">{deployUrl}</span>
          </a>
        )}
      </div>
    </div>
  );
}
