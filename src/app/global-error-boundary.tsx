"use client";
import { useEffect, useState, type ReactNode } from "react";

interface Props { children: ReactNode }

export default function GlobalErrorBoundary({ children }: Props) {
  const [caughtError, setCaughtError] = useState<{ name: string; message: string; stack: string } | null>(null);

  useEffect(() => {
    const handleGlobalError = (e: ErrorEvent) => {
      console.error("===== CAUGHT GLOBAL JS ERROR =====", e.error);
      if (e.error) {
        setCaughtError({
          name: e.error?.name ?? "UnknownError",
          message: e.error?.message ?? String(e.error),
          stack: e.error?.stack ?? "no stack trace",
        });
      }
    };
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error("===== CAUGHT UNHANDLED PROMISE REJECTION =====", e.reason);
      if (e.reason instanceof Error) {
        setCaughtError({
          name: e.reason.name,
          message: e.reason.message,
          stack: e.reason.stack ?? "",
        });
      } else {
        setCaughtError({
          name: "UnhandledRejection",
          message: String(e.reason),
          stack: "",
        });
      }
    };
    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (caughtError) {
    return (
      <div className="min-h-screen bg-red-50 p-8" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ color: "#dc2626", fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>❌ 捕获到浏览器 JS 运行时错误</h1>
          <div style={{ background: "white", padding: 20, borderRadius: 12, border: "1px solid #fecaca" }}>
            <p style={{ fontSize: 18, fontWeight: 600, color: "#991b1b", marginBottom: 8 }}>{caughtError.name}: {caughtError.message}</p>
            <pre style={{ marginTop: 12, padding: 12, background: "#fef2f2", color: "#7f1d1d", overflowX: "auto", fontSize: 12, lineHeight: 1.6, borderRadius: 8 }}>
              {caughtError.stack}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
