import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "../utils/logger";

const connectionString = process.env.DATABASE_URL ?? "postgresql://agenthub:agenthub@localhost:5432/agenthub";

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter, log: ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function ensureDefaults() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS deployment_targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'self-hosted',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      deploy_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'agenthub-key',
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT NOT NULL,
      post_deploy_command TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_tested_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS deployment_targets_user_id_idx ON deployment_targets(user_id)");

  const existing = await prisma.workspace.findFirst({ where: { id: "default" } });
  if (!existing) {
    await prisma.workspace.create({
      data: { id: "default", name: "默认工作空间", ownerId: "system" },
    });
    logger.info("Created default workspace", 'DB');
  }
}
