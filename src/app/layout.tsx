import type { Metadata, Viewport } from "next";
import "./globals.css";
import GlobalErrorBoundary from "./global-error-boundary";

export const metadata: Metadata = {
  title: "AgentHub",
  description: "多 Agent 协作平台",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full antialiased">
        <GlobalErrorBoundary>{children}</GlobalErrorBoundary>
      </body>
    </html>
  );
}
