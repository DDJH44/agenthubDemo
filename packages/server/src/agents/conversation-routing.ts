export const CORE_AGENT_NAMES = ["planner", "worker", "critic", "researcher", "refiner"] as const;
const MAIN_AGENT_ID = "__main__";

type CoreAgentName = (typeof CORE_AGENT_NAMES)[number];

interface ConversationAgentEntry {
  agentName: string;
  enabled: boolean;
}

const CORE_AGENT_SET = new Set<string>(CORE_AGENT_NAMES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}

export function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isCoreAgentName(value: string): value is CoreAgentName {
  return CORE_AGENT_SET.has(value);
}

export function isCoordinatorAgent(value: string) {
  const key = normalizeAgentKey(value);
  return value === MAIN_AGENT_ID || key === "planner" || key === "pmo" || key.includes("pm agent") || key.includes("agenthub");
}

function isLikelyUserParticipant(value: string) {
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) || /^\d{8,}$/.test(trimmed) || trimmed.includes("@");
}

function participantToAgentName(participant: string) {
  const trimmed = participant.trim();
  if (!trimmed) return null;
  if (isCoordinatorAgent(trimmed)) return "planner";
  const key = normalizeAgentKey(trimmed);
  if (isCoreAgentName(key)) return key;
  if (isLikelyUserParticipant(trimmed)) return null;
  return trimmed;
}

export function buildInitialConversationAgentNames(participants: string[], convType: string) {
  if (convType !== "group" && convType !== "task_room") {
    const directAgent = participants.map(participantToAgentName).find(Boolean);
    return directAgent ? [directAgent] : ["planner"];
  }

  const selectedAgents = participants
    .map(participantToAgentName)
    .filter((name): name is string => Boolean(name));

  return unique(["planner", ...selectedAgents]);
}

export function getEffectiveEnabledAgentNames(
  participants: string[],
  convType: string,
  entries: ConversationAgentEntry[]
) {
  const participantAgents = buildInitialConversationAgentNames(participants, convType);
  const hasExplicitParticipantAgents = participantAgents.some((name) => !isCoordinatorAgent(name));
  const entryMap = new Map(entries.map((entry) => [entry.agentName, entry]));
  const enabledNames = entries.filter((entry) => entry.enabled).map((entry) => entry.agentName);

  if (hasExplicitParticipantAgents) {
    const fromParticipants = participantAgents.filter((name) => entryMap.get(name)?.enabled ?? true);
    return unique(fromParticipants.length > 0 ? fromParticipants : ["planner"]);
  }

  return unique(enabledNames.length > 0 ? enabledNames : participantAgents);
}

export function agentNameMatchesRole(agentName: string, role: string) {
  const key = normalizeAgentKey(agentName);
  const roleKey = normalizeAgentKey(role);
  if (key === roleKey) return true;
  if (roleKey === "planner") return isCoordinatorAgent(agentName);
  if (roleKey === "worker") return /(worker|coder|codex|code|frontend|backend|engineer|develop)/.test(key);
  if (roleKey === "critic") return /(critic|review|reviewer|test|qa|quality|claude)/.test(key);
  if (roleKey === "researcher") return /(research|search|browser|analyst|data)/.test(key);
  if (roleKey === "refiner") return /(refiner|design|designer|ux|ui|polish|writer|content)/.test(key);
  return false;
}

export function selectEnabledAgentsForTask(requestedAgents: string[], enabledAgentNames: string[]) {
  const enabled = unique(enabledAgentNames);
  if (enabled.length === 0) return ["planner"];

  const selected: string[] = [];
  for (const requested of requestedAgents) {
    const exact = enabled.find((name) => normalizeAgentKey(name) === normalizeAgentKey(requested));
    if (exact) {
      selected.push(exact);
      continue;
    }

    const roleMatch = enabled.find((name) => agentNameMatchesRole(name, requested) && !selected.includes(name));
    if (roleMatch) selected.push(roleMatch);
  }

  if (selected.length === 0) {
    selected.push(enabled.find((name) => !isCoordinatorAgent(name)) ?? enabled[0]);
  }

  return unique(selected);
}

export function resolveVisibleAgentForRole(role: string, activeAgents: string[]) {
  const agents = unique(activeAgents);
  const exact = agents.find((name) => normalizeAgentKey(name) === normalizeAgentKey(role));
  if (exact) return exact;

  const preferred = agents.find((name) => agentNameMatchesRole(name, role));
  if (preferred) return preferred;

  if (normalizeAgentKey(role) === "planner") {
    return agents.find(isCoordinatorAgent) ?? "planner";
  }

  return agents.find((name) => !isCoordinatorAgent(name)) ?? agents[0] ?? role;
}
