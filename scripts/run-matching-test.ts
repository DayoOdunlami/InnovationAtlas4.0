#!/usr/bin/env tsx
/**
 * Run the full matching engine for a passport and print results.
 * Usage: pnpm tsx scripts/run-matching-test.ts [passport_id]
 */
import "load-env";
import { runPassportMatching } from "../src/lib/passport/matching";

const passportId = process.argv[2] ?? "e56f7263-f667-45de-8ff3-5b63dafbf5e8";

console.log(`\nRunning matching engine for passport: ${passportId}`);
console.log(
  "This will call OpenAI (embed) + Claude (summaries) + write to atlas.matches\n",
);

try {
  const result = await runPassportMatching(passportId);

  console.log(`\n✓ Matching complete`);
  console.log(`  Passport:          ${result.passport_id}`);
  console.log(`  Embedding dims:    ${result.embedding_dims}`);
  console.log(`  Project matches:   ${result.project_matches.length}`);
  console.log(`  Live call matches: ${result.live_call_matches.length}`);
  console.log(`  Total matches:     ${result.total_matches}`);

  console.log("\nTop project matches:");
  for (const [i, m] of result.project_matches.slice(0, 5).entries()) {
    console.log(
      `  ${i + 1}. [${m.match_score.toFixed(3)}] ${m.title?.slice(0, 70)} | ${m.lead_funder}`,
    );
    if (m.match_summary) {
      console.log(`     Summary: ${m.match_summary.slice(0, 120)}`);
    }
    if (Array.isArray(m.gaps) && m.gaps.length > 0) {
      console.log(`     Gaps: ${m.gaps.length}`);
    }
  }

  if (result.live_call_matches.length > 0) {
    console.log("\nLive call matches:");
    for (const [i, m] of result.live_call_matches.entries()) {
      console.log(
        `  ${i + 1}. [${m.match_score.toFixed(3)}] ${m.title?.slice(0, 70)}`,
      );
      if (m.match_summary) {
        console.log(`     Summary: ${m.match_summary.slice(0, 120)}`);
      }
    }
  }

  console.log(
    `\nAll ${result.total_matches} matches written to atlas.matches ✓`,
  );
} catch (err) {
  console.error("Matching failed:", err);
  process.exit(1);
}
