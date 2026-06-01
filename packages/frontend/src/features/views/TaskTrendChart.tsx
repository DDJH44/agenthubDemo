"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface TrendPoint {
  label: string;
  created: number;
  completed: number;
}

const EMPTY_DATA: TrendPoint[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.now() - (6 - i) * 86400000);
  return { label: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, created: 0, completed: 0 };
});

export function TaskTrendChart() {
  const [data, setData] = useState<TrendPoint[]>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ trend: TrendPoint[] }>("/api/stats/task-trend?days=7")
      .then((res) => { if (!cancelled && Array.isArray(res.trend)) setData(res.trend); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const width = 400;
  const height = 140;
  const padX = 30;
  const padY = 10;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const safeData = Array.isArray(data) ? data : EMPTY_DATA;
  const maxVal = Math.max(10, ...safeData.map((d) => Math.max(d.created, d.completed)));

  const points = (arr: number[]) =>
    arr.map((v, i) => {
      const x = padX + (i / (arr.length - 1)) * chartW;
      const y = padY + chartH - (v / maxVal) * chartH;
      return { x, y };
    });

  const createdPts = points(safeData.map((d) => d.created));
  const completedPts = points(safeData.map((d) => d.completed));

  const linePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const areaPath = (pts: { x: number; y: number }[]) =>
    `${linePath(pts)} L${pts[pts.length - 1].x},${height - padY} L${pts[0].x},${height - padY} Z`;

  const gridSteps = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];

  return (
    <div
      className="card-breathe"
      style={{
        background: "var(--surface-white)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="text-[14px] font-bold" style={{ color: "var(--fg-primary)" }}>
          任务趋势
        </h3>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
            创建任务
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
            完成任务
          </span>
        </div>
        <select
          className="text-[11px] px-2 py-1 rounded"
          style={{
            background: "var(--surface-low)",
            border: "1px solid var(--border)",
            color: "var(--fg-secondary)",
          }}
        >
          <option>近 7 天</option>
        </select>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center" style={{ height: height + 24, color: "var(--fg-disabled)", fontSize: 12 }}>
            加载中...
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: height + 24 }}>
            {gridSteps.map((v) => {
              const y = padY + chartH - (v / maxVal) * chartH;
              return (
                <g key={v}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
                  <text x={padX - 4} y={y + 3} textAnchor="end" fill="var(--fg-disabled)" fontSize="9">
                    {v}
                  </text>
                </g>
              );
            })}

            {safeData.map((d, i) => {
              const x = padX + (i / (safeData.length - 1)) * chartW;
              return (
                <text key={i} x={x} y={height - 2} textAnchor="middle" fill="var(--fg-disabled)" fontSize="9">
                  {d.label}
                </text>
              );
            })}

            <path d={areaPath(createdPts)} fill="url(#gradCreated)" opacity="0.15" />
            <path d={areaPath(completedPts)} fill="url(#gradCompleted)" opacity="0.1" />

            <path
              d={linePath(createdPts)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={linePath(completedPts)}
              fill="none"
              stroke="var(--success)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {createdPts.map((p, i) => (
              <circle key={`c${i}`} cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="var(--accent)" strokeWidth="2" />
            ))}
            {completedPts.map((p, i) => (
              <circle key={`p${i}`} cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="var(--success)" strokeWidth="2" />
            ))}

            <defs>
              <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        )}
      </div>
    </div>
  );
}
