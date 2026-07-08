// Shared plumbing for running the real api/ handlers outside Vercel, against
// a PGlite database. Used by scripts/dev-server.mjs (in-memory, local dev) and
// server.mjs (persistent, standalone Docker container).
//
// IMPORTANT: importing this module registers a node:module resolve hook that
// remaps relative "./x.js" specifiers to "./x.ts" (the api/ files import each
// other with ".js" extensions per the Vercel/tsc convention, but Node's native
// type stripping needs the real ".ts" filenames). The api/ modules themselves
// are only imported lazily inside createApiHandler(), so the hook is always
// registered first.

import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const schemaPath = fileURLToPath(new URL("../../db/schema.sql", import.meta.url));

function normalizeValue(value) {
  return typeof value === "bigint" ? String(value) : value;
}

function normalizeError(err) {
  if (!err.code && /duplicate key value/.test(err.message ?? "")) {
    err.code = "23505";
  }
  return err;
}

// Shim matching the parts of neon()'s interface the api/ handlers use:
// tagged-template calls returning a row array.
export function makeSql(pglite) {
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

// Applies db/schema.sql (idempotent), injects a PGlite-backed client into
// api/_db.ts, loads the handlers, and returns `handleApi(req, res)`: an async
// function that serves matching /api/* routes and returns true, or returns
// false without touching the response when no route matches.
export async function createApiHandler(pglite) {
  await pglite.exec(readFileSync(schemaPath, "utf8"));

  const { setDbClient } = await import("../../api/_db.ts");
  setDbClient(makeSql(pglite));

  // --- route table -------------------------------------------------------
  const status = (await import("../../api/status.ts")).default;
  const clock = (await import("../../api/clock.ts")).default;
  const login = (await import("../../api/admin/login.ts")).default;
  const logout = (await import("../../api/admin/logout.ts")).default;
  const employees = (await import("../../api/admin/employees/index.ts")).default;
  const employeeById = (await import("../../api/admin/employees/[id].ts")).default;

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

  // --- minimal Vercel req/res adapter --------------------------------------
  return async function handleApi(req, res) {
    const url = new URL(req.url, "http://localhost");
    const found = route(url.pathname);
    if (!found) return false;

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
        return true;
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
    return true;
  };
}
