import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../_auth.js";
import { db, isValidEmployeeId } from "../../_db.js";

// Optional datetime query param: null when absent, the normalized ISO string
// when parseable, undefined when present but invalid.
function parseDateParam(value: string | string[] | undefined): string | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const employee = req.query.employee;
  if (employee !== undefined && !isValidEmployeeId(employee)) {
    res.status(400).json({ error: "employee must be an integer employee ID" });
    return;
  }
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (from === undefined || to === undefined) {
    res.status(400).json({ error: "from/to must be valid datetimes" });
    return;
  }

  // Time filtering goes by shift start: from is inclusive, to is exclusive.
  const sql = db();
  try {
    const rows = await sql`
      SELECT s.id, s.employee_id::text AS "employeeId", e.name AS "employeeName",
             s.clock_in AS "clockIn", s.clock_out AS "clockOut"
      FROM shifts s JOIN employees e ON e.id = s.employee_id
      WHERE (${employee ?? null}::bigint IS NULL OR s.employee_id = ${employee ?? null}::bigint)
        AND (${from}::timestamptz IS NULL OR s.clock_in >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR s.clock_in < ${to}::timestamptz)
      ORDER BY s.clock_in DESC, s.id DESC
    `;
    res.status(200).json(rows);
  } catch (err) {
    // An employee filter past bigint range raises 22003; it can't match anyone.
    if ((err as { code?: string }).code === "22003") {
      res.status(400).json({ error: "employee must be an integer employee ID" });
      return;
    }
    throw err;
  }
}
