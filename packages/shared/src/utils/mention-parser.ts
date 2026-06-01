import { KNOWN_AGENTS, type AgentName } from "../constants/agents";
import type { ParsedMention } from "../types/conversation";

export function parseMentions(text: string): ParsedMention {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) mentions.push(match[1].toLowerCase());
  const isAllAgents = mentions.includes("all");
  const validAgents = isAllAgents ? [...KNOWN_AGENTS] : mentions.filter((m) => KNOWN_AGENTS.includes(m as AgentName));
  const cleanText = text.replace(/@\w+/g, "").trim();
  return { agents: validAgents, cleanText: cleanText || text, isAllAgents };
}
