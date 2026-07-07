import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../_auth.js";
import { db, isValidEmployeeId } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  const id = req.query.id;
  if (!isValidEmployeeId(id)) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const sql = db();

  if (req.method === "PATCH") {
    const { active } = (req.body ?? {}) as { active?: unknown };
    if (typeof active !== "boolean") {
      res.status(400).json({ error: "Expected { active: boolean }" });
      return;
    }
    const rows = await sql`
      UPDATE employees SET active = ${active} WHERE id = ${id}::bigint
      RETURNING id, name, active, is_admin AS "isAdmin"
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === "DELETE") {
    // The admin can't be deleted — otherwise no admin would exist and the
    // bootstrap rule would let anyone log in while employee data remains.
    const existing = await sql`
      SELECT is_admin FROM employees WHERE id = ${id}::bigint
    `;
    if (existing.length === 0) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    if (existing[0].is_admin) {
      res.status(409).json({ error: "The admin cannot be deleted" });
      return;
    }
    // ON DELETE CASCADE on shifts removes all of the employee's shift data.
    await sql`DELETE FROM employees WHERE id = ${id}::bigint`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
