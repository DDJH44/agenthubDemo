import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { prisma } from "../db/index";

const scryptAsync = promisify(scrypt);

const SESSION_TTL_DAYS = 7;
const TOKEN_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_LENGTH).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<{ id: string; name: string; email: string; avatarUrl: string | null } | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  return { id: session.user.id, name: session.user.name, email: session.user.email, avatarUrl: session.user.avatarUrl };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}
