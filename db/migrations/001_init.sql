-- Baseline schema. Written with IF NOT EXISTS so that databases created before
-- the migration system existed can adopt it safely: this migration re-runs
-- against them as a no-op, then gets recorded in schema_migrations.

CREATE TABLE IF NOT EXISTS employees (
  id       BIGINT PRIMARY KEY,
  name     TEXT NOT NULL,
  active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE -- the admin logs into /admin with their employee ID
);

-- At most one admin, enforced at the database level
CREATE UNIQUE INDEX IF NOT EXISTS employees_single_admin ON employees (is_admin) WHERE is_admin;

CREATE TABLE IF NOT EXISTS shifts (
  id          SERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in    TIMESTAMPTZ NOT NULL,
  clock_out   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shifts_employee_clock_in ON shifts (employee_id, clock_in DESC);

-- At most one open shift per employee, enforced at the database level
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_employee ON shifts (employee_id) WHERE clock_out IS NULL;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
