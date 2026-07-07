import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_auth.js";
import { db } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = await requireAdmin(req, res);
  if (!token) return;

  const sql = db();
  await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
  res.status(200).json({ ok: true });
}
