#!/usr/bin/env tsx
import "load-env";
import pg from "pg";

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!rawUrl) throw new Error("POSTGRES_URL or DATABASE_URL required");
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  const rows = await client.query<{
    title: string;
    chunks: number;
    status: string;
  }>(`
    SELECT d.title, COUNT(c.id)::int AS chunks, d.status
    FROM atlas.knowledge_documents d
    LEFT JOIN atlas.knowledge_chunks c ON c.document_id = d.id
    WHERE d.status = 'approved'
    GROUP BY d.id, d.title, d.status
    ORDER BY d.title
  `);
  for (const r of rows.rows) {
    console.log(`${r.title} | status=${r.status} | chunks=${r.chunks}`);
  }
} finally {
  client.release();
  await pool.end();
}
