// API tests: run the real api/ handlers against an in-memory PGlite database
// through the same adapter used by the dev server and the Docker container.
//
//   npm test

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
// Importing this registers the .js→.ts resolve hook before any api/ imports.
import { createApiHandler } from "../scripts/lib/serve-api.mjs";

let pglite;
let server;
let base;
let token;

before(async () => {
  pglite = new PGlite();
  const handleApi = await createApiHandler(pglite);
  server = http.createServer(async (req, res) => {
    if (await handleApi(req, res)) return;
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pglite.close();
});

async function api(method, path, { auth, body } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

function shiftsPath(params = {}) {
  const query = new URLSearchParams(params).toString();
  return `/api/admin/shifts${query ? `?${query}` : ""}`;
}

async function plantShift(employeeId, clockIn, clockOut = null) {
  const result = await pglite.query(
    "INSERT INTO shifts (employee_id, clock_in, clock_out) VALUES ($1, $2, $3) RETURNING id",
    [employeeId, clockIn, clockOut]
  );
  return result.rows[0].id;
}

describe("auth", () => {
  const endpoints = [
    ["GET", "/api/admin/shifts"],
    ["PATCH", "/api/admin/shifts/1"],
    ["DELETE", "/api/admin/shifts/1"],
    ["GET", "/api/admin/reports?from=2026-01-01&to=2026-02-01"],
    ["GET", "/api/admin/keys"],
    ["POST", "/api/admin/keys"],
    ["PATCH", "/api/admin/keys/1"],
    ["DELETE", "/api/admin/keys/1"],
    ["DELETE", "/api/admin/sessions/1"],
    ["POST", "/api/admin/logout"],
  ];

  it("returns 401 without a token", async () => {
    for (const [method, path] of endpoints) {
      const res = await api(method, path);
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.equal(typeof res.body.error, "string");
    }
  });

  it("returns 401 with a bad token", async () => {
    for (const [method, path] of endpoints) {
      const res = await api(method, path, { auth: "not-a-real-token" });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });
});

describe("bootstrap: login, employees, clocking", () => {
  it("logs in on a fresh database and issues a token", async () => {
    const res = await api("POST", "/api/admin/login", { body: { employeeId: "42" } });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    token = res.body.token;
  });

  it("creates employees (first one becomes admin)", async () => {
    const alice = await api("POST", "/api/admin/employees", {
      auth: token,
      body: { name: "Alice", id: "1001" },
    });
    assert.equal(alice.status, 201);
    assert.equal(alice.body.isAdmin, true);
    for (const [name, id] of [["Bob", "1002"], ["Carol", "1003"], ["Dave", "1004"]]) {
      const res = await api("POST", "/api/admin/employees", { auth: token, body: { name, id } });
      assert.equal(res.status, 201);
      assert.equal(res.body.isAdmin, false);
    }
  });

  it("clock in/out produces a shift", async () => {
    const clockIn = await api("POST", "/api/clock", {
      body: { employeeId: "1001", action: "IN" },
    });
    assert.equal(clockIn.status, 200);
    assert.equal(clockIn.body.status, "IN");
    const clockOut = await api("POST", "/api/clock", {
      body: { employeeId: "1001", action: "OUT" },
    });
    assert.equal(clockOut.status, 200);
    assert.equal(clockOut.body.status, "OUT");

    const list = await api("GET", shiftsPath(), { auth: token });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    const shift = list.body[0];
    assert.equal(typeof shift.id, "number");
    assert.equal(shift.employeeId, "1001");
    assert.equal(shift.employeeName, "Alice");
    assert.ok(!Number.isNaN(Date.parse(shift.clockIn)));
    assert.ok(!Number.isNaN(Date.parse(shift.clockOut)));
  });
});

// Planted for the shift list/PATCH/DELETE groups below.
let aId; // Alice, closed
let bId; // Alice, closed
let cId; // Bob, open

describe("GET /api/admin/shifts", () => {
  before(async () => {
    await pglite.exec("DELETE FROM shifts");
    aId = await plantShift("1001", "2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z");
    bId = await plantShift("1001", "2026-01-02T10:00:00Z", "2026-01-02T11:30:00Z");
    cId = await plantShift("1002", "2026-01-03T10:00:00Z", null);
  });

  it("lists all shifts ordered clock_in DESC", async () => {
    const res = await api("GET", shiftsPath(), { auth: token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((s) => s.id), [cId, bId, aId]);
    assert.deepEqual(res.body.map((s) => s.employeeName), ["Bob", "Alice", "Alice"]);
    assert.equal(res.body[1].clockIn, "2026-01-02T10:00:00.000Z");
    assert.equal(res.body[1].clockOut, "2026-01-02T11:30:00.000Z");
  });

  it("returns null clockOut for an open shift", async () => {
    const res = await api("GET", shiftsPath(), { auth: token });
    assert.equal(res.body[0].id, cId);
    assert.equal(res.body[0].clockOut, null);
  });

  it("filters by employee", async () => {
    const res = await api("GET", shiftsPath({ employee: "1001" }), { auth: token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((s) => s.id), [bId, aId]);
  });

  it("treats from as inclusive of a shift starting exactly at it", async () => {
    const res = await api("GET", shiftsPath({ from: "2026-01-02T10:00:00.000Z" }), { auth: token });
    assert.deepEqual(res.body.map((s) => s.id), [cId, bId]);
  });

  it("treats to as exclusive of a shift starting exactly at it", async () => {
    const res = await api("GET", shiftsPath({ to: "2026-01-02T10:00:00.000Z" }), { auth: token });
    assert.deepEqual(res.body.map((s) => s.id), [aId]);
  });

  it("combines employee, from and to", async () => {
    const res = await api(
      "GET",
      shiftsPath({ employee: "1001", from: "2026-01-01T10:00:00Z", to: "2026-01-03T10:00:00Z" }),
      { auth: token }
    );
    assert.deepEqual(res.body.map((s) => s.id), [bId, aId]);
  });

  it("rejects bad query params", async () => {
    for (const params of [{ employee: "abc" }, { from: "garbage" }, { to: "garbage" }]) {
      const res = await api("GET", shiftsPath(params), { auth: token });
      assert.equal(res.status, 400, JSON.stringify(params));
      assert.equal(typeof res.body.error, "string");
    }
  });
});

describe("PATCH /api/admin/shifts/:id", () => {
  it("changes clockIn and keeps clockOut", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockIn: "2026-01-01T09:00:00Z" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      id: aId,
      employeeId: "1001",
      employeeName: "Alice",
      clockIn: "2026-01-01T09:00:00.000Z",
      clockOut: "2026-01-01T12:00:00.000Z",
    });
  });

  it("changes clockOut and keeps clockIn", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockOut: "2026-01-01T13:00:00Z" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.clockIn, "2026-01-01T09:00:00.000Z");
    assert.equal(res.body.clockOut, "2026-01-01T13:00:00.000Z");
  });

  it("reopens a shift with clockOut null", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockOut: null },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.clockOut, null);
  });

  it("returns 409 when reopening while the employee already has an open shift", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${bId}`, {
      auth: token,
      body: { clockOut: null },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "This employee already has an open shift");
  });

  it("closes the shift again", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockOut: "2026-01-01T12:00:00Z" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.clockOut, "2026-01-01T12:00:00.000Z");
  });

  it("rejects clockOut not strictly after clockIn", async () => {
    const equal = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockOut: "2026-01-01T09:00:00Z" },
    });
    assert.equal(equal.status, 400);
    const inAfterOut = await api("PATCH", `/api/admin/shifts/${aId}`, {
      auth: token,
      body: { clockIn: "2026-01-01T14:00:00Z" },
    });
    assert.equal(inAfterOut.status, 400);
  });

  it("rejects a body without clockIn or clockOut", async () => {
    const res = await api("PATCH", `/api/admin/shifts/${aId}`, { auth: token, body: {} });
    assert.equal(res.status, 400);
  });

  it("rejects unparseable datetimes", async () => {
    for (const body of [{ clockIn: "garbage" }, { clockOut: "garbage" }, { clockOut: 123 }]) {
      const res = await api("PATCH", `/api/admin/shifts/${aId}`, { auth: token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it("returns 404 for unknown or invalid ids", async () => {
    const unknown = await api("PATCH", "/api/admin/shifts/999999", {
      auth: token,
      body: { clockIn: "2026-01-01T09:00:00Z" },
    });
    assert.equal(unknown.status, 404);
    const invalid = await api("PATCH", "/api/admin/shifts/abc", {
      auth: token,
      body: { clockIn: "2026-01-01T09:00:00Z" },
    });
    assert.equal(invalid.status, 404);
  });
});

describe("DELETE /api/admin/shifts/:id", () => {
  it("deletes a shift", async () => {
    const res = await api("DELETE", `/api/admin/shifts/${bId}`, { auth: token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const list = await api("GET", shiftsPath(), { auth: token });
    assert.deepEqual(list.body.map((s) => s.id), [cId, aId]);
  });

  it("returns 404 for unknown or invalid ids", async () => {
    const gone = await api("DELETE", `/api/admin/shifts/${bId}`, { auth: token });
    assert.equal(gone.status, 404);
    const invalid = await api("DELETE", "/api/admin/shifts/abc", { auth: token });
    assert.equal(invalid.status, 404);
  });
});

describe("GET /api/admin/reports", () => {
  before(async () => {
    await pglite.exec("DELETE FROM shifts");
    // Dave's 2023 shift is outside every queried range but sets firstShiftYear.
    await plantShift("1004", "2023-05-10T09:00:00Z", "2023-05-10T17:00:00Z");
    await plantShift("1001", "2026-01-05T09:00:00Z", "2026-01-05T11:00:00Z"); // 7200s
    await plantShift("1001", "2026-01-06T09:00:00Z", "2026-01-06T10:30:00Z"); // 5400s
    await plantShift("1002", "2026-01-07T09:00:00Z", "2026-01-07T10:30:00Z"); // 5400s
    await plantShift("1003", "2026-01-08T12:00:00Z", "2026-01-08T13:30:00Z"); // 5400s
  });

  it("requires parseable from and to", async () => {
    for (const query of ["", "?from=2026-01-01T00:00:00Z", "?to=2026-02-01T00:00:00Z", "?from=2026-01-01T00:00:00Z&to=garbage"]) {
      const res = await api("GET", `/api/admin/reports${query}`, { auth: token });
      assert.equal(res.status, 400, query || "(no params)");
    }
  });

  it("computes totals and per-employee rows for the range", async () => {
    const res = await api(
      "GET",
      "/api/admin/reports?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z",
      { auth: token }
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      totalShifts: 4,
      totalSeconds: 23400,
      firstShiftYear: 2023, // earliest shift ever, even though outside the range
      employees: [
        { id: "1001", name: "Alice", shifts: 2, seconds: 12600 },
        // Bob and Carol tie on seconds; name ASC breaks the tie.
        { id: "1002", name: "Bob", shifts: 1, seconds: 5400 },
        { id: "1003", name: "Carol", shifts: 1, seconds: 5400 },
      ],
    });
  });

  it("counts an open shift's elapsed time so far", async () => {
    const openStart = Date.now() - 3600_000;
    await plantShift("1002", new Date(openStart).toISOString(), null);
    const to = new Date(Date.now() + 86400_000).toISOString();
    const res = await api(
      "GET",
      `/api/admin/reports?${new URLSearchParams({ from: "2026-01-01T00:00:00Z", to })}`,
      { auth: token }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.totalShifts, 5);
    assert.deepEqual(res.body.employees.map((e) => e.id), ["1001", "1002", "1003"]);
    const bob = res.body.employees[1];
    assert.equal(bob.shifts, 2);
    assert.ok(bob.seconds >= 9000 && bob.seconds <= 9060, `bob.seconds=${bob.seconds}`);
    assert.equal(res.body.totalSeconds, 12600 + 5400 + bob.seconds);
    assert.equal(res.body.firstShiftYear, 2023);
  });

  it("returns firstShiftYear null and no employees for an empty table", async () => {
    await pglite.exec("DELETE FROM shifts");
    const res = await api(
      "GET",
      "/api/admin/reports?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z",
      { auth: token }
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      totalShifts: 0,
      totalSeconds: 0,
      firstShiftYear: null,
      employees: [],
    });
  });
});

describe("API keys", () => {
  let fullKey;
  let readKey;
  let fullId;
  let readId;

  async function createKey(name, access) {
    return api("POST", "/api/admin/keys", { auth: token, body: { name, access } });
  }

  it("creates keys and returns the secret exactly once", async () => {
    const full = await createKey("  Full key  ", "full");
    assert.equal(full.status, 201);
    assert.equal(full.body.name, "Full key");
    assert.equal(full.body.access, "full");
    assert.match(full.body.key, /^tc_[0-9a-f]{64}$/);
    assert.equal(full.body.prefix, full.body.key.slice(0, 10));
    assert.equal(typeof full.body.id, "number");
    assert.ok(!Number.isNaN(Date.parse(full.body.createdAt)));
    fullKey = full.body.key;
    fullId = full.body.id;

    const read = await createKey("Read key", "read");
    assert.equal(read.status, 201);
    readKey = read.body.key;
    readId = read.body.id;
  });

  it("lists keys newest first without secrets", async () => {
    const res = await api("GET", "/api/admin/keys", { auth: token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.keys.map((k) => k.id), [readId, fullId]);
    for (const k of res.body.keys) {
      assert.deepEqual(Object.keys(k).sort(), ["access", "createdAt", "id", "name", "prefix"]);
    }
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(fullKey) && !text.includes(readKey));
    assert.ok(!text.includes("key_hash") && !text.includes(token));
    for (const s of res.body.sessions) {
      assert.deepEqual(Object.keys(s).sort(), ["createdAt", "current", "id"]);
    }
  });

  it("validates name and access", async () => {
    for (const body of [
      { access: "read" },
      { name: "   ", access: "read" },
      { name: "x".repeat(101), access: "read" },
      { name: 5, access: "read" },
      { name: "ok" },
      { name: "ok", access: "admin" },
    ]) {
      const res = await api("POST", "/api/admin/keys", { auth: token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(typeof res.body.error, "string");
    }
    const max = await createKey("x".repeat(100), "read");
    assert.equal(max.status, 201);
    await api("DELETE", `/api/admin/keys/${max.body.id}`, { auth: token });
  });

  it("renames a key but not its access", async () => {
    const res = await api("PATCH", `/api/admin/keys/${readId}`, {
      auth: token,
      body: { name: " Renamed ", access: "full" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Renamed");
    assert.equal(res.body.access, "read");
    assert.equal("key" in res.body, false);
    for (const body of [{}, { name: "" }, { name: "x".repeat(101) }]) {
      const bad = await api("PATCH", `/api/admin/keys/${readId}`, { auth: token, body });
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
  });

  it("returns 404 for unknown or invalid key ids", async () => {
    for (const id of ["999999", "abc"]) {
      const patch = await api("PATCH", `/api/admin/keys/${id}`, { auth: token, body: { name: "x" } });
      assert.equal(patch.status, 404, id);
      const del = await api("DELETE", `/api/admin/keys/${id}`, { auth: token });
      assert.equal(del.status, 404, id);
    }
  });

  it("lets a full-access key read and write", async () => {
    const list = await api("GET", "/api/admin/employees", { auth: fullKey });
    assert.equal(list.status, 200);
    const created = await api("POST", "/api/admin/employees", {
      auth: fullKey,
      body: { name: "Via key", id: "2001" },
    });
    assert.equal(created.status, 201);
    const patched = await api("PATCH", "/api/admin/employees/2001", {
      auth: fullKey,
      body: { active: false },
    });
    assert.equal(patched.status, 200);
    const deleted = await api("DELETE", "/api/admin/employees/2001", { auth: fullKey });
    assert.equal(deleted.status, 200);
  });

  it("lets a read-only key GET but refuses writes with 403", async () => {
    for (const path of [
      "/api/admin/employees",
      "/api/admin/shifts",
      "/api/admin/reports?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z",
    ]) {
      const res = await api("GET", path, { auth: readKey });
      assert.equal(res.status, 200, path);
    }
    const writes = [
      ["POST", "/api/admin/employees", { name: "Nope" }],
      ["PATCH", "/api/admin/employees/1002", { active: false }],
      ["DELETE", "/api/admin/employees/1002", undefined],
      ["PATCH", "/api/admin/shifts/1", { clockIn: "2026-01-01T09:00:00Z" }],
      ["DELETE", "/api/admin/shifts/1", undefined],
    ];
    for (const [method, path, body] of writes) {
      const res = await api(method, path, { auth: readKey, body });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(typeof res.body.error, "string");
    }
    const still = await api("GET", "/api/admin/employees", { auth: token });
    assert.ok(still.body.some((e) => e.id === "1002" && e.active));
  });

  it("refuses key and session management and logout to any API key", async () => {
    const routes = [
      ["GET", "/api/admin/keys"],
      ["POST", "/api/admin/keys", { name: "x", access: "read" }],
      ["PATCH", `/api/admin/keys/${fullId}`, { name: "x" }],
      ["DELETE", `/api/admin/keys/${fullId}`],
      ["DELETE", "/api/admin/sessions/999"],
      ["POST", "/api/admin/logout"],
    ];
    for (const key of [fullKey, readKey]) {
      for (const [method, path, body] of routes) {
        const res = await api(method, path, { auth: key, body });
        assert.equal(res.status, 403, `${method} ${path}`);
      }
    }
    const list = await api("GET", "/api/admin/keys", { auth: token });
    assert.equal(list.body.keys.length, 2); // nothing was created or deleted
  });

  it("rejects a deleted key with 401", async () => {
    const del = await api("DELETE", `/api/admin/keys/${fullId}`, { auth: token });
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { ok: true });
    const res = await api("GET", "/api/admin/employees", { auth: fullKey });
    assert.equal(res.status, 401);
    const del2 = await api("DELETE", `/api/admin/keys/${readId}`, { auth: token });
    assert.equal(del2.status, 200);
  });

  it("rejects an unknown tc_ key with 401", async () => {
    const res = await api("GET", "/api/admin/employees", { auth: "tc_" + "0".repeat(64) });
    assert.equal(res.status, 401);
  });
});

describe("admin sessions", () => {
  it("marks exactly the caller's session as current", async () => {
    const res = await api("GET", "/api/admin/keys", { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.filter((s) => s.current).length, 1);
  });

  it("shows a second login, revokes it, and refuses to revoke the caller", async () => {
    const before = await api("GET", "/api/admin/keys", { auth: token });
    const login = await api("POST", "/api/admin/login", { body: { employeeId: "1001" } });
    assert.equal(login.status, 200);
    const other = login.body.token;

    const after = await api("GET", "/api/admin/keys", { auth: token });
    assert.equal(after.body.sessions.length, before.body.sessions.length + 1);
    assert.equal(after.body.sessions.filter((s) => s.current).length, 1);
    const otherView = await api("GET", "/api/admin/keys", { auth: other });
    const otherCurrent = otherView.body.sessions.find((s) => s.current);
    const myCurrent = after.body.sessions.find((s) => s.current);
    assert.notEqual(otherCurrent.id, myCurrent.id);

    const own = await api("DELETE", `/api/admin/sessions/${myCurrent.id}`, { auth: token });
    assert.equal(own.status, 400);

    const revoked = await api("DELETE", `/api/admin/sessions/${otherCurrent.id}`, { auth: token });
    assert.equal(revoked.status, 200);
    assert.deepEqual(revoked.body, { ok: true });
    const dead = await api("GET", "/api/admin/employees", { auth: other });
    assert.equal(dead.status, 401);
    const alive = await api("GET", "/api/admin/employees", { auth: token });
    assert.equal(alive.status, 200);

    const again = await api("DELETE", `/api/admin/sessions/${otherCurrent.id}`, { auth: token });
    assert.equal(again.status, 404);
    const invalid = await api("DELETE", "/api/admin/sessions/abc", { auth: token });
    assert.equal(invalid.status, 404);
  });
});

// Runs last: exhausting the admin-login bucket (100/hour) would otherwise
// interfere with earlier suites that log in.
describe("rate limiting", () => {
  it("returns 429 once admin login exceeds 100 requests in the window", async () => {
    let sawLimit = false;
    for (let i = 0; i < 130 && !sawLimit; i++) {
      const res = await api("POST", "/api/admin/login", { body: { employeeId: "42" } });
      if (res.status === 429) {
        assert.equal(typeof res.body.error, "string");
        sawLimit = true;
      }
    }
    assert.ok(sawLimit, "expected a 429 within 130 login attempts");
  });
});
