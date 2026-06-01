"use client";

import { memo, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined";
  padding?: "none" | "sm" | "md" | "lg";
  header?: ReactNode;
  footer?: ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: "var(--surface-white)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-xs)",
  },
  elevated: {
    background: "var(--surface-white)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-md)",
  },
  outlined: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    boxShadow: "none",
  },
};

const paddingStyles: Record<string, React.CSSProperties> = {
  none: { padding: "0" },
  sm: { padding: "12px" },
  md: { padding: "16px" },
  lg: { padding: "24px" },
};

export const Card = memo(function Card({
  variant = "default",
  padding = "md",
  header,
  footer,
  style,
  children,
  ...props
}: CardProps) {
  const baseStyle: React.CSSProperties = {
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    ...variantStyles[variant],
    ...style,
  };

  return (
    <div style={baseStyle} {...props}>
      {header && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--divider)",
            background: "var(--surface-tinted)",
          }}
        >
          {header}
        </div>
      )}
      <div style={paddingStyles[padding]}>{children}</div>
      {footer && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--divider)",
            background: "var(--surface-tinted)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
});