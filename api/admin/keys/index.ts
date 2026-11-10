import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashApiKey, requireSession } from "../../_auth.js";
import { db } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const sql = db();

  if (req.method === "GET") {
    const keys = await sql`
      SELECT id, name, access, key_prefix AS prefix, created_at AS "createdAt"
      FROM api_keys ORDER BY created_at DESC, id DESC
    `;
    const sessions = await sql`
      SELECT id, name, created_at AS "createdAt"
      FROM admin_sessions ORDER BY created_at DESC, id DESC
    `;
    res.status(200).json({
      keys,
      sessions: sessions.map((s) => ({ ...s, current: Number(s.id) === auth.sessionId })),
    });
    return;
  }

  if (req.method === "POST") {
    const { name, access } = (req.body ?? {}) as { name?: unknown; access?: unknown };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName || trimmedName.length > 100) {
      res.status(400).json({ error: "Name is required (1-100 characters)" });
      return;
    }
    if (access !== "read" && access !== "full") {
      res.status(400).json({ error: "Access must be 'read' or 'full'" });
      return;
    }

    const key = "tc_" + randomBytes(32).toString("hex");
    const rows = await sql`
      INSERT INTO api_keys (name, key_hash, key_prefix, access)
      VALUES (${trimmedName}, ${hashApiKey(key)}, ${key.slice(0, 10)}, ${access})
      RETURNING id, name, access, key_prefix AS prefix, created_at AS "createdAt"
    `;
    res.status(201).json({ ...rows[0], key });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
