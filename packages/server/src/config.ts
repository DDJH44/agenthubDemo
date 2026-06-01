import { config as dotenvConfig } from "dotenv";
import path from "path";
dotenvConfig({ path: "../../.env.local" });

export const config = {
  port: Number(process.env.PORT) || 3001,
  wsPath: "/api/ws",
  adapter: { type: (process.env.ADAPTER_TYPE ?? "openai") as string, model: process.env.LLM_MODEL ?? "gpt-4o-mini" },
  cors: { origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" },
  auth: {
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 7,
    tokenLength: 32,
  },
  files: {
    uploadDir: process.env.UPLOAD_DIR ?? path.resolve(__dirname, "../db/files"),
    maxSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 100,
  },
};
