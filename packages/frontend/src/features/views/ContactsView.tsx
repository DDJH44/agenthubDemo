"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  acceptIncomingTeamInvite,
  addPendingTeamInvite,
  declineIncomingTeamInvite,
  getIncomingTeamInvites,
  getPendingTeamInvites,
  subscribeIncomingTeamInvites,
  subscribeTeamInvites,
  syncIncomingTeamInvitesFromServer,
  type TeamInvite,
} from "@/features/team/team-invites";
import { getContacts, removeContact, subscribeContacts, upsertContact, type ContactEntry } from "@/features/team/contact-book";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: number;
}

interface ContactRow {
  id: string;
  localId?: string;
  userId?: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  source: "registered" | "manual" | "invite";
  isPending: boolean;
  invitedAt?: number;
}

const AVATAR_COLORS = ["#5b4fff", "#2b7fff", "#006c49", "#825100", "#ba1a1a", "#7c3aed", "#0891b2", "#c2410c"];

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[Math.abs(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function sourceLabel(source: ContactRow["source"], isPending: boolean) {
  if (isPending) return "待确认";
  if (source === "registered") return "已注册";
  if (source === "invite") return "邀请中";
  return "本地联系人";
}

function ContactCard({
  contact,
  onInvite,
  onRemove,
}: {
  contact: ContactRow;
  onInvite: (contact: ContactRow) => void;
  onRemove?: (contact: ContactRow) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--surface-low)]" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
      <div className="relative shrink-0">
        {contact.avatarUrl ? (
          <div className="h-11 w-11 overflow-hidden rounded-full">
            <Image src={contact.avatarUrl} alt={contact.name} width={44} height={44} className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white" style={{ background: getAvatarColor(contact.name) }}>
            {contact.name[0]?.toUpperCase() || "?"}
          </div>
        )}
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2" style={{ borderColor: "var(--surface-white)", background: contact.isPending ? "var(--warning)" : "var(--success)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{contact.name}</p>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: contact.isPending ? "var(--warning-subtle)" : "var(--accent-subtle)", color: contact.isPending ? "var(--warning)" : "var(--accent)" }}>
            {sourceLabel(contact.source, contact.isPending)}
          </span>
        </div>
        <p className="mt-1 truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{contact.email}</p>
        <p className="mt-1 truncate text-[11px]" style={{ color: "var(--fg-secondary)" }}>{contact.role}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onInvite(contact)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: contact.isPending ? "var(--surface-low)" : "var(--accent-subtle)", color: contact.isPending ? "var(--fg-tertiary)" : "var(--accent)" }}
        >
          {contact.isPending ? "已邀请" : "邀请"}
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(contact)}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-low)]"
            style={{ color: "var(--fg-tertiary)" }}
            title="删除联系人"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ContactsView() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<TeamInvite[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("成员");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = useSettingsStore((s) => s.locale);

  const loadUsers = useCallback(async (query: string, cursor?: string | null, append = false) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const data = await api.get<{ users: UserInfo[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/users?${params.toString()}`
      );

      if (append) setUsers((prev) => [...prev, ...data.users]);
      else setUsers(data.users);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setContacts(getContacts());
      setPendingInvites(getPendingTeamInvites());
      setIncomingInvites(getIncomingTeamInvites(currentUser?.email));
      void syncIncomingTeamInvitesFromServer(currentUser?.email).then(setIncomingInvites);
      void loadUsers("");
    }, 0);
    const unsubscribeContacts = subscribeContacts(setContacts);
    const unsubscribeInvites = subscribeTeamInvites(setPendingInvites);
    const unsubscribeIncoming = subscribeIncomingTeamInvites(currentUser?.email, setIncomingInvites);
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribeContacts();
      unsubscribeInvites();
      unsubscribeIncoming();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [currentUser?.email, loadUsers]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void loadUsers(value), 300);
  };

  const pendingByEmail = useMemo(() => new Map(pendingInvites.map((invite) => [invite.email, invite])), [pendingInvites]);

  const rows = useMemo(() => {
    const byEmail = new Map<string, ContactRow>();
    for (const contact of contacts) {
      const pending = pendingByEmail.get(contact.email);
      byEmail.set(contact.email, {
        id: contact.id,
        localId: contact.id,
        name: contact.name,
        email: contact.email,
        avatarUrl: null,
        role: contact.role,
        source: contact.source,
        isPending: Boolean(pending),
        invitedAt: pending?.invitedAt ?? contact.invitedAt,
      });
    }
    for (const user of users) {
      const pending = pendingByEmail.get(user.email);
      const existing = byEmail.get(user.email);
      byEmail.set(user.email, {
        id: user.id,
        localId: existing?.localId,
        userId: user.id,
        name: existing?.name || user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: existing?.role || "已注册用户",
        source: "registered",
        isPending: Boolean(pending),
        invitedAt: pending?.invitedAt ?? existing?.invitedAt,
      });
    }

    const query = search.trim().toLowerCase();
    return Array.from(byEmail.values())
      .filter((contact) => !query || `${contact.name} ${contact.email} ${contact.role}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.isPending) - Number(a.isPending) || a.name.localeCompare(b.name, "zh-CN"));
  }, [contacts, pendingByEmail, search, users]);

  const stats = useMemo(() => ({
    total: rows.length,
    local: contacts.length,
    pending: pendingInvites.length,
    incoming: incomingInvites.length,
    registered: rows.filter((row) => row.source === "registered").length,
  }), [contacts.length, incomingInvites.length, pendingInvites.length, rows]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      void loadUsers(search, nextCursor, true);
    }
  }, [loadingMore, hasMore, search, nextCursor, loadUsers]);

  const addContact = (inviteAfterAdd: boolean) => {
    const result = upsertContact({
      email: contactEmail,
      name: contactName,
      role: contactRole,
      source: inviteAfterAdd ? "invite" : "manual",
      invitedAt: inviteAfterAdd ? Date.now() : undefined,
    });
    if (!result.ok) {
      setNotice({ ok: false, text: "请输入有效邮箱" });
      return;
    }
    if (inviteAfterAdd) {
      const invite = addPendingTeamInvite(result.contact.email, "contacts", {
        name: result.contact.name,
        contactId: result.contact.id,
        fromEmail: currentUser?.email,
        fromName: currentUser?.name,
      });
      if (!invite.ok) {
        setNotice({ ok: false, text: "联系人已保存，但邀请邮箱无效" });
        return;
      }
    }
    setContactName("");
    setContactEmail("");
    setContactRole("成员");
    setNotice({ ok: true, text: inviteAfterAdd ? "联系人已添加并发起邀请" : "联系人已添加" });
  };

  const inviteContact = (contact: ContactRow) => {
    const saved = upsertContact({
      email: contact.email,
      name: contact.name,
      role: contact.role,
      source: contact.source === "registered" ? "registered" : "invite",
      invitedAt: Date.now(),
    });
    const result = addPendingTeamInvite(contact.email, "contacts", {
      name: contact.name,
      contactId: saved.ok ? saved.contact.id : contact.localId,
      fromEmail: currentUser?.email,
      fromName: currentUser?.name,
    });
    if (!result.ok) {
      setNotice({ ok: false, text: "邀请失败，请检查邮箱" });
      return;
    }
    setNotice({ ok: true, text: result.duplicate ? "该联系人已在待确认邀请中" : `已邀请 ${contact.name}` });
  };

  const acceptInvite = (invite: TeamInvite) => {
    const result = acceptIncomingTeamInvite(invite.id, currentUser?.email);
    if (!result.ok) {
      setNotice({ ok: false, text: "邀请状态已变化，请刷新后重试" });
      return;
    }
    upsertContact({
      email: result.invite.fromEmail,
      name: result.invite.fromName || result.invite.fromEmail,
      role: "团队成员",
      source: "invite",
      invitedAt: result.invite.invitedAt,
    });
    setIncomingInvites(getIncomingTeamInvites(currentUser?.email));
    setNotice({ ok: true, text: `已接受 ${result.invite.fromName || result.invite.fromEmail} 的邀请` });
  };

  const declineInvite = (invite: TeamInvite) => {
    const result = declineIncomingTeamInvite(invite.id, currentUser?.email);
    if (!result.ok) {
      setNotice({ ok: false, text: "邀请状态已变化，请刷新后重试" });
      return;
    }
    setIncomingInvites(getIncomingTeamInvites(currentUser?.email));
    setNotice({ ok: true, text: "已忽略该邀请" });
  };

  const removeLocalContact = (contact: ContactRow) => {
    if (!contact.localId) return;
    removeContact(contact.localId);
    setNotice({ ok: true, text: "联系人已删除" });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>
              通讯录
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
              {locale === "zh" ? "添加联系人、邀请成员，并在会话协作中复用这些人员。" : "Manage contacts and invite members."}
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            <ContactMetric label="全部" value={stats.total} />
            <ContactMetric label="本地" value={stats.local} />
            <ContactMetric label="已注册" value={stats.registered} />
            <ContactMetric label="已发出" value={stats.pending} />
            <ContactMetric label="收到" value={stats.incoming} />
          </div>
        </div>
      </div>

      {incomingInvites.length > 0 ? (
        <div className="px-6 pt-3">
          <div className="rounded-lg p-3" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--fg-primary)" }}>收到的成员邀请</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>接受后，对方会加入你的通讯录，后续可用于群聊协作。</p>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--surface-white)", color: "var(--accent)" }}>
                {incomingInvites.length} 条
              </span>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {incomingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: getAvatarColor(invite.fromName || invite.fromEmail || "A") }}>
                    {(invite.fromName || invite.fromEmail || "A").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
                      {invite.fromName || invite.fromEmail || "团队成员"}
                    </p>
                    <p className="truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>
                      邀请你加入 AgentHub 协作
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => acceptInvite(invite)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                      接受
                    </button>
                    <button type="button" onClick={() => declineInvite(invite)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
                      忽略
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 px-6 py-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="rounded-lg p-3" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
          <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>添加联系人</p>
          <div className="grid gap-2">
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="姓名，如 张三" className="h-9 rounded-lg px-3 text-sm outline-none" style={{ background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-primary)" }} />
            <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="邮箱，如 member@example.com" className="h-9 rounded-lg px-3 text-sm outline-none" style={{ background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-primary)" }} />
            <input value={contactRole} onChange={(event) => setContactRole(event.target.value)} placeholder="角色，如 产品 / 前端 / 测试" className="h-9 rounded-lg px-3 text-sm outline-none" style={{ background: "var(--surface-low)", border: "1px solid var(--border)", color: "var(--fg-primary)" }} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => addContact(false)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--fg-primary)" }}>添加联系人</button>
              <button type="button" onClick={() => addContact(true)} className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>添加并邀请</button>
              {notice ? <span className="text-xs" style={{ color: notice.ok ? "var(--success)" : "var(--danger)" }}>{notice.text}</span> : null}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={locale === "zh" ? "搜索姓名、邮箱或角色..." : "Search contacts..."}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}
            />
            {search ? (
              <button type="button" onClick={() => handleSearchChange("")} className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-[var(--surface-mid)]" style={{ color: "var(--fg-tertiary)" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18 M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--fg-tertiary)" }}>注册用户来自系统账号，本地联系人用于提前邀请和组建团队。</p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 custom-scrollbar" onScroll={handleScroll}>
        {loading && users.length === 0 && contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-3" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)", borderWidth: 3 }} />
            <span className="text-sm" style={{ color: "var(--fg-tertiary)" }}>{locale === "zh" ? "加载中..." : "Loading..."}</span>
          </div>
        ) : null}

        {error && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <svg aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4 M12 16h.01" />
            </svg>
            <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>
            <button type="button" onClick={() => void loadUsers(search)} className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80" style={{ background: "var(--accent)", color: "#fff" }}>
              {locale === "zh" ? "重试" : "Retry"}
            </button>
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <svg aria-hidden="true" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>
              {search ? "未找到匹配的联系人" : "暂无联系人，先添加一个团队成员"}
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 pb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {rows.map((contact) => (
            <ContactCard
              key={`${contact.source}-${contact.email}`}
              contact={contact}
              onInvite={inviteContact}
              onRemove={contact.localId ? removeLocalContact : undefined}
            />
          ))}
        </div>

        {loadingMore ? (
          <div className="flex items-center justify-center gap-3 py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{locale === "zh" ? "加载更多..." : "Loading more..."}</span>
          </div>
        ) : null}

        {!hasMore && rows.length > 0 ? (
          <div className="py-6 text-center">
            <span className="text-xs" style={{ color: "var(--fg-disabled)" }}>已加载全部 {rows.length} 位联系人</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}>
      <p className="text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-0.5 text-base font-bold" style={{ color: "var(--fg-primary)" }}>{value}</p>
    </div>
  );
}
