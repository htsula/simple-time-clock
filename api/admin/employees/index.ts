import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../_auth.js";
import { db, isValidEmployeeId } from "../../_db.js";

function randomEightDigitId(): string {
  // 10000000–99999999: always 8 digits, never a leading zero.
  return String(10_000_000 + Math.floor(Math.random() * 90_000_000));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;
  const sql = db();

  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, name, active, is_admin AS "isAdmin"
      FROM employees ORDER BY active DESC, name ASC
    `;
    res.status(200).json(rows);
    return;
  }

  if (req.method === "POST") {
    const { name, id } = (req.body ?? {}) as { name?: unknown; id?: unknown };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    // An explicit ID may be any integer; JSON numbers are accepted too.
    let requestedId: string | undefined;
    if (id !== undefined && id !== null && id !== "") {
      const asString = typeof id === "number" && Number.isInteger(id) ? String(id) : id;
      if (!isValidEmployeeId(asString)) {
        res.status(400).json({ error: "Employee ID must be an integer" });
        return;
      }
      requestedId = asString;
    }

    if (requestedId !== undefined) {
      try {
        // The first employee added while no admin exists becomes the admin.
        const rows = await sql`
          INSERT INTO employees (id, name, is_admin)
          VALUES (
            ${requestedId}::bigint, ${trimmedName},
            NOT EXISTS (SELECT 1 FROM employees WHERE is_admin)
          )
          RETURNING id, name, active, is_admin AS "isAdmin"
        `;
        res.status(201).json(rows[0]);
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          res.status(409).json({ error: `Employee ID ${requestedId} is already taken` });
        } else {
          throw err;
        }
      }
      return;
    }

    // No ID given: roll random 8-digit IDs until one is unused.
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = randomEightDigitId();
      const rows = await sql`
        INSERT INTO employees (id, name, is_admin)
        VALUES (
          ${candidate}::bigint, ${trimmedName},
          NOT EXISTS (SELECT 1 FROM employees WHERE is_admin)
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id, name, active, is_admin AS "isAdmin"
      `;
      if (rows.length > 0) {
        res.status(201).json(rows[0]);
        return;
      }
    }
    res.status(500).json({ error: "Could not generate an unused employee ID" });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
