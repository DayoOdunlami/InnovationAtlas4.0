// Shared guard used by every `*.pg.test.ts` suite + the smoke tests.
//
// We need to distinguish three cases:
//
//   1. No POSTGRES_URL / DATABASE_URL set at all  -> skip DB-backed tests.
//   2. URL points at the `scripts/initial-env.ts` placeholder
//      (`postgres://your_username:your_password@localhost:5432/your_database_name`)
//      written during `pnpm install` in CI / dev bootstrap  -> skip too,
//      since no real server listens there and the connection would just
//      ECONNREFUSE.
//   3. URL looks like a real connection string                   -> run.
//
// Without (2), `lint_and_type_check` CI jobs that don't spin up a Postgres
// service still run every repository spec because `postinstall` creates
// a populated `.env`, and they fall over at the first query.
//
// The check is intentionally string-based so that the placeholder stays
// detectable even if future `.env.example` variants rename fields, as
// long as the "your_username" / "your_database_name" placeholders remain
// the canonical dev-scaffold tokens.

export function hasRealPostgresUrl(): boolean {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) return false;
  if (rawUrl.includes("your_username")) return false;
  if (rawUrl.includes("your_database_name")) return false;
  return true;
}
