"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { useSettingsStore } from "@/stores/settings-store";
import Image from "next/image";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: number;
}

const AVATAR_COLORS = ["#5b4fff", "#2b7fff", "#006c49", "#825100", "#ba1a1a", "#7c3aed", "#0891b2", "#c2410c"];

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function UserCard({ user, onAction }: { user: UserInfo; onAction?: (user: UserInfo) => void }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-[var(--surface-low)]"
      style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}
    >
      <div className="relative">
        {user.avatarUrl ? (
          <div className="w-12 h-12 rounded-full overflow-hidden">
            <Image src={user.avatarUrl} alt={user.name} width={48} height={48} className="object-cover" unoptimized />
          </div>
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
            style={{ background: getAvatarColor(user.name), fontSize: 18 }}
          >
            {user.name[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
          style={{ borderColor: "var(--surface-white)", background: "var(--success)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>{user.name}</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 2 }}>{user.email}</p>
      </div>
      {onAction && (
        <button
          onClick={() => onAction(user)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          发消息
        </button>
      )}
    </div>
  );
}

export function ContactsView() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
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
      void loadUsers("");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadUsers]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadUsers(val), 300);
  };

  const handleScroll = useCallback(() => {
    if (!listRef.current || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      loadUsers(search, nextCursor, true);
    }
  }, [loadingMore, hasMore, search, nextCursor, loadUsers]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--fg-primary)", fontFamily: "var(--font-heading)" }}>
          通讯录
        </h2>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)", marginTop: 4 }}>
          {locale === "zh" ? "查看和管理你的联系人" : "View and manage your contacts"}
        </p>
      </div>

      <div className="px-6 py-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all"
          style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={locale === "zh" ? "搜索联系人..." : "Search contacts..."}
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--surface-mid)] transition-colors"
              style={{ color: "var(--fg-tertiary)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18 M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-6 custom-scrollbar"
        onScroll={handleScroll}
      >
        {loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-3 rounded-full animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)", borderWidth: 3 }} />
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>
              {locale === "zh" ? "加载中..." : "Loading..."}
            </span>
          </div>
        )}

        {error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4 M12 16h.01" />
            </svg>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--danger)" }}>{error}</span>
            <button
              onClick={() => loadUsers(search)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {locale === "zh" ? "重试" : "Retry"}
            </button>
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>
              {search ? (locale === "zh" ? "未找到匹配的联系人" : "No contacts found") : (locale === "zh" ? "暂无联系人" : "No contacts yet")}
            </p>
            {search && (
              <button onClick={() => handleSearchChange("")} style={{ fontSize: "var(--text-sm)", color: "var(--accent)" }}>
                {locale === "zh" ? "清除搜索" : "Clear search"}
              </button>
            )}
          </div>
        )}

        <div className="grid gap-3 pb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>

        {loadingMore && (
          <div className="flex items-center justify-center py-6 gap-3">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>
              {locale === "zh" ? "加载更多..." : "Loading more..."}
            </span>
          </div>
        )}

        {!hasMore && users.length > 0 && (
          <div className="text-center py-6">
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)" }}>
              ── {locale === "zh" ? `已加载全部 ${users.length} 位联系人` : `Loaded all ${users.length} contacts`} ──
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
