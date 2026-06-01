"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "200px",
            padding: "24px",
            background: "var(--surface-white)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "var(--danger-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--danger)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: "var(--text-md)",
              fontWeight: 600,
              color: "var(--fg-primary)",
              marginBottom: "8px",
            }}
          >
            出现了一些问题
          </h3>
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--fg-tertiary)",
              marginBottom: "16px",
              textAlign: "center",
              maxWidth: "400px",
            }}
          >
            {this.state.error?.message || "发生了未知错误，请刷新页面重试"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              color: "white",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}