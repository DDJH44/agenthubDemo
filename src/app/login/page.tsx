"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../packages/frontend/src/stores/auth-store";
import { useSettingsStore } from "../../../packages/frontend/src/stores/settings-store";

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
    useSettingsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
        />
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh px-4 py-5 sm:px-6 lg:grid lg:place-items-center"
      style={{
        background: "var(--page-soft-gradient)",
      }}
    >
      <div
        className="mx-auto grid min-h-[calc(100dvh-40px)] w-full max-w-[1120px] overflow-hidden rounded-[var(--radius-xl)] lg:min-h-[700px] lg:grid-cols-[minmax(0,1fr)_420px]"
        style={{
          background: "var(--surface-glass)",
          border: "1px solid var(--shell-border)",
          boxShadow: "var(--shell-shadow)",
        }}
      >
        <section
          className="relative hidden min-h-[700px] overflow-hidden lg:block"
          aria-label="AgentHub 品牌"
          style={{
            background: "var(--page-soft-gradient)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 62% 64%, var(--accent-subtle), transparent 34%), linear-gradient(180deg, transparent 0%, var(--surface-glass) 58%, var(--accent-subtle) 100%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[455px] overflow-hidden">
            <Image
              src="/brand/mascot-hero.png"
              alt="AgentHub assistant"
              width={500}
              height={467}
              priority
              sizes="500px"
              className="absolute left-1/2 bottom-[-120px]"
              style={{
                height: "auto",
                width: 500,
                opacity: 0.94,
                transform: "translateX(-50%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, #000 38%, rgba(0,0,0,0.76) 55%, transparent 78%)",
                maskImage:
                  "radial-gradient(ellipse at center, #000 38%, rgba(0,0,0,0.76) 55%, transparent 78%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, transparent 38%, var(--surface-glass) 62%, var(--accent-subtle) 100%)",
              }}
            />
            <div
              className="absolute inset-y-0 left-0 w-[220px]"
              style={{
                background:
                  "linear-gradient(90deg, var(--surface-glass-strong) 0%, var(--surface-glass) 62%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-y-0 right-0 w-[160px]"
              style={{
                background:
                  "linear-gradient(270deg, var(--accent-subtle) 0%, var(--surface-glass) 52%, transparent 100%)",
              }}
            />
          </div>

          <div className="relative z-10 flex items-center justify-between px-9 pt-8">
            <Image
              src="/brand/logo-lockup.png"
              alt="AgentHub"
              width={202}
              height={58}
              priority
              style={{ display: "block", height: "auto", width: 202 }}
            />
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                border: "1px solid var(--accent-border)",
              }}
            >
              AI Agents · Together
            </span>
          </div>

          <div className="relative z-10 mt-14 max-w-[540px] px-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--fg-tertiary)" }}>
              AgentHub Workspace
            </p>
            <h1 className="text-[40px] font-[780] leading-[1.12]" style={{ color: "var(--fg-primary)" }}>
              多 <span style={{ color: "var(--accent)" }}>Agent</span> 协作，从一个清晰入口开始。
            </h1>
            <p className="mt-5 max-w-[460px] text-sm leading-7" style={{ color: "var(--fg-secondary)" }}>
              让主 Agent、代码 Agent 与产物工作流保持在同一个节奏里，高效协同，释放团队生产力。
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {["主 Agent 调度", "产物聚合", "上下文连接"].map((item) => (
                <span
                  key={item}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: "var(--surface-glass)",
                    color: "var(--fg-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 grid grid-cols-3 gap-4 px-10 pb-7">
            {[
              ["安全可靠", "企业级数据保护"],
              ["开放集成", "与工具链无缝连接"],
              ["持续进化", "AI 能力持续增强"],
            ].map(([title, desc]) => (
              <div key={title} className="flex min-w-0 items-center gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{
                    background: "var(--surface-glass)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-border)",
                    boxShadow: "var(--shadow-xs)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l7 3v5c0 4.2-2.7 8-7 10-4.3-2-7-5.8-7-10V6l7-3z" />
                    <path d="M9 12l2 2 4-5" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{title}</span>
                  <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{desc}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex min-h-[calc(100dvh-40px)] items-start justify-center px-5 pb-8 pt-16 sm:items-center sm:px-8 sm:py-8 lg:min-h-[700px]"
          aria-label="账号入口"
          style={{ background: "var(--surface-glass-strong)" }}
        >
          <div className="w-full max-w-[360px]">
            <div className="mb-8 lg:hidden">
              <Image
                src="/brand/logo-lockup.png"
                alt="AgentHub"
                width={186}
                height={54}
                priority
                style={{ display: "block", height: "auto", width: 186 }}
              />
              <p className="mt-4 text-sm leading-6" style={{ color: "var(--fg-secondary)" }}>
                多 Agent 协作工作台
              </p>
            </div>

            <div className="mb-8 flex items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                <Image src="/brand/logo-mark.png" alt="" width={25} height={25} style={{ height: 25, width: 25 }} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                  欢迎回来
                </p>
                <h2 className="mt-1 truncate text-[26px] font-[760] leading-none" style={{ color: "var(--fg-primary)" }}>
                  {mode === "login" ? "登录 AgentHub" : "创建账号"}
                </h2>
              </div>
            </div>

            <div
              className="mb-6 grid grid-cols-2 rounded-xl p-1"
              role="tablist"
              aria-label="账号操作"
              style={{ background: "var(--surface-low)", border: "1px solid var(--border)" }}
            >
              {(["login", "register"] as const).map((item) => {
                const selected = mode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMode(item)}
                    className="h-10 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: selected ? "var(--surface-white)" : "transparent",
                      color: selected ? "var(--fg-primary)" : "var(--fg-tertiary)",
                      boxShadow: selected ? "var(--shadow-xs)" : "none",
                    }}
                  >
                    {item === "login" ? "登录" : "注册"}
                  </button>
                );
              })}
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
                    className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
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
                  className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
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
                  className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
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
                  style={{ background: "var(--danger-subtle)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{ background: "var(--accent)", opacity: submitting ? 0.72 : 1, boxShadow: "var(--accent-glow)" }}
              >
                {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {submitting ? "处理中" : mode === "login" ? "进入工作台" : "创建账号"}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] leading-5" style={{ color: "var(--fg-tertiary)" }}>
              AgentHub · AI Agents Together
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
