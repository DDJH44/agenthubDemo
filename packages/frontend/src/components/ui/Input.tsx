"use client";

import { memo, type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, error, helperText, fullWidth = false, style, ...props },
    ref
  ) {
    const baseStyle: React.CSSProperties = {
      height: "36px",
      padding: "0 12px",
      borderRadius: "var(--radius-sm)",
      border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
      background: "var(--surface-white)",
      fontSize: "var(--text-sm)",
      color: "var(--fg-primary)",
      outline: "none",
      transition: "all var(--duration-fast) var(--ease-smooth)",
      width: fullWidth ? "100%" : "auto",
      ...style,
    };

    return (
      <div style={{ width: fullWidth ? "100%" : "auto" }}>
        {label && (
          <label
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "var(--fg-secondary)",
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          style={baseStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--accent)";
            e.currentTarget.style.boxShadow = error
              ? "0 0 0 2px var(--danger-subtle)"
              : "0 0 0 2px var(--accent-subtle)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
          {...props}
        />
        {error && (
          <p
            style={{
              marginTop: "4px",
              fontSize: "var(--text-xs)",
              color: "var(--danger)",
            }}
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            style={{
              marginTop: "4px",
              fontSize: "var(--text-xs)",
              color: "var(--fg-tertiary)",
            }}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  })
);