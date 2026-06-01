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
  const existing = await prisma.workspace.findFirst({ where: { id: "default" } });
  if (!existing) {
    await prisma.workspace.create({
      data: { id: "default", name: "默认工作空间", ownerId: "system" },
    });
    logger.info("Created default workspace", 'DB');
  }
}
