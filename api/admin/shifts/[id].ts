import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../_auth.js";
import { db } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;

  const id = req.query.id;
  // Shift ids are int4 (SERIAL); an id past its max can't exist, and casting it
  // to ::int would raise a 22003 error, so treat out-of-range ids as not found.
  if (typeof id !== "string" || !/^\d+$/.test(id) || Number(id) > 2147483647) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  const sql = db();

  if (req.method === "PATCH") {
    const body = (req.body ?? {}) as { clockIn?: unknown; clockOut?: unknown };
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({ error: "Expected { clockIn?, clockOut? }" });
      return;
    }
    const hasClockIn = "clockIn" in body;
    const hasClockOut = "clockOut" in body;
    if (!hasClockIn && !hasClockOut) {
      res.status(400).json({ error: "Expected { clockIn?, clockOut? }" });
      return;
    }
    let patchedIn: Date | undefined;
    if (hasClockIn) {
      if (typeof body.clockIn !== "string" || Number.isNaN(Date.parse(body.clockIn))) {
        res.status(400).json({ error: "clockIn must be a valid datetime" });
        return;
      }
      patchedIn = new Date(body.clockIn);
    }
    // clockOut uses key-presence semantics: absent keeps the stored value,
    // an explicit null reopens the shift.
    let patchedOut: Date | null | undefined;
    if (hasClockOut) {
      if (body.clockOut === null) {
        patchedOut = null;
      } else if (typeof body.clockOut === "string" && !Number.isNaN(Date.parse(body.clockOut))) {
        patchedOut = new Date(body.clockOut);
      } else {
        res.status(400).json({ error: "clockOut must be a valid datetime or null" });
        return;
      }
    }

    const existing = await sql`
      SELECT clock_in AS "clockIn", clock_out AS "clockOut"
      FROM shifts WHERE id = ${id}::int
    `;
    if (existing.length === 0) {
      res.status(404).json({ error: "Shift not found" });
      return;
    }
    const clockIn = patchedIn ?? new Date(existing[0].clockIn);
    const clockOut =
      patchedOut !== undefined
        ? patchedOut
        : existing[0].clockOut === null
          ? null
          : new Date(existing[0].clockOut);
    if (clockOut !== null && clockOut.getTime() <= clockIn.getTime()) {
      res.status(400).json({ error: "Clock-out must be after clock-in" });
      return;
    }
    if (clockOut === null && clockIn.getTime() > Date.now()) {
      res.status(400).json({ error: "Clock-in cannot be in the future for an open shift" });
      return;
    }

    try {
      const rows = await sql`
        UPDATE shifts s
        SET clock_in = ${clockIn.toISOString()}::timestamptz,
            clock_out = ${clockOut === null ? null : clockOut.toISOString()}::timestamptz
        FROM employees e
        WHERE s.id = ${id}::int AND e.id = s.employee_id
        RETURNING s.id, s.employee_id::text AS "employeeId", e.name AS "employeeName",
                  s.clock_in AS "clockIn", s.clock_out AS "clockOut"
      `;
      // The shift can vanish between the SELECT above and this UPDATE.
      if (rows.length === 0) {
        res.status(404).json({ error: "Shift not found" });
        return;
      }
      res.status(200).json(rows[0]);
    } catch (err) {
      // Reopening can collide with the one-open-shift-per-employee index.
      if ((err as { code?: string }).code === "23505") {
        res.status(409).json({ error: "This employee already has an open shift" });
      } else {
        throw err;
      }
    }
    return;
  }

  if (req.method === "DELETE") {
    const rows = await sql`DELETE FROM shifts WHERE id = ${id}::int RETURNING id`;
    if (rows.length === 0) {
      res.status(404).json({ error: "Shift not found" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
