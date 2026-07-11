import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, isValidEmployeeId } from "./_db.js";
import { rateLimit } from "./_rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!rateLimit(req, res, "employee-lookup", 1000)) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const employeeId = req.query.employee;
  if (!isValidEmployeeId(employeeId)) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const sql = db();
  // Inactive employees respond exactly like nonexistent ones.
  const rows = await sql`
    SELECT e.name, s.clock_in, s.clock_out
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT clock_in, clock_out
      FROM shifts
      WHERE employee_id = e.id
      ORDER BY clock_in DESC
      LIMIT 1
    ) s ON true
    WHERE e.id = ${employeeId}::bigint AND e.active
  `;
  if (rows.length === 0) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const { name, clock_in, clock_out } = rows[0];
  const clockedIn = clock_in !== null && clock_out === null;
  res.status(200).json({
    name,
    status: clockedIn ? "IN" : "OUT",
    time: clockedIn ? clock_in : (clock_out ?? null),
  });
}
