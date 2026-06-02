"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../packages/frontend/src/stores/auth-store";

const CAPABILITY_ITEMS = [
  { label: "PMO 调度", value: "多 Agent 协同" },
  { label: "产物工作台", value: "预览 / 编辑 / 部署" },
  { label: "上下文", value: "任务记忆同步" },
];

const STATUS_ITEMS = [
  { label: "Codex", state: "在线" },
  { label: "Cloud Code", state: "待命" },
  { label: "Open Code", state: "可接入" },
];

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
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
        />
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh overflow-hidden px-4 py-4 sm:px-6 sm:py-6"
      style={{
        background:
          "linear-gradient(135deg, #eef2fb 0%, #f7f9fe 48%, #e7edf8 100%)",
      }}
    >
      <div className="mx-auto grid min-h-[calc(100dvh-32px)] max-w-[1280px] overflow-hidden rounded-[24px] shadow-lg lg:grid-cols-[minmax(0,1fr)_456px]">
        <section
          className="relative hidden min-h-[720px] overflow-hidden border-r lg:block"
          aria-label="AgentHub 品牌"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(246,248,253,0.82) 44%, rgba(235,240,250,0.88) 100%)",
            borderColor: "rgba(62,79,118,0.1)",
          }}
        >
          <div className="absolute inset-0 opacity-80">
            <Image
              src="/brand/mascot-hero.png"
              alt="AgentHub assistant"
              fill
              priority
              sizes="(min-width: 1024px) 58vw, 0vw"
              style={{ objectFit: "cover", objectPosition: "44% center", transform: "scale(0.92)" }}
            />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(247,249,253,0.18) 0%, rgba(247,249,253,0.38) 42%, rgba(247,249,253,0.9) 100%)",
            }}
          />

          <div className="relative z-10 flex h-full min-h-[720px] flex-col justify-between p-8">
            <div className="inline-flex w-fit rounded-2xl px-4 py-3 shadow-sm" style={{ background: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.76)", backdropFilter: "blur(16px)" }}>
              <Image
                src="/brand/logo-lockup.png"
                alt="AgentHub"
                width={212}
                height={60}
                priority
                style={{ display: "block", height: "auto", width: 212 }}
              />
            </div>

            <div className="max-w-[520px]">
              <div
                className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.72)", color: "var(--fg-secondary)", border: "1px solid rgba(62,79,118,0.1)", backdropFilter: "blur(14px)" }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)", boxShadow: "0 0 0 4px rgba(48,161,78,0.1)" }} />
                协作中枢已就绪
              </div>
              <h1 className="max-w-[500px] text-[34px] font-[760] leading-tight" style={{ color: "var(--fg-primary)" }}>
                把复杂任务交给主 Agent，保持团队在同一个工作流里。
              </h1>
              <p className="mt-4 max-w-[480px] text-sm leading-7" style={{ color: "var(--fg-secondary)" }}>
                AgentHub 将对话、代码产物、上下文和部署状态收束在一个轻量控制台里，让 PMO 式调度更清楚、更可追踪。
              </p>

              <div className="mt-8 grid max-w-[650px] grid-cols-3 gap-3">
                {CAPABILITY_ITEMS.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.66)", border: "1px solid rgba(62,79,118,0.1)", backdropFilter: "blur(14px)" }}
                  >
                    <p className="text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>{item.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="flex min-h-[calc(100dvh-32px)] items-center justify-center px-4 py-6 sm:px-8 lg:min-h-[720px]"
          aria-label="登录"
          style={{ background: "rgba(247,249,253,0.86)" }}
        >
          <div className="w-full max-w-[392px]">
            <div className="mb-8 lg:hidden">
              <div className="mb-5 inline-flex rounded-2xl px-3 py-2 shadow-sm" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                <Image
                  src="/brand/logo-lockup.png"
                  alt="AgentHub"
                  width={172}
                  height={50}
                  priority
                  style={{ display: "block", height: "auto", width: 172 }}
                />
              </div>
              <div className="overflow-hidden rounded-2xl border" style={{ background: "var(--surface-white)", borderColor: "var(--border)" }}>
                <Image
                  src="/brand/mascot-working.png"
                  alt="AgentHub assistant"
                  width={276}
                  height={155}
                  priority
                  style={{ display: "block", height: "auto", width: "100%" }}
                />
              </div>
            </div>

            <div
              className="rounded-[20px] p-5 shadow-md sm:p-6"
              style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(62,79,118,0.1)", backdropFilter: "blur(18px)" }}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                    欢迎回来
                  </p>
                  <h2 className="text-[26px] font-[760] leading-tight" style={{ color: "var(--fg-primary)" }}>
                    {mode === "login" ? "登录工作台" : "创建工作台账号"}
                  </h2>
                  <p className="mt-2 text-xs leading-5" style={{ color: "var(--fg-secondary)" }}>
                    进入你的 Agent 协作空间，继续处理任务、产物和部署。
                  </p>
                </div>
                <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                  <Image src="/brand/logo-mark.png" alt="" width={26} height={26} style={{ height: 26, width: 26 }} />
                </div>
              </div>

              <div
                className="mb-5 grid grid-cols-2 rounded-xl p-1"
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
                      className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)]"
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
                    className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)]"
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
                    className="h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:border-[var(--accent-border)]"
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
                  style={{ background: "var(--accent)", opacity: submitting ? 0.72 : 1, boxShadow: "0 10px 22px rgba(68,86,223,0.2)" }}
                >
                  {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {submitting ? "处理中" : mode === "login" ? "进入工作台" : "创建账号"}
                </button>
              </form>

              <div className="mt-5 rounded-xl px-3 py-3" style={{ background: "var(--surface-tinted)", border: "1px solid var(--border)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--fg-secondary)" }}>Agent 接入状态</span>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--success-subtle)", color: "var(--success)", border: "1px solid var(--success-border)" }}>健康</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_ITEMS.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: "var(--surface-white)", border: "1px solid var(--border)" }}>
                      <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg-primary)" }}>{item.label}</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{item.state}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              本地工作台模式，密钥与会话数据仅用于当前项目运行。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
