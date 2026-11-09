import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../../_auth.js";
import { db } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireSession(req, res))) return;

  const id = req.query.id;
  if (typeof id !== "string" || !/^[1-9]\d{0,8}$/.test(id)) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  const sql = db();

  if (req.method === "PATCH") {
    const { name } = (req.body ?? {}) as { name?: unknown };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName || trimmedName.length > 100) {
      res.status(400).json({ error: "Name is required (1-100 characters)" });
      return;
    }
    const rows = await sql`
      UPDATE api_keys SET name = ${trimmedName} WHERE id = ${id}::int
      RETURNING id, name, access, key_prefix AS prefix, created_at AS "createdAt"
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === "DELETE") {
    const rows = await sql`DELETE FROM api_keys WHERE id = ${id}::int RETURNING id`;
    if (rows.length === 0) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
