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
