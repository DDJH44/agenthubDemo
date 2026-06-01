import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://agenthub:agenthub@localhost:5432/agenthub";

export default defineConfig({
  schema: "src/db/prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
