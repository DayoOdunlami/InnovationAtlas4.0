/**
 * Shared Postgres pool for atlas.* (no "server-only" gate — safe for scripts + API).
 */
import pg from "pg";

export function getPassportPool() {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error(
      "Missing POSTGRES_URL or DATABASE_URL for passport database access",
    );
  }
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}
