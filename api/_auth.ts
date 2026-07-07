import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_db.js";

// Returns the validated token, or null after sending a 401 response.
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<string | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token) {
    const sql = db();
    const rows = await sql`SELECT token FROM admin_sessions WHERE token = ${token}`;
    if (rows.length > 0) return token;
  }
  res.status(401).json({ error: "Unauthorized" });
  return null;
}
