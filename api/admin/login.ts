import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, isValidEmployeeId } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { employeeId } = (req.body ?? {}) as { employeeId?: unknown };
  const submitted =
    typeof employeeId === "number" && Number.isInteger(employeeId)
      ? String(employeeId)
      : employeeId;
  if (!isValidEmployeeId(submitted)) {
    res.status(401).json({ error: "Invalid employee ID" });
    return;
  }

  const sql = db();
  // Active status is ignored here so the owner can't lock themselves out.
  const rows = await sql`SELECT id FROM employees WHERE is_admin LIMIT 1`;

  // Bootstrap: while no admin exists (fresh database), any ID logs in — the
  // owner then adds themselves, and the first employee added becomes admin.
  if (rows.length > 0 && BigInt(String(rows[0].id)) !== BigInt(submitted)) {
    res.status(401).json({ error: "Invalid employee ID" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO admin_sessions (token) VALUES (${token})`;
  res.status(200).json({ token });
}
