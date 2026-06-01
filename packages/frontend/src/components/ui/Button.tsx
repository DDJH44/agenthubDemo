"use client";

import { memo, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--accent-gradient)",
    color: "white",
    border: "none",
    boxShadow: "var(--shadow-sm)",
  },
  secondary: {
    background: "var(--surface-white)",
    color: "var(--fg-primary)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--fg-secondary)",
    border: "none",
  },
  danger: {
    background: "var(--danger)",
    color: "white",
    border: "none",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: "28px",
    padding: "0 10px",
    fontSize: "var(--text-xs)",
  },
  md: {
    height: "34px",
    padding: "0 14px",
    fontSize: "var(--text-sm)",
  },
  lg: {
    height: "40px",
    padding: "0 18px",
    fontSize: "var(--text-base)",
  },
};

export const Button = memo(function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  children,
  ...props
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.6 : 1,
    transition: "all var(--duration-fast) var(--ease-smooth)",
    width: fullWidth ? "100%" : "auto",
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  return (
    <button
      disabled={disabled || loading}
      style={baseStyle}
      className={`${(props as { className?: string }).className ?? ""} hover:-translate-y-px hover:shadow-[var(--shadow-md)]`}
      {...props}
    >
      {loading ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
});