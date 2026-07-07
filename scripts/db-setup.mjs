import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

// Load .env.local / .env if DATABASE_URL isn't already set (vercel env pull writes .env.local)
for (const file of [".env.local", ".env"]) {
  if (process.env.DATABASE_URL) break;
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"]+)"?\s*$/);
    if (match) process.env.DATABASE_URL = match[1];
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` or set it in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} statements from db/schema.sql`);
