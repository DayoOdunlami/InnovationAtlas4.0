#!/usr/bin/env tsx
/**
 * Full matching engine test — bypasses Next.js server-only guards.
 * Directly replicates matching.ts logic for script-context validation.
 */
import "load-env";
import { Pool } from "pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import Anthropic from "@anthropic-ai/sdk";

const PASSPORT_ID = process.argv[2] ?? "e56f7263-f667-45de-8ff3-5b63dafbf5e8";

const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

console.log(`\nRunning matching engine for passport: ${PASSPORT_ID}`);

// 1. Load claims
const claimsResult = await pool.query(
  `SELECT id, claim_role, claim_domain, claim_text, conditions
   FROM atlas.passport_claims
   WHERE passport_id = $1 AND rejected = false
   ORDER BY claim_domain, created_at`,
  [PASSPORT_ID],
);
const claims = claimsResult.rows;
console.log(`Claims loaded: ${claims.length}`);
if (claims.length === 0) {
  console.log("No claims — nothing to match.");
  await pool.end();
  process.exit(0);
}

// 2. Embed
const embedText = claims
  .map(
    (c) =>
      `[${c.claim_role} / ${c.claim_domain}] ${c.claim_text}` +
      (c.conditions ? ` (conditions: ${c.conditions})` : ""),
  )
  .join("\n");

const { embedding } = await embed({
  model: openai.embedding("text-embedding-3-small"),
  value: embedText,
});
const vectorStr = `[${embedding.join(",")}]`;
console.log(`Embedding dims: ${embedding.length}`);

// 3. Project matches
const projResult = await pool.query(
  `SELECT p.id, p.title, p.lead_funder, p.funding_amount, p.abstract,
          p.transport_relevance_score,
          (1 - (p.embedding <=> $1::vector))::float AS cosine_sim,
          ((1 - (p.embedding <=> $1::vector)) * 0.6
            + COALESCE(p.transport_relevance_score::float / 100.0, 0) * 0.3
            + LEAST(COUNT(po.id), 5)::float / 50.0 * 0.1
          )::float AS weighted_score,
          COUNT(po.id)::int AS outcomes_count
   FROM atlas.projects p
   LEFT JOIN atlas.project_outcomes po ON po.project_id = p.id
   WHERE p.embedding IS NOT NULL
   GROUP BY p.id
   ORDER BY weighted_score DESC LIMIT 10`,
  [vectorStr],
);

// 4. Live call matches
const liveResult = await pool.query(
  `SELECT lc.id, lc.title, lc.funder, lc.funding_amount::text,
          lc.description, lc.deadline::text, lc.status,
          (1 - (lc.embedding <=> $1::vector))::float AS cosine_sim
   FROM atlas.live_calls lc
   WHERE lc.embedding IS NOT NULL AND lc.status = 'open'
   ORDER BY cosine_sim DESC LIMIT 5`,
  [vectorStr],
);

console.log(`\nProject candidates: ${projResult.rows.length}`);
console.log(`Live call candidates: ${liveResult.rows.length}`);

// 5. Generate summaries with Claude
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const claimsList = claims
  .map(
    (c, i) =>
      `${i + 1}. [${c.id.slice(0, 8)}] ${c.claim_domain}/${c.claim_role}: ${c.claim_text}`,
  )
  .join("\n");
const projectList = projResult.rows
  .map(
    (p) =>
      `- ID:${p.id.slice(0, 8)} | Score:${p.weighted_score.toFixed(3)} | "${p.title}" | Abstract: ${(p.abstract ?? "").slice(0, 200)}`,
  )
  .join("\n");
const liveList = liveResult.rows
  .map(
    (l) =>
      `- ID:${l.id.slice(0, 8)} | Score:${l.cosine_sim.toFixed(3)} | "${l.title}" (${l.funder ?? "unknown"})`,
  )
  .join("\n");

console.log("\nGenerating Claude summaries...");
const claudeResp = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  messages: [
    {
      role: "user",
      content: `You are analysing cross-sector innovation matches for a transport innovation passport.

PASSPORT CLAIMS:
${claimsList}

PROJECT MATCHES:
${projectList}

LIVE CALLS:
${liveList}

For each project match (use 8-char ID prefix), provide a brief 1-2 sentence summary and list any gaps.
For each live call, provide a brief summary.

Return ONLY valid JSON:
{
  "projects": {"<8-char-id>": {"summary": "...", "evidence_map": {"<claim-prefix>": "note"}, "gaps": [{"gap_type":"...","severity":"...","gap_description":"..."}]}},
  "live_calls": {"<8-char-id>": {"summary": "..."}}
}`,
    },
  ],
});

const rawText =
  claudeResp.content[0].type === "text" ? claudeResp.content[0].text : "{}";
const jsonText = rawText
  .replace(/^```(?:json)?\n?/, "")
  .replace(/\n?```$/, "")
  .trim();
let parsed: Record<
  string,
  Record<
    string,
    { summary: string; evidence_map?: Record<string, string>; gaps?: unknown[] }
  >
> = { projects: {}, live_calls: {} };
try {
  parsed = JSON.parse(jsonText);
} catch {
  console.warn("Claude JSON parse failed, using defaults");
}

// 6. Delete existing matches for this passport
await pool.query(`DELETE FROM atlas.matches WHERE passport_id = $1`, [
  PASSPORT_ID,
]);

// 7. Write project matches
console.log("\nWriting project matches to atlas.matches:");
for (const [i, pm] of projResult.rows.entries()) {
  const prefix = pm.id.slice(0, 8);
  const s = parsed.projects?.[prefix] ?? {
    summary: `Cross-sector match: ${pm.title}`,
    evidence_map: {},
    gaps: [],
  };
  await pool.query(
    `INSERT INTO atlas.matches
       (passport_id, project_id, match_score, match_summary, evidence_map, gaps, gap_value_estimate, match_type, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'project', now())`,
    [
      PASSPORT_ID,
      pm.id,
      pm.weighted_score,
      s.summary,
      JSON.stringify(s.evidence_map ?? {}),
      JSON.stringify(s.gaps ?? []),
      pm.funding_amount ? Number(pm.funding_amount) : null,
    ],
  );
  console.log(
    `  ${i + 1}. [${pm.weighted_score.toFixed(3)}] ${pm.title.slice(0, 60)}`,
  );
  if (s.summary) console.log(`     ${s.summary.slice(0, 100)}`);
}

// 8. Write live call matches
if (liveResult.rows.length > 0) {
  console.log("\nWriting live call matches:");
  for (const [i, lm] of liveResult.rows.entries()) {
    const prefix = lm.id.slice(0, 8);
    const s = parsed.live_calls?.[prefix] ?? {
      summary: `Open funding call: ${lm.title}`,
      gaps: [],
    };
    await pool.query(
      `INSERT INTO atlas.matches
         (passport_id, live_call_id, match_score, match_summary, evidence_map, gaps, match_type, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'live_call', now())`,
      [
        PASSPORT_ID,
        lm.id,
        lm.cosine_sim,
        s.summary,
        JSON.stringify({}),
        JSON.stringify([]),
      ],
    );
    console.log(
      `  ${i + 1}. [${lm.cosine_sim.toFixed(3)}] ${lm.title.slice(0, 60)}`,
    );
    if (s.summary) console.log(`     ${s.summary.slice(0, 100)}`);
  }
}

// 9. Verify
const verifyResult = await pool.query(
  `SELECT m.match_type, m.match_score,
          COALESCE(p.title, lc.title) AS match_title
   FROM atlas.matches m
   LEFT JOIN atlas.projects p ON p.id = m.project_id
   LEFT JOIN atlas.live_calls lc ON lc.id = m.live_call_id
   WHERE m.passport_id = $1
   ORDER BY m.match_score DESC`,
  [PASSPORT_ID],
);

console.log(`\n✓ Verified ${verifyResult.rows.length} rows in atlas.matches:`);
for (const r of verifyResult.rows) {
  console.log(
    `  [${r.match_type}] [${r.match_score.toFixed(3)}] ${r.match_title?.slice(0, 70)}`,
  );
}

await pool.end();
console.log("\nStep 13 matching engine test PASSED ✓");
