-- API keys for programmatic access to the admin API. Only the SHA-256 hash of
-- a key is stored; the full key is shown once, when it is created.
CREATE TABLE IF NOT EXISTS api_keys (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  key_hash   TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  access     TEXT NOT NULL CHECK (access IN ('read', 'full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Non-secret session identifier so sessions can be listed and revoked without
-- exposing their tokens. Existing rows are backfilled from the new sequence.
ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS id SERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_id_key ON admin_sessions (id);
