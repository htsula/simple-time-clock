import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_db.js";

export type AdminAuth =
  | { kind: "session"; token: string; sessionId: number }
  | { kind: "key"; keyId: number; access: "read" | "full" };

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Returns who is calling, or null after sending a 401 (unknown credentials) or
// 403 (read-only API key used for anything but GET/HEAD) response.
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<AdminAuth | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token) {
    const sql = db();
    if (token.startsWith("tc_")) {
      const rows = await sql`
        SELECT id, access FROM api_keys WHERE key_hash = ${hashApiKey(token)}
      `;
      if (rows.length > 0) {
        const access = rows[0].access === "full" ? "full" : "read";
        if (access === "read" && req.method !== "GET" && req.method !== "HEAD") {
          res.status(403).json({ error: "This API key is read only" });
          return null;
        }
        return { kind: "key", keyId: Number(rows[0].id), access };
      }
    } else {
      const rows = await sql`SELECT id FROM admin_sessions WHERE token = ${token}`;
      if (rows.length > 0) {
        return { kind: "session", token, sessionId: Number(rows[0].id) };
      }
    }
  }
  res.status(401).json({ error: "Unauthorized" });
  return null;
}

// Like requireAdmin, but only an admin login session is accepted. API keys of
// any access level get a 403. Used for logout and key/session management.
export async function requireSession(
  req: VercelRequest,
  res: VercelResponse
): Promise<Extract<AdminAuth, { kind: "session" }> | null> {
  const auth = await requireAdmin(req, res);
  if (!auth) return null;
  if (auth.kind !== "session") {
    res.status(403).json({ error: "This action requires an admin login session" });
    return null;
  }
  return auth;
}
