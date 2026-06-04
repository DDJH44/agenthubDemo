export interface TeamInvite {
  id: string;
  email: string;
  invitedAt: number;
  source: "settings" | "right-panel";
}

const STORAGE_KEY = "agenthub-team-invites";
const EVENT_NAME = "agenthub:team-invites";

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

function writeInvites(invites: TeamInvite[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invites));
  window.dispatchEvent(new CustomEvent<TeamInvite[]>(EVENT_NAME, { detail: invites }));
}

export function normalizeInviteEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function getPendingTeamInvites() {
  return readInvites();
}

export function addPendingTeamInvite(
  value: string | null | undefined,
  source: TeamInvite["source"],
): { ok: true; invite: TeamInvite; duplicate: boolean } | { ok: false; reason: "invalid" } {
  const email = normalizeInviteEmail(value);
  if (!email) return { ok: false, reason: "invalid" };

  const current = readInvites();
  const existing = current.find((invite) => invite.email === email);
  if (existing) return { ok: true, invite: existing, duplicate: true };

  const invite: TeamInvite = {
    id: crypto.randomUUID(),
    email,
    invitedAt: Date.now(),
    source,
  };
  writeInvites([invite, ...current]);
  return { ok: true, invite, duplicate: false };
}

export function removePendingTeamInvite(id: string) {
  writeInvites(readInvites().filter((invite) => invite.id !== id));
}

export function subscribeTeamInvites(listener: (invites: TeamInvite[]) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<TeamInvite[]>).detail ?? readInvites());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
