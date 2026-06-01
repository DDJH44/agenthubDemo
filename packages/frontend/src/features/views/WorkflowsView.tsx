"use client";

import { useState, useCallback, useRef } from "react";
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  addEdge, Panel, type Node, type Edge, type Connection, type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useT } from "@/hooks/useT";

/* ── Node data ── */
interface AgentNodeData {
  agentId: string; label: string; color: string; status: "idle" | "running" | "done" | "failed";
  config?: { model?: string; tools?: string[] };
}

interface LogicNodeData {
  label: string; color: string; nodeType: string; status: "idle" | "running" | "done" | "failed";
  config: Record<string, unknown>;
}

type NodeData = AgentNodeData | LogicNodeData;

const AGENT_TEMPLATES: AgentNodeData[] = [
  { agentId: "planner", label: "规划者", color: "var(--accent)", status: "idle", config: { model: "gpt-4o-mini", tools: ["plan"] } },
  { agentId: "worker", label: "执行者", color: "#006c49", status: "idle", config: { model: "gpt-4o-mini", tools: ["code", "search", "web-fetch"] } },
  { agentId: "critic", label: "审查者", color: "#825100", status: "idle", config: { model: "gpt-4o-mini", tools: ["review"] } },
  { agentId: "researcher", label: "研究员", color: "#2b7fff", status: "idle", config: { model: "gpt-4o-mini", tools: ["search", "web-fetch"] } },
  { agentId: "refiner", label: "润色师", color: "#ba1a1a", status: "idle", config: { model: "gpt-4o-mini", tools: ["polish"] } },
];

interface LogicTemplate {
  nodeType: string; label: string; color: string; config: Record<string, unknown>;
}

const LOGIC_TEMPLATES: LogicTemplate[] = [
  { nodeType: "code", label: "代码执行", color: "#006c49", config: { language: "javascript" } },
  { nodeType: "condition", label: "条件判断", color: "#f59e0b", config: { expression: "" } },
  { nodeType: "variable", label: "变量操作", color: "#825100", config: { operation: "set", variableName: "", value: "" } },
];

/* ── Custom Nodes ── */
function AgentNode({ data }: { data: AgentNodeData }) {
  const statusGlow: Record<string, string> = { idle: "var(--border)", running: "var(--accent)", done: "var(--success)", failed: "var(--danger)" };
  return (
    <div className="rounded-xl overflow-hidden" style={{
      minWidth: 180, background: "var(--surface-white)",
      border: `2px solid ${statusGlow[data.status] ?? "var(--border)"}`,
      boxShadow: data.status === "running" ? "var(--shadow-md)" : "var(--shadow-sm)",
      ...(data.status === "running" ? { animation: "pulse-dot 1.4s ease-in-out infinite" } as React.CSSProperties : {}),
    }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: data.color + "12", borderBottom: "1px solid var(--border)" }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white shrink-0" style={{ background: data.color, fontSize: 9 }}>
          {data.agentId[0].toUpperCase()}
        </div>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{data.label}</span>
        <span className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: statusGlow[data.status] ?? "var(--fg-disabled)" }} />
      </div>
      <div className="px-3 py-2 flex items-center gap-1 flex-wrap">
        {data.config?.tools?.map((tool) => (
          <span key={tool} className="rounded px-1.5 py-0.5" style={{ fontSize: 8, background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>{tool}</span>
        ))}
      </div>
      <div className="react-flow__handle react-flow__handle-top" style={{ visibility: "hidden" }} />
      <div className="react-flow__handle react-flow__handle-bottom" style={{ visibility: "hidden" }} />
    </div>
  );
}

function CodeNode({ data }: { data: LogicNodeData }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{
      minWidth: 180, background: "var(--surface-white)",
      border: `2px solid ${data.color}`, boxShadow: "var(--shadow-sm)",
    }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: data.color + "12", borderBottom: "1px solid var(--border)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={data.color} strokeWidth="2" strokeLinecap="round"><path d="M16 18l6-6-6-6 M8 6l-6 6 6 6"/></svg>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{data.label}</span>
        <span className="rounded px-1 py-0.5 ml-auto" style={{ fontSize: 8, background: "var(--surface-low)", color: "var(--fg-tertiary)" }}>
          {String(data.config.language ?? "js")}
        </span>
      </div>
      <div className="px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        执行代码...
      </div>
      <div className="react-flow__handle react-flow__handle-top" style={{ visibility: "hidden" }} />
      <div className="react-flow__handle react-flow__handle-bottom" style={{ visibility: "hidden" }} />
    </div>
  );
}

function ConditionNode({ data }: { data: LogicNodeData }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{
      minWidth: 180, background: "var(--surface-white)",
      border: `2px solid ${data.color}`, boxShadow: "var(--shadow-sm)",
    }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: data.color + "12", borderBottom: "1px solid var(--border)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={data.color} strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{data.label}</span>
      </div>
      <div className="px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {String(data.config.expression || "条件表达式")}
      </div>
      <div className="react-flow__handle react-flow__handle-top" style={{ visibility: "hidden" }} />
      <div className="react-flow__handle react-flow__handle-bottom" style={{ visibility: "hidden" }} />
    </div>
  );
}

function VariableNode({ data }: { data: LogicNodeData }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{
      minWidth: 180, background: "var(--surface-white)",
      border: `2px solid ${data.color}`, boxShadow: "var(--shadow-sm)",
    }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: data.color + "12", borderBottom: "1px solid var(--border)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={data.color} strokeWidth="2" strokeLinecap="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 650, color: "var(--fg-primary)" }}>{data.label}</span>
      </div>
      <div className="px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {String(data.config.variableName || "变量")} = {String(data.config.value || "...")}
      </div>
      <div className="react-flow__handle react-flow__handle-top" style={{ visibility: "hidden" }} />
      <div className="react-flow__handle react-flow__handle-bottom" style={{ visibility: "hidden" }} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
  codeNode: CodeNode,
  conditionNode: ConditionNode,
  variableNode: VariableNode,
};

function getData(node: Node): NodeData {
  return node.data as unknown as NodeData;
}

/* ── Main Component ── */
export function WorkflowsView() {
  const t = useT();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [mode, setMode] = useState<"edit" | "run">("edit");
  const [task, setTask] = useState("");
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const onConnect = useCallback((conn: Connection) => {
    // Auto-add labels for condition nodes
    const sourceNode = nodes.find((n) => n.id === conn.source);
    const sourceData = sourceNode ? getData(sourceNode) : null;
    const isCondition = sourceData && "nodeType" in sourceData && sourceData.nodeType === "condition";
    setEdges((eds) => addEdge({
      ...conn, animated: true,
      style: { stroke: "var(--accent)", strokeWidth: 2 },
      label: isCondition ? "true" : undefined,
    }, eds));
  }, [setEdges, nodes]);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => setSelectedNode(node), []);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/reactflow");
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    if (!rect) return;

    // Check logic templates first
    const logicTpl = LOGIC_TEMPLATES.find((t) => t.nodeType === id);
    if (logicTpl) {
      const newNodeId = `${id}-${++nextId.current}`;
      const nodeTypeMap: Record<string, string> = { code: "codeNode", condition: "conditionNode", variable: "variableNode" };
      const newNode: Node = {
        id: newNodeId, type: nodeTypeMap[id] ?? "codeNode",
        position: { x: e.clientX - rect.left - 90, y: e.clientY - rect.top - 30 },
        data: { label: logicTpl.label, color: logicTpl.color, nodeType: logicTpl.nodeType, status: "idle", config: { ...logicTpl.config } },
      };
      setNodes((nds) => [...nds, newNode]);
      return;
    }

    // Fallback to agent templates
    const template = AGENT_TEMPLATES.find((a) => a.agentId === id);
    if (!template) return;
    const newNode: Node = {
      id: `${id}-${++nextId.current}`, type: "agentNode",
      position: { x: e.clientX - rect.left - 90, y: e.clientY - rect.top - 30 },
      data: { ...template, agentId: id, status: "idle" as const },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const clearCanvas = () => { setNodes([]); setEdges([]); setSelectedNode(null); };

  const buildDefault = () => {
    clearCanvas();
    const spacing = 260;
    const templateOrder = ["planner", "worker", "critic", "refiner"];
    const newNodes: Node[] = templateOrder.map((agentId, i) => {
      const tpl = AGENT_TEMPLATES.find((a) => a.agentId === agentId)!;
      return { id: agentId, type: "agentNode", position: { x: 80, y: 60 + i * spacing }, data: { ...tpl, status: "idle" as const } };
    });
    const newEdges: Edge[] = [
      { id: "e-planner-worker", source: "planner", target: "worker", animated: true, style: { stroke: "var(--accent)", strokeWidth: 2 } },
      { id: "e-worker-critic", source: "worker", target: "critic", animated: true, style: { stroke: "var(--accent)", strokeWidth: 2 } },
      { id: "e-critic-refiner", source: "critic", target: "refiner", animated: true, style: { stroke: "var(--accent)", strokeWidth: 2 } },
    ];
    setNodes(newNodes);
    setEdges(newEdges);
  };

  const runWorkflow = async () => {
    if (nodes.length === 0) return;
    setMode("run");
    const dag = nodes.map((n) => {
      const data = getData(n);
      const nodeType = "nodeType" in data ? (data as LogicNodeData).nodeType : "agent";
      const agentRole = "agentId" in data ? (data as AgentNodeData).agentId : "worker";
      return {
        id: n.id,
        task: "label" in data ? (data as { label: string }).label + ": " + (task || "执行任务") : task || "执行任务",
        dependsOn: edges.filter((e) => e.target === n.id).map((e) => e.source),
        type: nodeType,
        config: "config" in data ? data.config : undefined,
        agentRole,
      };
    });
    const edgeData = edges.map((e) => ({ source: e.source, target: e.target, label: e.label as string | undefined }));

    try {
      const resp = await fetch("http://localhost:3002/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task || "工作流任务", plan: dag, edges: edgeData }),
      });
      const reader = resp.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "stream") {
              const stepId = String((event.msg as unknown as string) || "").match(/^\[(.*?)\]/)?.[1];
              if (stepId) setNodes((nds) => nds.map((n) => n.id === stepId ? { ...n, data: { ...getData(n), status: "running" } } : n));
            } else if (event.type === "final" && event.msg) {
              const final = event.msg as Record<string, unknown>;
              const stepResults = (final.stepResults as Array<{ id: string }>) ?? [];
              setNodes((nds) => nds.map((n) => ({ ...n, data: { ...getData(n), status: stepResults.some((s) => s.id === n.id) ? "done" as const : "idle" as const } })));
            }
          } catch {}
        }
      }
    } catch {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...getData(n), status: "failed" as const } })));
    }
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("application/reactflow", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const selectedData = selectedNode ? getData(selectedNode) : null;

  return (
    <div className="flex h-full" style={{ background: "var(--surface-white)" }}>
      {/* Left: Palette */}
      <div className="shrink-0 overflow-y-auto p-4" style={{ width: 200, borderRight: "1px solid var(--border)", background: "var(--page-bg)" }}>
        <h3 style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 12 }}>智能体节点</h3>
        <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginBottom: 16 }}>拖拽到画布上</p>
        <div className="space-y-2">
          {AGENT_TEMPLATES.map((agent) => (
            <div key={agent.agentId} draggable onDragStart={(e) => onDragStart(e, agent.agentId)}
              className="rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all animate-fade-in-up"
              style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = agent.color; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded flex items-center justify-center font-bold text-white shrink-0" style={{ background: agent.color, fontSize: 9 }}>
                  {agent.agentId[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{agent.label}</p>
                  <p style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>{agent.config?.tools?.join(", ")}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Logic Nodes */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 16 }}>
          <h3 style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 8 }}>逻辑节点</h3>
          <div className="space-y-2">
            {LOGIC_TEMPLATES.map((tpl) => (
              <div key={tpl.nodeType} draggable onDragStart={(e) => onDragStart(e, tpl.nodeType)}
                className="rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all animate-fade-in-up"
                style={{ background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded flex items-center justify-center font-bold text-white shrink-0" style={{ background: tpl.color, fontSize: 9 }}>
                    {tpl.nodeType[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{tpl.label}</p>
                    <p style={{ fontSize: 9, color: "var(--fg-tertiary)" }}>
                      {tpl.nodeType === "code" ? `lang: ${String(tpl.config.language)}` :
                       tpl.nodeType === "condition" ? "if/then/else" : "set/get"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 16 }}>
          <button onClick={buildDefault} className="w-full rounded-lg font-medium transition-all"
            style={{ height: 32, fontSize: "var(--text-2xs)", background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
          >默认流水线</button>
        </div>
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 shrink-0" style={{ height: 48, borderBottom: "1px solid var(--border)", background: "var(--surface-white)" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, fontFamily: "var(--font-heading)" }}>{t("nav.workflows")}</span>
            <span className="rounded px-1.5 py-0.5" style={{ fontSize: 9, background: mode === "edit" ? "var(--accent-subtle)" : "var(--success-subtle)", color: mode === "edit" ? "var(--accent)" : "var(--success)" }}>
              {mode === "edit" ? "编辑" : "执行中"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {mode === "edit" ? (
              <>
                <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="任务描述..."
                  className="rounded-lg px-3 outline-none" style={{ height: 30, fontSize: "var(--text-xs)", border: "1px solid var(--border)", width: 220 }} />
                <button onClick={runWorkflow} disabled={nodes.length === 0}
                  className="rounded-lg font-medium transition-all text-white"
                  style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 14px", background: nodes.length === 0 ? "var(--surface-mid)" : "var(--accent)" }}
                >运行</button>
              </>
            ) : (
              <button onClick={() => { setMode("edit"); }}
                className="rounded-lg font-medium transition-all"
                style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 14px", background: "var(--surface-low)", color: "var(--fg-secondary)" }}
              >返回编辑</button>
            )}
            <button onClick={clearCanvas}
              className="rounded-lg font-medium transition-all"
              style={{ height: 30, fontSize: "var(--text-2xs)", padding: "0 14px", background: "transparent", color: "var(--fg-tertiary)", border: "1px solid var(--border)" }}
            >清空</button>
          </div>
        </div>

        {/* ReactFlow */}
        <div ref={reactFlowWrapper} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={mode === "edit" ? onNodesChange : undefined}
            onEdgesChange={mode === "edit" ? onEdgesChange : undefined}
            onConnect={mode === "edit" ? onConnect : undefined}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={mode === "edit" ? ["Backspace", "Delete"] : []}
            style={{ background: "var(--page-bg)" }}
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
            <MiniMap
              nodeColor={(n) => (getData(n) as { color?: string })?.color ?? "var(--accent)"}
              style={{ borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <Panel position="bottom-right">
              <div className="rounded-lg px-3 py-2" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", background: "var(--surface-white)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                节点 {nodes.length} · 连线 {edges.length}
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Right: Properties */}
      {selectedNode && selectedData && (
        <div className="shrink-0 overflow-y-auto p-4" style={{ width: 260, borderLeft: "1px solid var(--border)", background: "var(--page-bg)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>节点属性</h3>
            <button onClick={() => setSelectedNode(null)} style={{ fontSize: 14, color: "var(--fg-tertiary)" }}>✕</button>
          </div>
          <div className="space-y-3">
            <Field label="名称" value={"label" in selectedData ? (selectedData as { label: string }).label : selectedNode.id} />
            <Field label="ID" value={selectedNode.id} />
            <Field label="类型" value={"nodeType" in selectedData ? (selectedData as LogicNodeData).nodeType : "agent"} />
            <Field label="状态" value={selectedData.status} />
            {"agentId" in selectedData && <Field label="模型" value={(selectedData as AgentNodeData).config?.model ?? "—"} />}
            {"agentId" in selectedData && <Field label="工具" value={(selectedData as AgentNodeData).config?.tools?.join(", ") ?? "—"} />}
            {"nodeType" in selectedData && selectedData.nodeType === "code" && (
              <Field label="语言" value={String((selectedData as LogicNodeData).config.language ?? "javascript")} />
            )}
            {"nodeType" in selectedData && selectedData.nodeType === "condition" && (
              <Field label="表达式" value={String((selectedData as LogicNodeData).config.expression ?? "")} />
            )}
            {"nodeType" in selectedData && selectedData.nodeType === "variable" && (
              <>
                <Field label="变量名" value={String((selectedData as LogicNodeData).config.variableName ?? "")} />
                <Field label="值" value={String((selectedData as LogicNodeData).config.value ?? "")} />
              </>
            )}
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
      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-primary)", marginTop: 3, fontWeight: 450 }}>{children ?? value}</div>
    </div>
  );
}
