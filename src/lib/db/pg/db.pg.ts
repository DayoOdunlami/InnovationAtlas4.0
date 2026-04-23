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
// We lazy-initialise the Pool/Drizzle client so that merely importing this
// module (as many test files do transitively) does not throw when
// POSTGRES_URL is absent. The error is still raised — but only on first
// real DB access, which is exactly when it matters for runtime + E2E CI
// paths. Unit tests that guard themselves with `skipIf(!POSTGRES_URL)` or
// that never invoke a repository method remain unaffected.

let cachedDb: NodePgDatabase | null = null;

function createPgDb(): NodePgDatabase {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error(
      "Missing database URL: set POSTGRES_URL (preferred; see .env.example) or " +
        "DATABASE_URL. On Vercel, add it under Project → Settings → Environment Variables " +
        "and ensure it applies to the environments where the app builds.",
    );
  }
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  return drizzlePg(pool, {
    //   logger: new MyLogger(),
  });
}

function getDb(): NodePgDatabase {
  if (!cachedDb) {
    cachedDb = createPgDb();
  }
  return cachedDb;
}

export const pgDb: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, _receiver) {
    const db = getDb();
    const value = Reflect.get(db as object, prop);
    return typeof value === "function" ? value.bind(db) : value;
  },
}) as NodePgDatabase;
