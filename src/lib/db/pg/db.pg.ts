// import { Logger } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// class MyLogger implements Logger {
//   logQuery(query: string, params: unknown[]): void {
//     console.log({ query, params });
//   }
// }

// Supabase pooler (port 6543) uses a self-signed cert chain. When pg receives
// sslmode=require from the connection string it sets rejectUnauthorized:true,
// overriding any Pool-level ssl option. Stripping that query param and passing
// ssl explicitly keeps the connection encrypted without the chain error.
//
// When POSTGRES_URL / DATABASE_URL is present we initialise eagerly at module
// load — this preserves the original Drizzle class identity (important for
// the drizzle migrator's internal instance checks) and matches how production
// and CI have always worked.
//
// When neither URL is present we fall back to a lazy Proxy that defers the
// "Missing database URL" throw until the first actual property access. This
// keeps unit tests that transitively import this module (but never touch the
// DB) from crashing at module-load in environments without Postgres.

function createPgDb(rawUrl: string): NodePgDatabase {
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  return drizzlePg(pool, {
    //   logger: new MyLogger(),
  });
}

function missingUrlError(): Error {
  return new Error(
    "Missing database URL: set POSTGRES_URL (preferred; see .env.example) or " +
      "DATABASE_URL. On Vercel, add it under Project → Settings → Environment Variables " +
      "and ensure it applies to the environments where the app builds.",
  );
}

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

export const pgDb: NodePgDatabase = rawUrl
  ? createPgDb(rawUrl)
  : (new Proxy({} as NodePgDatabase, {
      get(_target, _prop, _receiver) {
        throw missingUrlError();
      },
    }) as NodePgDatabase);
