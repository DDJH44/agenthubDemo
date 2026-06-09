export const CORE_AGENT_NAMES = ["planner", "worker", "critic", "researcher", "refiner"] as const;
const KNOWN_MENTION_AGENTS = [...CORE_AGENT_NAMES, "coder", "reviewer", "browser"] as const;
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

function parseKnownMentions(text: string) {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) mentions.push(match[1].toLowerCase());

  const knownAgents = [...KNOWN_MENTION_AGENTS];
  const isAllAgents = mentions.includes("all");
  const agents = isAllAgents ? knownAgents : mentions.filter((mention) => knownAgents.includes(mention as typeof KNOWN_MENTION_AGENTS[number]));
  const cleanText = text.replace(/@\w+/g, "").trim();
  return { agents, cleanText: cleanText || text, isAllAgents };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchMentionTail(tail: string, agentName: string) {
  const words = normalizeAgentKey(agentName).split(" ").filter(Boolean);
  if (words.length === 0) return 0;

  const patterns = words.length === 1
    ? [escapeRegExp(words[0])]
    : [
        words.map(escapeRegExp).join("[\\s_-]+"),
        words.map(escapeRegExp).join("[\\s_-]*"),
      ];

  for (const pattern of patterns) {
    const match = tail.match(new RegExp(`^(${pattern})(?=$|[^A-Za-z0-9_-])`, "i"));
    if (match?.[1]) return match[1].length;
  }
  return 0;
}

function removeRanges(text: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) return text;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  let output = "";

  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    output += text.slice(cursor, start);
    cursor = end;
  }

  output += text.slice(cursor);
  return output.replace(/\s+/g, " ").trim();
}

export function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveConversationMentions(text: string, enabledAgentNames: string[]) {
  const known = parseKnownMentions(text);
  const candidates = unique([...enabledAgentNames, ...CORE_AGENT_NAMES, ...known.agents])
    .sort((a, b) => normalizeAgentKey(b).length - normalizeAgentKey(a).length);
  const ranges: Array<[number, number]> = [];
  const agents: string[] = [];
  let isAllAgents = known.isAllAgents;

  let cursor = 0;
  while (cursor < text.length) {
    const atIndex = text.indexOf("@", cursor);
    if (atIndex < 0) break;

    const tail = text.slice(atIndex + 1);
    const allMatch = tail.match(/^all(?=$|[^A-Za-z0-9_-])/i);
    if (allMatch) {
      isAllAgents = true;
      ranges.push([atIndex, atIndex + 1 + allMatch[0].length]);
      cursor = atIndex + 1 + allMatch[0].length;
      continue;
    }

    let matchedName = "";
    let matchedLength = 0;
    for (const candidate of candidates) {
      const length = matchMentionTail(tail, candidate);
      if (length > matchedLength) {
        matchedName = candidate;
        matchedLength = length;
      }
    }

    if (matchedName && matchedLength > 0) {
      agents.push(matchedName);
      ranges.push([atIndex, atIndex + 1 + matchedLength]);
      cursor = atIndex + 1 + matchedLength;
      continue;
    }

    cursor = atIndex + 1;
  }

  const cleanText = ranges.length > 0 ? removeRanges(text, ranges) : known.cleanText;
  return {
    agents: unique([...known.agents, ...agents]),
    cleanText,
    isAllAgents,
    hasMention: isAllAgents || agents.length > 0 || known.agents.length > 0,
  };
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
    return directAgent ? [directAgent] : [];
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
    if (fromParticipants.length > 0) return unique(fromParticipants);
    return convType === "group" || convType === "task_room" ? ["planner"] : [];
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

export function selectEnabledAgentsForTask(
  requestedAgents: string[],
  enabledAgentNames: string[],
  options?: { fallback?: string[] }
) {
  const enabled = unique(enabledAgentNames);
  const fallback = unique(options?.fallback ?? ["planner"]);
  if (enabled.length === 0) return fallback;

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

  return unique(selected.length > 0 ? selected : fallback);
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
