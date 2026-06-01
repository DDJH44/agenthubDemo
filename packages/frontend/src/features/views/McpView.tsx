"use client";

import { useState, useEffect } from "react";
import { useT } from "@/hooks/useT";
import { api } from "@/lib/api-client";

interface McpServer {
  id: string; name: string; protocol: "stdio" | "sse" | "websocket";
  command?: string; url?: string;
  status: "connected" | "disconnected" | "error";
  tools: string[]; lastSeen?: number;
}

const STATUS_COLORS: Record<string, string> = {
  connected: "var(--success)", disconnected: "var(--fg-disabled)", error: "var(--danger)",
};
const STATUS_LABELS: Record<string, string> = {
  connected: "已连接", disconnected: "未连接", error: "异常",
};

export function McpView() {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.get<{ servers: McpServer[] }>("/api/mcp/servers").then((res) => {
      setServers(res.servers || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const active = servers.find((s) => s.id === selected);
  const connectedCount = servers.filter((s) => s.status === "connected").length;

  const handleConnect = async (id: string) => {
    try {
      const res = await api.post<{ toolNames: string[] }>(`/api/mcp/servers/${id}/connect`, {});
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, status: "connected", tools: res.toolNames } : s));
    } catch { /* error */ }
  };

  const handleDisconnect = async (id: string) => {
    await api.post(`/api/mcp/servers/${id}/disconnect`, {});
    setServers((prev) => prev.map((s) => s.id === id ? { ...s, status: "disconnected" } : s));
  };

  const handleRemove = async (id: string) => {
    await api.delete(`/api/mcp/servers/${id}`);
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (selected === id) setSelected(null);
  };

  const handleAdd = async (name: string, protocol: string, url?: string, command?: string) => {
    const res = await api.post<{ server: McpServer }>("/api/mcp/servers", { name, protocol, url, command });
    setServers((prev) => [...prev, res.server]);
    setShowAdd(false);
  };

  return (
    <div className="flex h-full" style={{ background: "var(--surface-white)" }}>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, fontFamily: "var(--font-heading)" }}>{t("nav.mcp")}</h2>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>
              MCP 协议 — 管理外部工具和插件连接 · {connectedCount}/{servers.length} 已连接
            </p>
          </div>
          <button className="rounded-lg font-medium transition-all text-white"
            style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}
            onClick={() => setShowAdd(!showAdd)}
          >+ 添加服务器</button>
        </div>

        {showAdd && <AddServerForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

        {loading ? (
          <p style={{ color: "var(--fg-tertiary)", textAlign: "center", padding: 40 }}>加载中...</p>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: 60 }}>
            <p style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--fg-tertiary)", marginBottom: 12 }}>暂无 MCP 服务器</p>
            <button onClick={() => setShowAdd(true)}
              className="rounded-lg font-medium text-white"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--accent)" }}>
              + 添加服务器
            </button>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {servers.map((server, i) => (
              <button key={server.id} onClick={() => setSelected(selected === server.id ? null : server.id)}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`text-left rounded-xl p-4 transition-all animate-fade-in-up bg-[var(--surface-white)] border border-solid ${selected === server.id ? "border-[var(--accent-border)] shadow-[var(--shadow-md)]" : "border-[var(--border)] shadow-[var(--shadow-xs)] hover:border-[var(--accent-border)]"}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white"
                      style={{ background: server.status === "connected" ? "var(--success)" : server.status === "error" ? "var(--danger)" : "var(--fg-disabled)", fontSize: 11 }}>
                      {server.name[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{server.name}</p>
                      <div className="flex items-center gap-1.5" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[server.status] }} />
                        {STATUS_LABELS[server.status]}
                        <span>·</span>
                        <span className="rounded px-1 py-0.5" style={{ background: "var(--surface-low)", fontSize: 9 }}>
                          {server.protocol.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {server.tools.slice(0, 5).map((tool) => (
                    <span key={tool} className="rounded px-1.5 py-0.5" style={{ fontSize: 9, background: "var(--accent-subtle)", color: "var(--accent)" }}>
                      {tool}
                    </span>
                  ))}
                  {server.tools.length > 5 && (
                    <span style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>+{server.tools.length - 5}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <div className="shrink-0 overflow-y-auto p-5" style={{ width: 360, borderLeft: "1px solid var(--border)", background: "var(--page-bg)" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, fontFamily: "var(--font-heading)" }}>{active.name}</h3>
            <button onClick={() => setSelected(null)} style={{ fontSize: 14, color: "var(--fg-tertiary)" }}>✕</button>
          </div>
          <div className="space-y-4 mb-6">
            <Field label="状态">
              <span className="flex items-center gap-1.5" style={{ fontSize: "var(--text-sm)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[active.status] }} />
                {STATUS_LABELS[active.status]}
              </span>
            </Field>
            <Field label="协议" value={active.protocol.toUpperCase()} />
            {active.command && <Field label="启动命令" value={active.command} />}
            {active.url && <Field label="连接地址" value={active.url} />}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <h4 style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 10 }}>可用工具 ({active.tools.length})</h4>
            <div className="space-y-1.5">
              {active.tools.map((tool) => (
                <div key={tool} className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-primary)" }}>{tool}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2" style={{ marginTop: 20 }}>
            {active.status !== "connected" ? (
              <button className="flex-1 rounded-lg font-medium text-white transition-all"
                style={{ height: 32, fontSize: "var(--text-2xs)", background: "var(--accent)" }}
                onClick={() => handleConnect(active.id)}
              >连接</button>
            ) : (
              <button className="flex-1 rounded-lg font-medium transition-all"
                style={{ height: 32, fontSize: "var(--text-2xs)", background: "var(--danger-subtle)", color: "var(--danger)", border: "1px solid rgba(186,26,26,.2)" }}
                onClick={() => handleDisconnect(active.id)}
              >断开连接</button>
            )}
            <button className="rounded-lg font-medium transition-all"
              style={{ height: 32, fontSize: "var(--text-2xs)", padding: "0 12px", border: "1px solid var(--border)", color: "var(--danger)" }}
              onClick={() => handleRemove(active.id)}>
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0 }}>{label}</span>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-primary)", marginTop: 3, fontWeight: 450, wordBreak: "break-all" }}>
        {children ?? value}
      </div>
    </div>
  );
}

function AddServerForm({ onAdd, onCancel }: { onAdd: (name: string, protocol: string, url?: string, command?: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("sse");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");

  return (
    <div className="rounded-xl p-4 mb-3" style={{ border: "1px solid var(--accent-border)", background: "var(--accent-subtle)" }}>
      <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-primary)", marginBottom: 10 }}>添加 MCP 服务器</p>
      <div className="space-y-2 mb-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="服务器名称"
          className="w-full outline-none rounded-lg px-3"
          style={{ height: 32, fontSize: "var(--text-xs)", background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }} />
        <select value={protocol} onChange={(e) => setProtocol(e.target.value)}
          className="w-full outline-none rounded-lg px-3"
          style={{ height: 32, fontSize: "var(--text-xs)", background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="stdio">Stdio (子进程)</option>
          <option value="websocket">WebSocket</option>
        </select>
        {protocol !== "stdio" ? (
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={protocol === "sse" ? "SSE 地址 (https://...)" : "WebSocket 地址 (ws://...)"}
            className="w-full outline-none rounded-lg px-3"
            style={{ height: 32, fontSize: "var(--text-xs)", background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }} />
        ) : (
          <input value={command} onChange={(e) => setCommand(e.target.value)}
            placeholder="启动命令 (npx @anthropic/mcp-filesystem /workspace)"
            className="w-full outline-none rounded-lg px-3"
            style={{ height: 32, fontSize: "var(--text-xs)", background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => { if (name.trim()) onAdd(name.trim(), protocol, url || undefined, command || undefined); }}
          disabled={!name.trim()}
          className="rounded-lg font-medium text-white transition-all"
          style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 14px", background: name.trim() ? "var(--accent)" : "var(--fg-disabled)" }}>
          确认添加
        </button>
        <button onClick={onCancel}
          className="rounded-lg font-medium transition-all"
          style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 12px", border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>
          取消
        </button>
      </div>
    </div>
  );
}
