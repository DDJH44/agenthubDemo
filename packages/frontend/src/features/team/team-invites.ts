import { createId } from "@/lib/id";
import { buildApiUrl } from "@/lib/runtime-config";

export type TeamInviteStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface TeamInvite {
  id: string;
  email: string;
  name?: string;
  contactId?: string;
  invitedAt: number;
  respondedAt?: number;
  source: "settings" | "right-panel" | "contacts";
  fromEmail?: string;
  fromName?: string;
  status?: TeamInviteStatus;
}

const STORAGE_KEY = "agenthub-team-invites";
const INBOX_STORAGE_KEY = "agenthub-team-invite-inbox";
const EVENT_NAME = "agenthub:team-invites";
const INBOX_EVENT_NAME = "agenthub:team-invite-inbox";
const TOKEN_KEY = "agenthub-auth-token";

function readInvites(): TeamInvite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readInbox(): TeamInvite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INBOX_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inviteStatus(invite: TeamInvite): TeamInviteStatus {
  return invite.status ?? "pending";
}

function isTeamInviteStatus(value: unknown): value is TeamInviteStatus {
  return value === "pending" || value === "accepted" || value === "declined" || value === "cancelled";
}

function authHeaders() {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function normalizeRemoteInvite(value: unknown): TeamInvite | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const email = normalizeInviteEmail(typeof record.email === "string" ? record.email : undefined);
  if (!email) return null;
  return {
    id: typeof record.id === "string" ? record.id : createId(),
    email,
    name: typeof record.name === "string" ? record.name : undefined,
    contactId: typeof record.contactId === "string" ? record.contactId : undefined,
    invitedAt: typeof record.invitedAt === "number" ? record.invitedAt : Date.now(),
    respondedAt: typeof record.respondedAt === "number" ? record.respondedAt : undefined,
    source: record.source === "settings" || record.source === "right-panel" || record.source === "contacts" ? record.source : "settings",
    fromEmail: normalizeInviteEmail(typeof record.fromEmail === "string" ? record.fromEmail : undefined) ?? undefined,
    fromName: typeof record.fromName === "string" ? record.fromName : undefined,
    status: isTeamInviteStatus(record.status) ? record.status : "pending",
  };
}

function mergeInvites(existing: TeamInvite[], incoming: TeamInvite[]) {
  const byId = new Map<string, TeamInvite>();
  for (const invite of existing) byId.set(invite.id, invite);
  for (const invite of incoming) byId.set(invite.id, invite);
  return Array.from(byId.values()).sort((a, b) => b.invitedAt - a.invitedAt);
}

async function createRemoteInvite(invite: TeamInvite) {
  const headers = authHeaders();
  if (!headers) return;
  try {
    await fetch(buildApiUrl("/api/team-invites"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: invite.id,
        email: invite.email,
        name: invite.name,
        contactId: invite.contactId,
        source: invite.source,
      }),
    });
  } catch {
    console.warn("[team-invites] Failed to sync invite to the server.");
  }
}

async function updateRemoteInvite(id: string, action: "accept" | "decline") {
  const headers = authHeaders();
  if (!headers) return;
  try {
    await fetch(buildApiUrl(`/api/team-invites/${encodeURIComponent(id)}/${action}`), {
      method: "POST",
      headers,
    });
  } catch {
    // Best-effort sync only.
  }
}

async function cancelRemoteInvite(id: string) {
  const headers = authHeaders();
  if (!headers) return;
  try {
    await fetch(buildApiUrl(`/api/team-invites/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers,
    });
  } catch {
    // Best-effort sync only.
  }
}

function dispatchInboxEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: readInbox() }));
}

function writeInvites(invites: TeamInvite[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invites));
  window.dispatchEvent(new CustomEvent<TeamInvite[]>(EVENT_NAME, { detail: invites.filter((invite) => inviteStatus(invite) === "pending") }));
}

function writeInbox(invites: TeamInvite[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(invites));
  dispatchInboxEvent();
}

export function normalizeInviteEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function getPendingTeamInvites() {
  return readInvites().filter((invite) => inviteStatus(invite) === "pending");
}

export function getIncomingTeamInvites(currentUserEmail: string | null | undefined) {
  const email = normalizeInviteEmail(currentUserEmail);
  if (!email) return [];
  return readInbox()
    .filter((invite) => invite.email === email && inviteStatus(invite) === "pending")
    .sort((a, b) => b.invitedAt - a.invitedAt);
}

export function addPendingTeamInvite(
  value: string | null | undefined,
  source: TeamInvite["source"],
  meta: { name?: string; contactId?: string; fromEmail?: string | null; fromName?: string | null } = {},
): { ok: true; invite: TeamInvite; duplicate: boolean } | { ok: false; reason: "invalid" } {
  const email = normalizeInviteEmail(value);
  if (!email) return { ok: false, reason: "invalid" };
  const fromEmail = normalizeInviteEmail(meta.fromEmail);
  const fromName = meta.fromName?.trim() || undefined;

  const current = readInvites();
  const existing = current.find((invite) => (
    invite.email === email &&
    inviteStatus(invite) === "pending" &&
    (!fromEmail || invite.fromEmail === fromEmail)
  ));
  if (existing) {
    const updated: TeamInvite = {
      ...existing,
      name: meta.name?.trim() || existing.name,
      contactId: meta.contactId || existing.contactId,
      fromEmail: fromEmail || existing.fromEmail,
      fromName: fromName || existing.fromName,
    };
    writeInvites(current.map((invite) => (invite.id === existing.id ? updated : invite)));
    void createRemoteInvite(updated);
    return { ok: true, invite: updated, duplicate: true };
  }

  const invite: TeamInvite = {
    id: createId(),
    email,
    name: meta.name?.trim() || undefined,
    contactId: meta.contactId,
    invitedAt: Date.now(),
    source,
    fromEmail: fromEmail || undefined,
    fromName,
    status: "pending",
  };
  writeInvites([invite, ...current]);
  void createRemoteInvite(invite);
  return { ok: true, invite, duplicate: false };
}

export function removePendingTeamInvite(id: string) {
  writeInvites(readInvites().filter((invite) => invite.id !== id));
  writeInbox(readInbox().map((invite) => (
    invite.id === id ? { ...invite, status: "cancelled", respondedAt: Date.now() } : invite
  )));
  void cancelRemoteInvite(id);
}

export function acceptIncomingTeamInvite(id: string, currentUserEmail: string | null | undefined) {
  const email = normalizeInviteEmail(currentUserEmail);
  if (!email) return { ok: false as const, reason: "invalid-user" as const };
  const inbox = readInbox();
  const invite = inbox.find((item) => item.id === id && item.email === email && inviteStatus(item) === "pending");
  if (!invite) return { ok: false as const, reason: "not-found" as const };
  const respondedAt = Date.now();
  const accepted: TeamInvite = { ...invite, status: "accepted", respondedAt };
  writeInbox(inbox.map((item) => (item.id === id ? accepted : item)));
  writeInvites(readInvites().map((item) => (item.id === id ? { ...item, status: "accepted", respondedAt } : item)));
  void updateRemoteInvite(id, "accept");
  return { ok: true as const, invite: accepted };
}

export function declineIncomingTeamInvite(id: string, currentUserEmail: string | null | undefined) {
  const email = normalizeInviteEmail(currentUserEmail);
  if (!email) return { ok: false as const, reason: "invalid-user" as const };
  const inbox = readInbox();
  const invite = inbox.find((item) => item.id === id && item.email === email && inviteStatus(item) === "pending");
  if (!invite) return { ok: false as const, reason: "not-found" as const };
  const respondedAt = Date.now();
  const declined: TeamInvite = { ...invite, status: "declined", respondedAt };
  writeInbox(inbox.map((item) => (item.id === id ? declined : item)));
  writeInvites(readInvites().map((item) => (item.id === id ? { ...item, status: "declined", respondedAt } : item)));
  void updateRemoteInvite(id, "decline");
  return { ok: true as const, invite: declined };
}

export async function syncIncomingTeamInvitesFromServer(currentUserEmail: string | null | undefined) {
  const email = normalizeInviteEmail(currentUserEmail);
  const headers = authHeaders();
  if (!email || !headers) return getIncomingTeamInvites(currentUserEmail);

  try {
    const response = await fetch(buildApiUrl("/api/team-invites/incoming"), { headers });
    if (!response.ok) return getIncomingTeamInvites(currentUserEmail);
    const data = await response.json() as { invites?: unknown[] };
    const incoming = Array.isArray(data.invites)
      ? data.invites.map(normalizeRemoteInvite).filter((invite): invite is TeamInvite => Boolean(invite))
      : [];
    const nextInbox = mergeInvites(
      readInbox().filter((invite) => !(invite.email === email && inviteStatus(invite) === "pending" && invite.fromEmail)),
      incoming,
    );
    writeInbox(nextInbox);
    return getIncomingTeamInvites(currentUserEmail);
  } catch {
    return getIncomingTeamInvites(currentUserEmail);
  }
}

export function subscribeTeamInvites(listener: (invites: TeamInvite[]) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<TeamInvite[]>).detail ?? getPendingTeamInvites());
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(getPendingTeamInvites());
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}

export function subscribeIncomingTeamInvites(
  currentUserEmail: string | null | undefined,
  listener: (invites: TeamInvite[]) => void,
) {
  if (typeof window === "undefined") return () => {};
  const emit = () => listener(getIncomingTeamInvites(currentUserEmail));
  const handler = () => emit();
  const storageHandler = (event: StorageEvent) => {
    if (event.key === INBOX_STORAGE_KEY || event.key === STORAGE_KEY) emit();
  };
  window.addEventListener(INBOX_EVENT_NAME, handler);
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(INBOX_EVENT_NAME, handler);
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
