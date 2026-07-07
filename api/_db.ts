import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | undefined;

// Used by scripts/dev-server.mjs to swap in a local PGlite-backed client.
export function setDbClient(override: NeonQueryFunction<false, false>): void {
  client = override;
}

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

// Employee IDs are BIGINT in Postgres; they are handled as strings in JS to
// avoid Number precision loss. Accepts any integer, per spec.
export function isValidEmployeeId(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+$/.test(value);
}
