// Migration-runner tests: the SQL splitter used for the Neon path, plus
// applying migrations against a fresh and a pre-existing PGlite database.
//
//   npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  runMigrations,
  pgliteAdapter,
  loadMigrations,
  splitStatements,
} from "../scripts/lib/migrate.mjs";

describe("splitStatements", () => {
  it("splits top-level statements", () => {
    assert.deepEqual(splitStatements("SELECT 1; SELECT 2;"), ["SELECT 1", "SELECT 2"]);
  });

  it("does not split on semicolons inside strings", () => {
    assert.deepEqual(splitStatements("SELECT 'a;b'; SELECT 2"), ["SELECT 'a;b'", "SELECT 2"]);
    assert.deepEqual(splitStatements("SELECT 'it''s; fine'; SELECT 2"), [
      "SELECT 'it''s; fine'",
      "SELECT 2",
    ]);
  });

  it("does not split on semicolons inside comments", () => {
    assert.equal(splitStatements("-- c;omment\nSELECT 1;").length, 1);
    assert.equal(splitStatements("/* a; b */ SELECT 1;").length, 1);
  });

  it("does not split inside dollar-quoted function bodies", () => {
    const fn =
      "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;\nSELECT 1;";
    assert.equal(splitStatements(fn).length, 2);
  });
});

describe("runMigrations (PGlite)", () => {
  it("applies every migration once and is idempotent on re-run", async () => {
    const pglite = new PGlite();
    const versions = loadMigrations().map((m) => m.version);

    const first = await runMigrations(pgliteAdapter(pglite));
    assert.deepEqual(first, versions);
    assert.ok(first.includes("001_init"));

    // The resulting schema is usable and every migration is recorded.
    await pglite.query("INSERT INTO employees (id, name, is_admin) VALUES (1, 'A', true)");
    const counted = await pglite.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.equal(counted.rows[0].n, versions.length);

    const second = await runMigrations(pgliteAdapter(pglite));
    assert.deepEqual(second, []);
    await pglite.close();
  });

  it("adopts a pre-migration database without dropping data", async () => {
    const pglite = new PGlite();
    // Simulate a database created by the old schema.sql: tables exist, but the
    // schema_migrations table does not.
    await pglite.exec(loadMigrations()[0].sql);
    await pglite.query("INSERT INTO employees (id, name, is_admin) VALUES (7, 'Existing', true)");

    const applied = await runMigrations(pgliteAdapter(pglite));
    assert.ok(applied.includes("001_init")); // recorded even though the tables were already there

    const rows = await pglite.query("SELECT name FROM employees WHERE id = 7");
    assert.equal(rows.rows[0].name, "Existing"); // existing data survives
    await pglite.close();
  });
});
