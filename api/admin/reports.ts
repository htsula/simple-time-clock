import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_auth.js";
import { db } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { from, to } = req.query;
  if (
    typeof from !== "string" || Number.isNaN(Date.parse(from)) ||
    typeof to !== "string" || Number.isNaN(Date.parse(to))
  ) {
    res.status(400).json({ error: "from and to must be valid datetimes" });
    return;
  }
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();

  const sql = db();
  // Range goes by shift start (from inclusive, to exclusive); open shifts
  // count their elapsed time so far.
  const employees = await sql`
    SELECT e.id::text AS id, e.name, count(*)::int AS shifts,
           floor(sum(extract(epoch FROM COALESCE(s.clock_out, now()) - s.clock_in)))::int AS seconds
    FROM shifts s JOIN employees e ON e.id = s.employee_id
    WHERE s.clock_in >= ${fromIso}::timestamptz AND s.clock_in < ${toIso}::timestamptz
    GROUP BY e.id, e.name
    ORDER BY seconds DESC, e.name ASC
  `;
  // Over all shifts ever, not just the requested range; null on an empty table.
  const first = await sql`
    SELECT extract(year FROM min(clock_in))::int AS year FROM shifts
  `;

  res.status(200).json({
    totalShifts: employees.reduce((sum, e) => sum + e.shifts, 0),
    totalSeconds: employees.reduce((sum, e) => sum + e.seconds, 0),
    firstShiftYear: first[0].year,
    employees,
  });
}
