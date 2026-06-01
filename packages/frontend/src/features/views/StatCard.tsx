"use client";

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  trend?: string;
  trendUp?: boolean;
  accentColor?: string;
}

export function StatCard({ icon, value, label, trend, trendUp }: StatCardProps) {
  return (
    <div
      className="card-breathe"
      style={{
        background: "var(--surface-white)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        padding: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.2,
              color: "var(--fg-primary)",
              fontFamily: "var(--font-heading)",
            }}
          >
            {value}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--fg-tertiary)",
              marginTop: 2,
            }}
          >
            {label}
          </p>
        </div>
      </div>
      {trend && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            marginTop: 8,
            color: trendUp ? "var(--success)" : "var(--danger)",
          }}
        >
          较昨日 {trend}
        </p>
      )}
    </div>
  );
}
