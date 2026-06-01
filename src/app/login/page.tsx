"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../packages/frontend/src/stores/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const { login, register, isAuthenticated, isLoading, error } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useAuthStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center" style={{ background: "var(--bg-root)" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-hidden" style={{ background: "var(--bg-root)" }}>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="relative hidden overflow-hidden lg:block" aria-label="AgentHub">
          <Image
            src="/agenthub-logo.png"
            alt="AgentHub assistant"
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 0vw"
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(248,249,252,0) 0%, rgba(248,249,252,0.78) 100%)" }} />
          <div className="absolute left-8 top-8 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl shadow-sm" style={{ background: "rgba(255,255,255,0.86)", border: "1px solid rgba(255,255,255,0.65)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 18 }}>A</span>
            </div>
            <span style={{ color: "#14141a", fontSize: 18, fontWeight: 750, letterSpacing: 0 }}>AgentHub</span>
          </div>
        </section>

        <section className="flex min-h-dvh items-center justify-center px-5 py-8 sm:px-8" aria-label="登录">
          <div className="w-full max-w-[400px]">
            <div className="mb-8 lg:hidden">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--accent-gradient)" }}>
                <span className="text-white" style={{ fontWeight: 800, fontSize: 21 }}>A</span>
              </div>
              <h1 style={{ color: "var(--fg-primary)", fontSize: 26, fontWeight: 760, lineHeight: 1.15 }}>AgentHub</h1>
            </div>

            <div className="mb-7">
              <p className="mb-2" style={{ color: "var(--fg-tertiary)", fontSize: 13, fontWeight: 600 }}>欢迎回来</p>
              <h2 style={{ color: "var(--fg-primary)", fontSize: 28, fontWeight: 760, lineHeight: 1.2 }}>
                {mode === "login" ? "登录工作台" : "创建账号"}
              </h2>
            </div>

            <div
              className="mb-6 grid grid-cols-2 rounded-xl p-1"
              role="tablist"
              aria-label="账号操作"
              style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => setMode("login")}
                className="h-10 rounded-lg text-sm font-semibold transition"
                style={{
                  background: mode === "login" ? "var(--surface-white)" : "transparent",
                  color: mode === "login" ? "var(--fg-primary)" : "var(--fg-tertiary)",
                  boxShadow: mode === "login" ? "var(--shadow-xs)" : "none",
                }}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => setMode("register")}
                className="h-10 rounded-lg text-sm font-semibold transition"
                style={{
                  background: mode === "register" ? "var(--surface-white)" : "transparent",
                  color: mode === "register" ? "var(--fg-primary)" : "var(--fg-tertiary)",
                  boxShadow: mode === "register" ? "var(--shadow-xs)" : "none",
                }}
              >
                注册
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === "login" ? "登录表单" : "注册表单"}>
              {mode === "register" && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>姓名</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    autoComplete="name"
                    className="h-11 w-full rounded-xl px-3 text-sm outline-none transition"
                    style={{ background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                    placeholder="请输入姓名"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>邮箱</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 w-full rounded-xl px-3 text-sm outline-none transition"
                  style={{ background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                  placeholder="name@example.com"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="h-11 w-full rounded-xl px-3 text-sm outline-none transition"
                  style={{ background: "var(--surface-white)", color: "var(--fg-primary)", border: "1px solid var(--border)" }}
                  placeholder="至少 6 个字符"
                  aria-describedby={error ? "login-error" : undefined}
                />
              </label>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--danger-subtle)", color: "var(--danger)", border: "1px solid rgba(220, 53, 69, 0.16)" }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed"
                style={{ background: "var(--accent)", opacity: submitting ? 0.72 : 1, boxShadow: "0 8px 20px rgba(91,108,255,0.22)" }}
              >
                {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {submitting ? "处理中" : mode === "login" ? "进入工作台" : "创建账号"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
