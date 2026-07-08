// Local API server for development/testing without a Vercel account or Neon
// database. Runs the real handlers from api/ against an in-memory Postgres
// (PGlite). Data resets when the process exits.
//
//   npm run dev:api   (then `npm run dev` in another terminal; Vite proxies /api here)

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
// Importing this registers the .js→.ts resolve hook before any api/ imports.
import { createApiHandler } from "./lib/serve-api.mjs";

// --- env ---------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

// --- database + routes ---------------------------------------------------
const handleApi = await createApiHandler(new PGlite());

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const port = Number(process.env.API_PORT ?? 3000);
server.listen(port, () => {
  console.log(`Local API (in-memory Postgres) on http://localhost:${port}`);
});
