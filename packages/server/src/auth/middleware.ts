import type { IncomingMessage, ServerResponse } from "http";
import { validateSession } from "./session";

export function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

export async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<{ id: string; name: string; email: string; avatarUrl: string | null } | null> {
  const token = extractToken(req);
  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Authentication required" }));
    return null;
  }
  const user = await validateSession(token);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or expired token" }));
    return null;
  }
  return user;
}
