"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";

type McpProtocol = "stdio" | "sse" | "websocket";
type McpStatus = "connected" | "disconnected" | "error";

interface McpServer {
  id: string;
  name: string;
  protocol: McpProtocol;
  command?: string | null;
  url?: string | null;
  status?: McpStatus | string | null;
  tools?: string[] | null;
  lastSeen?: string | number | null;
}

interface ConnectorPreset {
  id: string;
  name: string;
  desc: string;
  protocol: McpProtocol;
  placeholder: string;
  tags: string[];
}

const STATUS_META: Record<McpStatus, { label: string; color: string; bg: string }> = {
  connected: { label: "已连接", color: "var(--success)", bg: "var(--success-subtle)" },
  disconnected: { label: "未连接", color: "var(--fg-tertiary)", bg: "var(--surface-low)" },
  error: { label: "异常", color: "var(--danger)", bg: "var(--danger-subtle)" },
};

const CONNECTOR_PRESETS: ConnectorPreset[] = [
  {
    id: "github",
    name: "GitHub",
    desc: "让 Agent 查询 issue、读取仓库、辅助生成 PR 说明。",
    protocol: "sse",
    placeholder: "https://your-mcp.example.com/github",
    tags: ["代码仓库", "Issue", "PR"],
  },
  {
    id: "lark",
    name: "飞书 / Lark",
    desc: "接入文档、消息、日程和知识库，适合课题资料协作。",
    protocol: "sse",
    placeholder: "https://your-mcp.example.com/lark",
    tags: ["文档", "群消息", "知识库"],
  },
  {
    id: "browser",
    name: "浏览器工具",
    desc: "让 Agent 打开网页、读取页面内容并完成轻量验证。",
    protocol: "sse",
    placeholder: "https://your-mcp.example.com/browser",
    tags: ["网页", "搜索", "验证"],
  },
  {
    id: "database",
    name: "数据库查询",
    desc: "把只读数据库能力交给 Agent，用于数据分析和报表生成。",
    protocol: "sse",
    placeholder: "https://your-mcp.example.com/db",
    tags: ["SQL", "报表", "分析"],
  },
  {
    id: "filesystem",
    name: "本地文件系统",
    desc: "连接项目文件或资料目录，给 Agent 提供受控读写能力。",
    protocol: "stdio",
    placeholder: "npx @modelcontextprotocol/server-filesystem D:/agenthubDemo",
    tags: ["文件", "代码", "资料"],
  },
  {
    id: "deploy",
    name: "部署工具",
    desc: "把私有部署、制品上传、回滚检查包装成可调用工具。",
    protocol: "sse",
    placeholder: "https://your-mcp.example.com/deploy",
    tags: ["服务器", "部署", "回滚"],
  },
];

function normalizeServer(server: McpServer): McpServer {
  return {
    ...server,
    status: normalizeStatus(server.status),
    tools: Array.isArray(server.tools) ? server.tools : [],
  };
}

function normalizeStatus(status?: string | null): McpStatus {
  if (status === "connected" || status === "error") return status;
  return "disconnected";
}

function formatLastSeen(value?: string | number | null) {
  if (!value) return "暂无记录";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function McpView() {
  const [selected, setSelected] = useState<string | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let alive = true;
    api.get<{ servers: McpServer[] }>("/api/mcp/servers")
      .then((res) => {
        if (!alive) return;
        setServers((res.servers || []).map(normalizeServer));
      })
      .catch(() => {
        if (alive) setFeedback("MCP 服务器列表加载失败，请确认后端服务是否运行。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const connectedCount = servers.filter((server) => normalizeStatus(server.status) === "connected").length;
  const active = servers.find((server) => server.id === selected) ?? null;
  const availableTools = useMemo(() => servers.reduce((total, server) => total + (server.tools?.length ?? 0), 0), [servers]);

  const handleConnect = async (id: string) => {
    setFeedback("");
    try {
      const res = await api.post<{ toolNames?: string[] }>(`/api/mcp/servers/${id}/connect`, {});
      setServers((current) => current.map((server) => server.id === id
        ? { ...server, status: "connected", tools: res.toolNames ?? [] }
        : server));
      setFeedback("连接成功，可用工具已注册到 Agent 工具箱。");
    } catch (error) {
      setServers((current) => current.map((server) => server.id === id ? { ...server, status: "error" } : server));
      setFeedback(`连接失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleDisconnect = async (id: string) => {
    setFeedback("");
    try {
      await api.post(`/api/mcp/servers/${id}/disconnect`, {});
      setServers((current) => current.map((server) => server.id === id ? { ...server, status: "disconnected", tools: [] } : server));
      setFeedback("连接已断开，对应工具已从 Agent 工具箱移除。");
    } catch (error) {
      setFeedback(`断开失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleRemove = async (id: string) => {
    setFeedback("");
    try {
      await api.delete(`/api/mcp/servers/${id}`);
      setServers((current) => current.filter((server) => server.id !== id));
      if (selected === id) setSelected(null);
      setFeedback("服务器配置已删除。");
    } catch (error) {
      setFeedback(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleAdd = async (payload: { name: string; protocol: McpProtocol; url?: string; command?: string }) => {
    setFeedback("");
    const res = await api.post<{ server: McpServer }>("/api/mcp/servers", payload);
    const server = normalizeServer(res.server);
    setServers((current) => [server, ...current]);
    setSelected(server.id);
    setShowAdd(false);
    setFeedback("服务器已添加，连接后即可暴露工具给 Agent。");
  };

  const handleUsePreset = (preset: ConnectorPreset) => {
    setShowAdd(true);
    window.setTimeout(() => {
      const event = new CustomEvent("agenthub:mcp-preset", { detail: preset });
      window.dispatchEvent(event);
    }, 0);
  };

  return (
    <div className="flex h-full min-h-0" style={{ background: "var(--surface-white)" }}>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-normal" style={{ color: "var(--accent)" }}>Tool Connections</p>
            <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>MCP 工具连接</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5" style={{ color: "var(--fg-tertiary)" }}>
              把 GitHub、飞书、浏览器、数据库或私有系统接入 AgentHub。连接成功后，Agent 可在会话和工作流中调用这些工具。
            </p>
          </div>
          <button
            type="button"
            className="h-9 rounded-lg px-4 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            style={{ background: "var(--accent)", boxShadow: "var(--accent-glow)" }}
            onClick={() => setShowAdd((value) => !value)}
          >
            添加连接
          </button>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric label="已连接" value={`${connectedCount}/${servers.length}`} />
          <Metric label="可用工具" value={String(availableTools)} />
          <Metric label="推荐接入" value="GitHub / 飞书 / 部署" />
        </section>

        {feedback && (
          <div className="mb-4 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
            {feedback}
          </div>
        )}

        {showAdd && <AddServerForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>推荐工具</h3>
            <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>选择后会自动带入协议和示例地址</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3 md:grid-cols-2">
            {CONNECTOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleUsePreset(preset)}
                className="rounded-lg p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent-border)] hover:bg-[var(--surface-white)]"
                style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-md text-xs font-bold text-white" style={{ background: "var(--accent)" }}>
                    {preset.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{preset.name}</p>
                    <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{preset.protocol.toUpperCase()}</p>
                  </div>
                </div>
                <p className="min-h-[36px] text-xs leading-5" style={{ color: "var(--fg-secondary)" }}>{preset.desc}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {preset.tags.map((tag) => (
                    <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>已添加连接</h3>
            <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>SSE 连接目前支持工具发现和执行，stdio/websocket 作为配置入口保留。</span>
          </div>

          {loading ? (
            <div className="rounded-lg p-8 text-center text-xs" style={{ border: "1px solid var(--border)", color: "var(--fg-tertiary)" }}>正在加载 MCP 连接...</div>
          ) : servers.length === 0 ? (
            <div className="rounded-lg p-8 text-center" style={{ border: "1px solid var(--border)", background: "var(--page-bg)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>还没有工具连接</p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>先添加一个 SSE MCP 服务，连接成功后 Agent 才能调用外部工具。</p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  active={selected === server.id}
                  onSelect={() => setSelected(selected === server.id ? null : server.id)}
                  onConnect={() => handleConnect(server.id)}
                  onDisconnect={() => handleDisconnect(server.id)}
                  onRemove={() => handleRemove(server.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <aside className="hidden w-[340px] shrink-0 overflow-y-auto p-5 lg:block" style={{ borderLeft: "1px solid var(--border)", background: "var(--page-bg)" }}>
        {active ? (
          <ConnectionDetail
            server={active}
            onConnect={() => handleConnect(active.id)}
            onDisconnect={() => handleDisconnect(active.id)}
            onRemove={() => handleRemove(active.id)}
          />
        ) : (
          <div className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>这个入口能做什么</h3>
            <div className="mt-3 space-y-3">
              <Hint title="连接外部系统" desc="把私有工具包装成 MCP 服务后，AgentHub 可以统一管理连接状态。" />
              <Hint title="增强 Agent 能力" desc="工具注册到后端工具箱后，Worker Agent 可以在任务中按需调用。" />
              <Hint title="服务普通用户" desc="普通用户只需要选择推荐连接，高级用户再填写 URL 或启动命令。" />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-2 text-lg font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>{value}</p>
    </div>
  );
}

function ServerCard({
  server,
  active,
  onSelect,
  onConnect,
  onDisconnect,
  onRemove,
}: {
  server: McpServer;
  active: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const status = normalizeStatus(server.status);
  const meta = STATUS_META[status];
  const tools = server.tools ?? [];

  return (
    <div className="rounded-lg p-4 transition-all" style={{ background: "var(--surface-white)", border: active ? "1px solid var(--accent-border)" : "1px solid var(--border)", boxShadow: active ? "var(--shadow-md)" : "var(--shadow-xs)" }}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-bold text-white" style={{ background: status === "connected" ? "var(--success)" : "var(--accent)" }}>
              {server.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{server.name}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{server.protocol.toUpperCase()} · {server.url || server.command || "未填写地址"}</p>
            </div>
          </div>
          <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap gap-1">
        {tools.length > 0 ? tools.slice(0, 6).map((tool) => (
          <span key={tool} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {tool}
          </span>
        )) : (
          <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>连接后显示可用工具</span>
        )}
        {tools.length > 6 && <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>+{tools.length - 6}</span>}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {status === "connected" ? (
          <button type="button" onClick={onDisconnect} className="h-8 rounded-lg px-3 text-xs font-semibold transition" style={{ background: "var(--surface-low)", color: "var(--fg-secondary)", border: "1px solid var(--border)" }}>
            断开
          </button>
        ) : (
          <button type="button" onClick={onConnect} className="h-8 rounded-lg px-3 text-xs font-semibold text-white transition" style={{ background: "var(--accent)" }}>
            连接
          </button>
        )}
        <button type="button" onClick={onRemove} className="h-8 rounded-lg px-3 text-xs font-semibold transition" style={{ color: "var(--danger)", border: "1px solid rgba(186,26,26,.2)", background: "var(--danger-subtle)" }}>
          删除
        </button>
      </div>
    </div>
  );
}

function ConnectionDetail({
  server,
  onConnect,
  onDisconnect,
  onRemove,
}: {
  server: McpServer;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const status = normalizeStatus(server.status);
  const meta = STATUS_META[status];
  const tools = server.tools ?? [];

  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md text-xs font-bold text-white" style={{ background: status === "connected" ? "var(--success)" : "var(--accent)" }}>
          {server.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>{server.name}</h3>
          <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{server.protocol.toUpperCase()} 连接</p>
        </div>
      </div>

      <div className="space-y-3">
        <DetailField label="状态" value={meta.label} tone={meta.color} />
        <DetailField label="连接地址" value={server.url || server.command || "未填写"} />
        <DetailField label="最近在线" value={formatLastSeen(server.lastSeen)} />
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>可用工具</h4>
          <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{tools.length}</span>
        </div>
        <div className="space-y-1.5">
          {tools.length > 0 ? tools.map((tool) => (
            <div key={tool} className="rounded-md px-2.5 py-2 text-xs" style={{ background: "var(--page-bg)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
              {tool}
            </div>
          )) : (
            <p className="rounded-md px-2.5 py-2 text-xs" style={{ background: "var(--page-bg)", color: "var(--fg-tertiary)" }}>暂未发现工具。SSE 服务需要提供 /tools 接口。</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        {status === "connected" ? (
          <button type="button" onClick={onDisconnect} className="h-8 flex-1 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>断开连接</button>
        ) : (
          <button type="button" onClick={onConnect} className="h-8 flex-1 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>连接</button>
        )}
        <button type="button" onClick={onRemove} className="h-8 rounded-lg px-3 text-xs font-semibold" style={{ background: "var(--danger-subtle)", border: "1px solid rgba(186,26,26,.2)", color: "var(--danger)" }}>删除</button>
      </div>
    </div>
  );
}

function DetailField({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-normal" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-1 break-all text-xs" style={{ color: tone || "var(--fg-primary)" }}>{value}</p>
    </div>
  );
}

function Hint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md p-3" style={{ background: "var(--page-bg)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{title}</p>
      <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
    </div>
  );
}

function AddServerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (payload: { name: string; protocol: McpProtocol; url?: string; command?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<McpProtocol>("sse");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (event: Event) => {
      const preset = (event as CustomEvent<ConnectorPreset>).detail;
      if (!preset) return;
      setName(preset.name);
      setProtocol(preset.protocol);
      if (preset.protocol === "stdio") {
        setCommand(preset.placeholder);
        setUrl("");
      } else {
        setUrl(preset.placeholder);
        setCommand("");
      }
      setError("");
    };
    window.addEventListener("agenthub:mcp-preset", handler);
    return () => window.removeEventListener("agenthub:mcp-preset", handler);
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      setError("请填写连接名称。");
      return;
    }
    if (protocol === "stdio" && !command.trim()) {
      setError("stdio 连接需要启动命令。");
      return;
    }
    if (protocol !== "stdio" && !url.trim()) {
      setError("SSE/WebSocket 连接需要服务地址。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onAdd({
        name: name.trim(),
        protocol,
        url: protocol === "stdio" ? undefined : url.trim(),
        command: protocol === "stdio" ? command.trim() : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-5 rounded-lg p-4" style={{ background: "var(--page-bg)", border: "1px solid var(--accent-border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>添加 MCP 连接</h3>
        <button type="button" onClick={onCancel} className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>收起</button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>连接名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如 GitHub 工具"
            className="h-9 w-full rounded-lg px-3 text-xs outline-none focus:border-[var(--accent-border)]"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", color: "var(--fg-primary)" }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>协议</span>
          <select
            value={protocol}
            onChange={(event) => setProtocol(event.target.value as McpProtocol)}
            className="h-9 w-full rounded-lg px-3 text-xs outline-none focus:border-[var(--accent-border)]"
            style={{ background: "var(--surface-white)", border: "1px solid var(--border)", color: "var(--fg-primary)" }}
          >
            <option value="sse">SSE</option>
            <option value="stdio">Stdio</option>
            <option value="websocket">WebSocket</option>
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>
          {protocol === "stdio" ? "启动命令" : "服务地址"}
        </span>
        <input
          value={protocol === "stdio" ? command : url}
          onChange={(event) => protocol === "stdio" ? setCommand(event.target.value) : setUrl(event.target.value)}
          placeholder={protocol === "stdio" ? "npx @modelcontextprotocol/server-filesystem D:/agenthubDemo" : "https://your-mcp.example.com"}
          className="h-9 w-full rounded-lg px-3 text-xs outline-none focus:border-[var(--accent-border)]"
          style={{ background: "var(--surface-white)", border: "1px solid var(--border)", color: "var(--fg-primary)" }}
        />
      </label>

      {error && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="h-8 rounded-lg px-4 text-xs font-semibold text-white transition disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {submitting ? "添加中..." : "确认添加"}
        </button>
        <button type="button" onClick={onCancel} className="h-8 rounded-lg px-3 text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
          取消
        </button>
      </div>
    </div>
  );
}
