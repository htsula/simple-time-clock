import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, isValidEmployeeId } from "./_db.js";
import { rateLimit } from "./_rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!rateLimit(req, res, "employee-lookup", 1000)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { employeeId, action } = (req.body ?? {}) as {
    employeeId?: unknown;
    action?: unknown;
  };
  if (!isValidEmployeeId(employeeId) || (action !== "IN" && action !== "OUT")) {
    res.status(400).json({ error: "Expected { employeeId, action: 'IN' | 'OUT' }" });
    return;
  }

  const sql = db();
  const employee = await sql`
    SELECT id FROM employees WHERE id = ${employeeId}::bigint AND active
  `;
  if (employee.length === 0) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  if (action === "IN") {
    // The WHERE NOT EXISTS guard plus the unique partial index on open shifts
    // makes a duplicate clock-in impossible even under concurrent requests.
    let rows: Record<string, unknown>[];
    try {
      rows = await sql`
        INSERT INTO shifts (employee_id, clock_in)
        SELECT ${employeeId}::bigint, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM shifts
          WHERE employee_id = ${employeeId}::bigint AND clock_out IS NULL
        )
        RETURNING clock_in
      `;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") rows = [];
      else throw err;
    }
    if (rows.length === 0) {
      res.status(409).json({ error: "Already clocked in" });
      return;
    }
    res.status(200).json({ status: "IN", time: rows[0].clock_in });
  } else {
    const rows = await sql`
      UPDATE shifts SET clock_out = now()
      WHERE employee_id = ${employeeId}::bigint AND clock_out IS NULL
      RETURNING clock_out
    `;
    if (rows.length === 0) {
      res.status(409).json({ error: "Not clocked in" });
      return;
    }
    res.status(200).json({ status: "OUT", time: rows[0].clock_out });
  }
}
