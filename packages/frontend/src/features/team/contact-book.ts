import { createId } from "@/lib/id";
import { normalizeInviteEmail } from "./team-invites";

export type ContactSource = "manual" | "invite" | "registered";

export interface ContactEntry {
  id: string;
  name: string;
  email: string;
  role: string;
  notes?: string;
  source: ContactSource;
  createdAt: number;
  updatedAt: number;
  invitedAt?: number;
}

const STORAGE_KEY = "agenthub-contact-book";
const EVENT_NAME = "agenthub:contact-book";

function readContacts(): ContactEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeContacts(contacts: ContactEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  window.dispatchEvent(new CustomEvent<ContactEntry[]>(EVENT_NAME, { detail: contacts }));
}

export function getContacts() {
  return readContacts();
}

export function upsertContact(input: {
  email: string | null | undefined;
  name?: string;
  role?: string;
  notes?: string;
  source?: ContactSource;
  invitedAt?: number;
}): { ok: true; contact: ContactEntry; duplicate: boolean } | { ok: false; reason: "invalid" } {
  const email = normalizeInviteEmail(input.email);
  if (!email) return { ok: false, reason: "invalid" };

  const current = readContacts();
  const existing = current.find((contact) => contact.email === email);
  const now = Date.now();
  const fallbackName = email.split("@")[0] || "联系人";

  if (existing) {
    const updated: ContactEntry = {
      ...existing,
      name: input.name?.trim() || existing.name,
      role: input.role?.trim() || existing.role,
      notes: input.notes?.trim() || existing.notes,
      source: existing.source === "registered" ? "registered" : input.source ?? existing.source,
      invitedAt: input.invitedAt ?? existing.invitedAt,
      updatedAt: now,
    };
    writeContacts(current.map((contact) => (contact.id === existing.id ? updated : contact)));
    return { ok: true, contact: updated, duplicate: true };
  }

  const contact: ContactEntry = {
    id: createId(),
    email,
    name: input.name?.trim() || fallbackName,
    role: input.role?.trim() || "成员",
    notes: input.notes?.trim() || undefined,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
    invitedAt: input.invitedAt,
  };

  writeContacts([contact, ...current]);
  return { ok: true, contact, duplicate: false };
}

export function removeContact(id: string) {
  writeContacts(readContacts().filter((contact) => contact.id !== id));
}

export function subscribeContacts(listener: (contacts: ContactEntry[]) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<ContactEntry[]>).detail ?? readContacts());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
