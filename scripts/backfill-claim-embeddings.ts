#!/usr/bin/env tsx
/**
 * backfill-claim-embeddings.ts
 *
 * Generates text-embedding-3-small embeddings for all atlas.passport_claims
 * rows where embedding IS NULL and updates them in place.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-claim-embeddings.ts
 *   pnpm tsx scripts/backfill-claim-embeddings.ts --passport 853a783d-f44e-49b6-95f8-c74da6670f27
 *
 * Options:
 *   --passport <uuid>   Restrict to a specific passport_id
 *   --dry-run           Print rows that need embedding without updating
 */
import "load-env";
import { Pool } from "pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

// ── Config ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 20; // rows fetched per loop iteration
const DELAY_MS = 50; // pause between OpenAI calls (avoid rate limits)

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const passportIdx = args.indexOf("--passport");
const passportId: string | null =
  passportIdx !== -1 ? (args[passportIdx + 1] ?? null) : null;
const dryRun = args.includes("--dry-run");

if (dryRun) {
  console.log("[dry-run] No updates will be written.\n");
}
if (passportId) {
  console.log(`Restricting to passport: ${passportId}\n`);
}

// ── DB connection ──────────────────────────────────────────────────────────

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("ERROR: POSTGRES_URL or DATABASE_URL not set.");
  process.exit(1);
}
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Count how many need embedding
  const countSql = passportId
    ? `SELECT COUNT(*)::int AS cnt
       FROM atlas.passport_claims
       WHERE embedding IS NULL AND passport_id = $1`
    : `SELECT COUNT(*)::int AS cnt
       FROM atlas.passport_claims
       WHERE embedding IS NULL`;

  const countRes = await pool.query<{ cnt: number }>(
    countSql,
    passportId ? [passportId] : [],
  );
  const total = countRes.rows[0].cnt;
  console.log(`Claims with embedding IS NULL: ${total}`);

  if (total === 0) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  if (dryRun) {
    const sampleSql = passportId
      ? `SELECT id, claim_text FROM atlas.passport_claims WHERE embedding IS NULL AND passport_id = $1 LIMIT 5`
      : `SELECT id, claim_text FROM atlas.passport_claims WHERE embedding IS NULL LIMIT 5`;
    const sample = await pool.query(sampleSql, passportId ? [passportId] : []);
    console.log("\nSample rows:");
    for (const r of sample.rows) {
      console.log(`  ${r.id}  "${r.claim_text.slice(0, 80)}..."`);
    }
    await pool.end();
    return;
  }

  // 2. Process in cursor-style batches (use id ordering for determinism)
  let lastId = "00000000-0000-0000-0000-000000000000";
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const fetchSql = passportId
    ? `SELECT id, claim_text
       FROM atlas.passport_claims
       WHERE embedding IS NULL AND passport_id = $1 AND id > $2
       ORDER BY id
       LIMIT $3`
    : `SELECT id, claim_text
       FROM atlas.passport_claims
       WHERE embedding IS NULL AND id > $1
       ORDER BY id
       LIMIT $2`;

  while (true) {
    const params = passportId
      ? [passportId, lastId, BATCH_SIZE]
      : [lastId, BATCH_SIZE];

    const rows = await pool.query<{ id: string; claim_text: string }>(
      fetchSql,
      params,
    );

    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      processed++;
      lastId = row.id;

      try {
        const { embedding } = await embed({
          model: openai.embedding("text-embedding-3-small"),
          value: row.claim_text,
        });
        const vectorLiteral = `[${embedding.join(",")}]`;
        await pool.query(
          `UPDATE atlas.passport_claims SET embedding = $1::vector WHERE id = $2`,
          [vectorLiteral, row.id],
        );
        succeeded++;
        if (processed % 10 === 0 || processed === total) {
          process.stdout.write(
            `\r  [${processed}/${total}] succeeded=${succeeded} failed=${failed}   `,
          );
        }
      } catch (err) {
        failed++;
        console.error(`\n  [WARN] failed to embed claim ${row.id}:`, err);
      }

      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  console.log(`\n\nBackfill complete.`);
  console.log(`  Total processed : ${processed}`);
  console.log(`  Succeeded       : ${succeeded}`);
  console.log(`  Failed          : ${failed}`);

  // 3. Verify
  const remainSql = passportId
    ? `SELECT COUNT(*)::int AS cnt FROM atlas.passport_claims WHERE embedding IS NULL AND passport_id = $1`
    : `SELECT COUNT(*)::int AS cnt FROM atlas.passport_claims WHERE embedding IS NULL`;
  const remain = await pool.query<{ cnt: number }>(
    remainSql,
    passportId ? [passportId] : [],
  );
  console.log(`  Still NULL      : ${remain.rows[0].cnt}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
