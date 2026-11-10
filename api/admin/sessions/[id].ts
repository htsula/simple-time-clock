import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../../_auth.js";
import { db } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  const id = req.query.id;
  if (typeof id !== "string" || !/^[1-9]\d{0,8}$/.test(id)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (req.method === "PATCH") {
    const { name } = (req.body ?? {}) as { name?: unknown };
    if (typeof name !== "string") {
      res.status(400).json({ error: "Name must be a string (up to 100 characters)" });
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      res.status(400).json({ error: "Name must be at most 100 characters" });
      return;
    }
    // An empty name clears it back to unnamed.
    const newName = trimmedName === "" ? null : trimmedName;
    const sql = db();
    const rows = await sql`
      UPDATE admin_sessions SET name = ${newName} WHERE id = ${id}::int
      RETURNING id, name, created_at AS "createdAt"
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.status(200).json({ ...rows[0], current: Number(rows[0].id) === auth.sessionId });
    return;
  }

  if (req.method === "DELETE") {
    if (Number(id) === auth.sessionId) {
      res.status(400).json({ error: "Use Log out to end your own session" });
      return;
    }
    const sql = db();
    const rows = await sql`DELETE FROM admin_sessions WHERE id = ${id}::int RETURNING id`;
    if (rows.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
