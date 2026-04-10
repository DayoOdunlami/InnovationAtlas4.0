// import { Logger } from "drizzle-orm";
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
const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export const pgDb = drizzlePg(pool, {
  //   logger: new MyLogger(),
});
