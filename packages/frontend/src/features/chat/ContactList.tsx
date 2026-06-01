"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import Image from "next/image";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: number;
}

interface ContactListProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const AVATAR_COLORS = ["#5b4fff", "#2b7fff", "#006c49", "#825100", "#ba1a1a", "#7c3aed", "#0891b2", "#c2410c"];

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function UserAvatar({ user, size = 36 }: { user: UserInfo; size?: number }) {
  if (user.avatarUrl) {
    return (
      <div
        className="rounded-full overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={user.avatarUrl}
          alt={user.name}
          width={size}
          height={size}
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center text-white shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        background: getAvatarColor(user.name),
        fontSize: size * 0.4,
      }}
    >
      {user.name[0]?.toUpperCase() || "?"}
    </div>
  );
}

export function ContactList({ selected, onChange }: ContactListProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadUsers = useCallback(async (query: string, cursor?: string | null, append = false) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const data = await api.get<{ users: UserInfo[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/users?${params.toString()}`
      );

      if (append) {
        setUsers((prev) => [...prev, ...data.users]);
      } else {
        setUsers(data.users);
      }
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

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      loadUsers(val);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadUsers(search, nextCursor, true);
    }
  }, [loadingMore, hasMore, search, nextCursor, loadUsers]);

  const handleToggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: 360 }}>
      <div className="px-1 pb-2">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
          style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索联系人..."
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: "var(--text-sm)", color: "var(--fg-primary)" }}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--surface-mid)] transition-colors"
              style={{ color: "var(--fg-tertiary)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18 M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
        onScroll={handleScroll}
        style={{ minHeight: 280 }}
      >
        {loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>加载中...</span>
          </div>
        )}

        {error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4 M12 16h.01" />
            </svg>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--danger)" }}>{error}</span>
            <button
              onClick={() => loadUsers(search)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>
              {search ? "未找到匹配的联系人" : "暂无联系人"}
            </p>
            {search && (
              <button
                onClick={() => handleSearchChange("")}
                style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}
              >
                清除搜索
              </button>
            )}
          </div>
        )}

        {users.map((user) => {
          const isSelected = selected.includes(user.id);
          return (
            <button
              key={user.id}
              onClick={() => handleToggle(user.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left hover:bg-[var(--surface-low)]"
              style={{ background: isSelected ? "var(--accent-subtle)" : "transparent" }}
            >
              <div className="relative">
                <UserAvatar user={user} size={36} />
                <div
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    borderColor: "var(--surface-white)",
                    background: "var(--success)",
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-primary)" }}>
                  {user.name}
                </span>
                <p className="truncate" style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)", marginTop: 1 }}>
                  {user.email}
                </p>
              </div>
              <div className="shrink-0">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center transition-all"
                  style={{
                    border: isSelected ? "none" : "2px solid var(--fg-disabled)",
                    background: isSelected ? "var(--accent)" : "transparent",
                  }}
                >
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {loadingMore && (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-tertiary)" }}>加载更多...</span>
          </div>
        )}

        {!hasMore && users.length > 0 && (
          <div className="flex items-center justify-center py-3">
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--fg-disabled)" }}>
              ── 已加载全部 {users.length} 位联系人 ──
            </span>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="px-1 pt-2 mt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--fg-tertiary)" }}>
            已选 {selected.length} 位联系人
          </p>
        </div>
      )}
    </div>
  );
}
