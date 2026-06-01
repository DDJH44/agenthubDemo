import type { PlanNode } from "@agenthub/shared";

const AGENT_ROLE_MAP: Record<string, { label: string; description: string }> = {
  researcher: { label: "调研Agent", description: "负责需求调研与信息收集" },
  planner: { label: "规划Agent", description: "负责任务拆解与执行计划制定" },
  worker: { label: "执行Agent", description: "负责核心功能开发与代码实现" },
  critic: { label: "审查Agent", description: "负责代码审查与质量评估" },
  refiner: { label: "优化Agent", description: "负责内容润色与成果整合" },
};

export function getAgentRoleLabel(role: string): string {
  return AGENT_ROLE_MAP[role]?.label ?? `${role}Agent`;
}

export function getAgentRoleDescription(role: string): string {
  return AGENT_ROLE_MAP[role]?.description ?? `负责${role}相关任务`;
}

export function formatTaskConfirmation(task: string): string {
  return `📋 **任务已接收**\n正在分析需求：${task}`;
}

export function formatTaskDecomposition(steps: PlanNode[]): string {
  const lines = steps.map((s) => {
    const roleLabel = s.agentRole ? getAgentRoleLabel(s.agentRole) : "执行Agent";
    const deps = s.dependsOn.length > 0
      ? `（依赖：${s.dependsOn.map(d => `步骤${d}`).join("→")}）`
      : "";
    return `- **步骤${s.id}**：${s.task} ${deps} → ${roleLabel}`;
  });

  return `## 任务拆解\n${lines.join("\n")}`;
}

export function formatTaskAssignment(steps: PlanNode[]): string {
  const roleGroups = new Map<string, string[]>();
  for (const s of steps) {
    const role = s.agentRole ?? "worker";
    if (!roleGroups.has(role)) roleGroups.set(role, []);
    roleGroups.get(role)!.push(`步骤${s.id}：${s.task}`);
  }

  const lines = Array.from(roleGroups.entries()).map(([role, tasks]) => {
    const label = getAgentRoleLabel(role);
    const desc = getAgentRoleDescription(role);
    const taskList = tasks.join("、");
    return `- **${label}**（${desc}）：${taskList}`;
  });

  return `## 任务分配\n${lines.join("\n")}`;
}

export function formatWorkerReceipt(taskName: string, _agentRole: string): string {
  return `[任务接收确认]：已收到《${taskName}》分配，正在执行中`;
}

export function formatWorkerReport(
  taskName: string,
  agentRole: string,
  approach: string,
  outputs: Array<{ type: string; name: string }>,
): string {
  const label = getAgentRoleLabel(agentRole);
  const outputLines = outputs.map(o => `- ${o.type}：${o.name}`);

  return `## ${label} 工作报告\n`
    + `**任务**：${taskName}\n`
    + `**状态**：✅ 已完成\n\n`
    + `**实现方案**：${approach}\n\n`
    + `**输出内容**：\n${outputLines.join("\n")}`;
}

export function formatCriticReview(
  stepId: string,
  valid: boolean,
  score: number,
  issues: string,
  suggestion: string,
): string {
  const status = valid ? "✅ 通过" : "⚠️ 需调整";
  const lines = [`## 审查Agent 评审结果`, `**步骤${stepId}**：${status}（评分：${score}/10）`];
  if (issues) lines.push(`**问题**：${issues}`);
  if (suggestion) lines.push(`**建议**：${suggestion}`);
  return lines.join("\n");
}

export function formatFinalSummary(
  task: string,
  stepResults: Array<{ id: string; task: string; result: string; status?: string }>,
  artifacts: Array<{ type: string; filename?: string }>,
): string {
  const statusLines = stepResults.map(sr => {
    const status = sr.status === "failed" ? "❌ 失败" : "✅ 已完成";
    return `- **步骤${sr.id}**：${sr.task} — ${status}`;
  });

  const artifactLines = artifacts.length > 0
    ? artifacts.map(a => `- ${a.type}：${a.filename ?? "未命名"}`)
    : ["- 无独立交付物"];

  return `## 任务完成总览\n`
    + `**原始需求**：${task}\n\n`
    + `### 完成状态\n${statusLines.join("\n")}\n\n`
    + `### 交付内容\n${artifactLines.join("\n")}\n\n`
    + `所有任务已完成，请查收并提供反馈。`;
}

export function extractOutputInfo(result: string): Array<{ type: string; name: string }> {
  const outputs: Array<{ type: string; name: string }> = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const extToType: Record<string, string> = {
    html: "HTML页面", css: "样式文件", js: "JavaScript代码", javascript: "JavaScript代码",
    ts: "TypeScript代码", typescript: "TypeScript代码", tsx: "React组件", jsx: "React组件",
    json: "JSON配置", py: "Python代码", python: "Python代码",
  };

  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = codeBlockRegex.exec(result)) !== null) {
    const lang = match[1]?.toLowerCase() ?? "";
    const type = extToType[lang] ?? "代码文件";
    const ext = lang || "txt";
    outputs.push({ type, name: `output-${idx + 1}.${ext}` });
    idx++;
  }

  if (outputs.length === 0) {
    outputs.push({ type: "文本报告", name: "执行结果" });
  }

  return outputs;
}
