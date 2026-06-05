import { config as dotenvConfig } from "dotenv";
import path from "path";
dotenvConfig({ path: "../../.env.local" });

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3003",
];

function parseCorsOrigins(value?: string) {
  return (value ? value.split(",") : DEFAULT_CORS_ORIGINS)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0")
    );
  } catch {
    return false;
  }
}

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);

export const config = {
  port: Number(process.env.PORT) || 3001,
  wsPath: "/api/ws",
  adapter: { type: (process.env.ADAPTER_TYPE ?? "openai") as string, model: process.env.LLM_MODEL ?? "gpt-4o-mini" },
  cors: { origin: corsOrigins[0] ?? "http://localhost:3000", origins: corsOrigins },
  auth: {
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 7,
    tokenLength: 32,
  },
  files: {
    uploadDir: process.env.UPLOAD_DIR ?? path.resolve(__dirname, "../db/files"),
    maxSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 100,
  },
};

export function resolveCorsOrigin(origin?: string | string[]) {
  const requestedOrigin = Array.isArray(origin) ? origin[0] : origin;
  if (!requestedOrigin) return config.cors.origin;
  if (config.cors.origins.includes("*")) return "*";
  if (config.cors.origins.includes(requestedOrigin)) return requestedOrigin;
  if (isLocalDevOrigin(requestedOrigin)) return requestedOrigin;
  return config.cors.origin;
}
