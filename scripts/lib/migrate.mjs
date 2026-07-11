// Shared, forward-only schema migrator used by BOTH deployment paths so they
// can never drift:
//   - self-hosted / dev / tests  -> runMigrations(pgliteAdapter(pglite))
//   - Vercel (Neon)              -> runMigrations(neonAdapter(sql))  [scripts/db-setup.mjs]
//
// Migrations live in db/migrations/NNN_name.sql and run once each, in filename
// order, tracked in a schema_migrations table. Applying is idempotent: already
// recorded migrations are skipped, so it is safe to run on every startup and to
// re-run by hand.
//
// Write each migration to be idempotent where practical (IF NOT EXISTS / IF
// EXISTS / guards). The Neon HTTP driver cannot wrap a multi-statement file in
// one transaction, so a migration that fails halfway is re-attempted from the
// top on the next run.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsUrl = new URL("../../db/migrations/", import.meta.url);

// Every *.sql file in db/migrations, sorted by name. The zero-padded numeric
// prefix makes lexicographic order the intended apply order. Each file's name
// (without .sql) is its version key.
export function loadMigrations() {
  const dir = fileURLToPath(migrationsUrl);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      version: file.replace(/\.sql$/, ""),
      sql: readFileSync(new URL(file, migrationsUrl), "utf8"),
    }));
}

// Split a SQL script into individual statements for the Neon HTTP driver, which
// rejects multi-statement strings. Semicolons inside line/block comments,
// single-quoted strings ('' escapes), and dollar-quoted blocks ($$...$$ /
// $tag$...$tag$, e.g. PL/pgSQL bodies) do NOT split. (Nested block comments are
// not handled — Postgres allows them but migrations should avoid them.)
export function splitStatements(script) {
  const statements = [];
  let current = "";
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    const pair = script.slice(i, i + 2);

    if (pair === "--") {
      const nl = script.indexOf("\n", i);
      const stop = nl === -1 ? script.length : nl;
      current += script.slice(i, stop);
      i = stop;
    } else if (pair === "/*") {
      const close = script.indexOf("*/", i + 2);
      const stop = close === -1 ? script.length : close + 2;
      current += script.slice(i, stop);
      i = stop;
    } else if (ch === "'") {
      const stop = singleQuoteEnd(script, i);
      current += script.slice(i, stop);
      i = stop;
    } else if (ch === "$") {
      const tag = dollarTag(script, i);
      if (tag) {
        const close = script.indexOf(tag, i + tag.length);
        const stop = close === -1 ? script.length : close + tag.length;
        current += script.slice(i, stop);
        i = stop;
      } else {
        current += ch;
        i += 1;
      }
    } else if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// script[start] === "'"; returns the index just past the closing quote.
function singleQuoteEnd(script, start) {
  let i = start + 1;
  while (i < script.length) {
    if (script[i] === "'") {
      if (script[i + 1] === "'") {
        i += 2; // doubled '' is an escaped quote, not a terminator
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return script.length;
}

// If a dollar-quote opener starts at `start`, return its tag (e.g. "$$" or
// "$body$"); otherwise null. Tags are $ + optional identifier + $.
function dollarTag(script, start) {
  const match = /^\$([A-Za-z_]\w*)?\$/.exec(script.slice(start));
  return match ? match[0] : null;
}

// Bookkeeping table for applied migrations. Created before anything else runs.
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

// Applies every not-yet-recorded migration in order and returns the versions
// that were applied this run (empty when already up to date). `adapter` is one
// of pgliteAdapter()/neonAdapter() below.
export async function runMigrations(adapter) {
  await adapter.query(MIGRATIONS_TABLE);
  const rows = await adapter.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.version));

  const pending = loadMigrations().filter((m) => !applied.has(m.version));
  for (const migration of pending) {
    await adapter.execScript(migration.sql);
    // ON CONFLICT keeps a second concurrent/manual run from erroring on the PK.
    await adapter.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [migration.version]
    );
  }
  return pending.map((m) => m.version);
}

// PGlite exposes a native multi-statement exec(), so migration files run whole.
export function pgliteAdapter(pglite) {
  return {
    async query(text, params = []) {
      const result = await pglite.query(text, params);
      return result.rows;
    },
    async execScript(script) {
      await pglite.exec(script);
    },
  };
}

// The Neon HTTP driver runs one statement per call and returns a rows array
// directly, so migration files are split first.
export function neonAdapter(sql) {
  return {
    async query(text, params = []) {
      return sql.query(text, params);
    },
    async execScript(script) {
      for (const statement of splitStatements(script)) {
        await sql.query(statement);
      }
    },
  };
}
