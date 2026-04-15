#!/usr/bin/env tsx
/**
 * Delete all live_call matches, then run passport matching for every non-archived passport.
 * Usage: pnpm exec tsx scripts/trigger-matching-all.ts
 */
import "load-env";
import { getPassportPool } from "../src/lib/passport/pg-pool";
import { runPassportMatching } from "../src/lib/passport/matching";

async function main() {
  const pool = getPassportPool();
  const del = await pool.query(
    `DELETE FROM atlas.matches WHERE match_type = 'live_call'`,
  );
  console.log(`Deleted live_call match rows: ${del.rowCount ?? 0}`);

  const res = await pool.query<{ id: string }>(
    `SELECT id FROM atlas.passports WHERE is_archived IS NOT TRUE ORDER BY created_at`,
  );
  await pool.end();

  const ids = res.rows.map((r) => r.id);
  console.log(`Running matching for ${ids.length} passport(s)...\n`);

  for (const id of ids) {
    console.log(`--- Passport ${id} ---`);
    try {
      const out = await runPassportMatching(id);
      console.log(
        `  projects=${out.project_matches.length} live=${out.live_call_matches.length} total=${out.total_matches}`,
      );
    } catch (e) {
      console.error(`  FAILED: ${id}`, e);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
