// Local API server for development/testing without a Vercel account or Neon
// database. Runs the real handlers from api/ against an in-memory Postgres
// (PGlite). Data resets when the process exits.
//
//   npm run dev:api   (then `npm run dev` in another terminal; Vite proxies /api here)

import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";

// The api/ files import each other as "./_db.js" (Vercel/tsc convention), but
// Node's native type stripping needs the real ".ts" filenames — remap on miss.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      try {
        return nextResolve(specifier, context);
      } catch {
        return nextResolve(specifier.replace(/\.js$/, ".ts"), context);
      }
    }
    return nextResolve(specifier, context);
  },
});

// --- env ---------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
// --- database ----------------------------------------------------------
const pglite = new PGlite();
await pglite.exec(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));

function normalizeValue(value) {
  return typeof value === "bigint" ? String(value) : value;
}

function normalizeError(err) {
  if (!err.code && /duplicate key value/.test(err.message ?? "")) {
    err.code = "23505";
  }
  return err;
}

async function runQuery(text, params = []) {
  try {
    const result = await pglite.query(text, params);
    return result.rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalizeValue(v)]))
    );
  } catch (err) {
    throw normalizeError(err);
  }
}

// Shim matching the parts of neon()'s interface the api/ handlers use:
// tagged-template calls returning a row array.
function makeSql() {
  const sql = (strings, ...params) => {
    const text = strings.reduce(
      (acc, part, i) => (i === 0 ? part : `${acc}$${i}${part}`),
      ""
    );
    return runQuery(text, params);
  };
  sql.query = runQuery;
  return sql;
}

const { setDbClient } = await import("../api/_db.ts");
setDbClient(makeSql());

// --- route table -------------------------------------------------------
const status = (await import("../api/status.ts")).default;
const clock = (await import("../api/clock.ts")).default;
const login = (await import("../api/admin/login.ts")).default;
const logout = (await import("../api/admin/logout.ts")).default;
const employees = (await import("../api/admin/employees/index.ts")).default;
const employeeById = (await import("../api/admin/employees/[id].ts")).default;

function route(pathname) {
  if (pathname === "/api/status") return { handler: status };
  if (pathname === "/api/clock") return { handler: clock };
  if (pathname === "/api/admin/login") return { handler: login };
  if (pathname === "/api/admin/logout") return { handler: logout };
  if (pathname === "/api/admin/employees") return { handler: employees };
  const match = pathname.match(/^\/api\/admin\/employees\/([^/]+)$/);
  if (match) return { handler: employeeById, params: { id: decodeURIComponent(match[1]) } };
  return null;
}

// --- minimal Vercel req/res adapter -------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const found = route(url.pathname);
  if (!found) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  req.body = undefined;
  if (raw && /application\/json/.test(req.headers["content-type"] ?? "")) {
    try {
      req.body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }

  req.query = { ...Object.fromEntries(url.searchParams), ...found.params };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
    return res;
  };

  try {
    await found.handler(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

const port = Number(process.env.API_PORT ?? 3000);
server.listen(port, () => {
  console.log(`Local API (in-memory Postgres) on http://localhost:${port}`);
});
