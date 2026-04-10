import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import Anthropic from "@anthropic-ai/sdk";
import { getPassportPool } from "./db";
import type { PassportClaimRow } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export type MatchResult = {
  id: string;
  match_type: "project" | "live_call";
  match_score: number;
  match_summary: string;
  evidence_map: Record<string, unknown>;
  gaps: unknown[];
  gap_value_estimate: number | null;
  // project match
  project_id?: string;
  title?: string;
  lead_funder?: string | null;
  funding_amount?: number | null;
  // live call match
  live_call_id?: string;
  deadline?: string | null;
  status?: string | null;
};

export type MatchingOutput = {
  passport_id: string;
  project_matches: MatchResult[];
  live_call_matches: MatchResult[];
  total_matches: number;
  embedding_dims: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildEmbedText(claims: PassportClaimRow[]): string {
  return claims
    .map(
      (c) =>
        `[${c.claim_role} / ${c.claim_domain}] ${c.claim_text}` +
        (c.conditions ? ` (conditions: ${c.conditions})` : ""),
    )
    .join("\n");
}

// ── Match summary generation (single Claude call for all matches) ───────────

async function generateMatchSummaries(
  claims: PassportClaimRow[],
  projectMatches: RawProjectMatch[],
  liveCallMatches: RawLiveCallMatch[],
): Promise<{
  project: Record<
    string,
    { summary: string; evidence_map: Record<string, unknown>; gaps: unknown[] }
  >;
  live: Record<string, { summary: string; gaps: unknown[] }>;
}> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const claimsList = claims
    .map(
      (c, i) =>
        `${i + 1}. [${c.id.slice(0, 8)}] ${c.claim_domain}/${c.claim_role}: ${c.claim_text}`,
    )
    .join("\n");

  const projectList = projectMatches
    .map(
      (p) =>
        `- ID:${p.id.slice(0, 8)} | Score:${p.weighted_score.toFixed(3)} | "${p.title}" (${p.lead_funder ?? "unknown funder"}) | Abstract: ${(p.abstract ?? "").slice(0, 300)}`,
    )
    .join("\n");

  const liveList = liveCallMatches
    .map(
      (l) =>
        `- ID:${l.id.slice(0, 8)} | Score:${l.cosine_sim.toFixed(3)} | "${l.title}" (${l.funder ?? "unknown"}) | ${(l.description ?? "").slice(0, 200)}`,
    )
    .join("\n");

  const prompt = `You are analysing cross-sector innovation matches for a transport innovation passport.

PASSPORT CLAIMS:
${claimsList}

PROJECT MATCHES (from completed UK research grants):
${projectList}

LIVE FUNDING CALL MATCHES (open Horizon Europe calls):
${liveList}

For each project match (use the 8-char ID prefix), provide:
- summary: 1-2 sentence explanation of why this project matches the passport claims
- evidence_map: object mapping claim ID prefix to a short relevance note
- gaps: array of {gap_type, severity, gap_description} for anything the project doesn't address

For each live call match, provide:
- summary: 1-2 sentence explanation of relevance to the passport

Return ONLY valid JSON in this exact shape:
{
  "projects": {
    "<8-char-project-id>": {
      "summary": "...",
      "evidence_map": {"<8-char-claim-id>": "relevance note", ...},
      "gaps": [{"gap_type": "missing_evidence|trl_gap|sector_gap|certification_gap|conditions_mismatch", "severity": "blocking|significant|minor", "gap_description": "..."}]
    }
  },
  "live_calls": {
    "<8-char-live-call-id>": {"summary": "..."}
  }
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as {
      projects?: Record<
        string,
        {
          summary: string;
          evidence_map: Record<string, unknown>;
          gaps: unknown[];
        }
      >;
      live_calls?: Record<string, { summary: string }>;
    };

    // Map 8-char prefixes back to full IDs
    const projectResult: Record<
      string,
      {
        summary: string;
        evidence_map: Record<string, unknown>;
        gaps: unknown[];
      }
    > = {};
    for (const pm of projectMatches) {
      const prefix = pm.id.slice(0, 8);
      const data = parsed.projects?.[prefix];
      projectResult[pm.id] = {
        summary:
          data?.summary ??
          `Cross-sector match for "${pm.title}" (score: ${pm.weighted_score.toFixed(2)})`,
        evidence_map: data?.evidence_map ?? {},
        gaps: data?.gaps ?? [],
      };
    }

    const liveResult: Record<string, { summary: string; gaps: unknown[] }> = {};
    for (const lm of liveCallMatches) {
      const prefix = lm.id.slice(0, 8);
      const data = parsed.live_calls?.[prefix];
      liveResult[lm.id] = {
        summary:
          data?.summary ??
          `Open funding call matching your evidence profile (score: ${lm.cosine_sim.toFixed(2)})`,
        gaps: [],
      };
    }

    return { project: projectResult, live: liveResult };
  } catch {
    // Fallback: use default summaries
    const projectResult: Record<
      string,
      {
        summary: string;
        evidence_map: Record<string, unknown>;
        gaps: unknown[];
      }
    > = {};
    for (const pm of projectMatches) {
      projectResult[pm.id] = {
        summary: `Cross-sector match for "${pm.title}" with relevance score ${pm.weighted_score.toFixed(2)}.`,
        evidence_map: {},
        gaps: [],
      };
    }
    const liveResult: Record<string, { summary: string; gaps: unknown[] }> = {};
    for (const lm of liveCallMatches) {
      liveResult[lm.id] = {
        summary: `Open Horizon Europe call matching your innovation profile (cosine similarity: ${lm.cosine_sim.toFixed(2)}).`,
        gaps: [],
      };
    }
    return { project: projectResult, live: liveResult };
  }
}

// ── Raw DB result types ────────────────────────────────────────────────────

type RawProjectMatch = {
  id: string;
  title: string;
  lead_funder: string | null;
  funding_amount: number | null;
  abstract: string | null;
  transport_relevance_score: number | null;
  cosine_sim: number;
  weighted_score: number;
  outcomes_count: number;
};

type RawLiveCallMatch = {
  id: string;
  title: string;
  funder: string | null;
  funding_amount: string | null;
  description: string | null;
  deadline: string | null;
  status: string;
  cosine_sim: number;
};

// ── Main matching function ─────────────────────────────────────────────────

export async function runPassportMatching(
  passportId: string,
): Promise<MatchingOutput> {
  const pool = getPassportPool();

  try {
    // 1. Load claims
    const claimsResult = await pool.query<PassportClaimRow>(
      `SELECT id, passport_id, claim_role, claim_domain, claim_text, conditions,
              confidence_tier, confidence_reason, source_excerpt, source_document_id,
              verified_at::text, verified_by, rejected, user_note, created_at::text
       FROM atlas.passport_claims
       WHERE passport_id = $1 AND rejected = false
       ORDER BY claim_domain, created_at`,
      [passportId],
    );

    const claims = claimsResult.rows;

    if (claims.length === 0) {
      return {
        passport_id: passportId,
        project_matches: [],
        live_call_matches: [],
        total_matches: 0,
        embedding_dims: 0,
      };
    }

    // 2. Build and embed combined claim text
    const embedText = buildEmbedText(claims);
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: embedText,
    });

    const vectorStr = `[${embedding.join(",")}]`;

    // 3. Cosine similarity against atlas.projects
    //    Weighted score = cosine_sim * 0.6 + (transport_relevance_score / 100) * 0.3 + (has_outcomes) * 0.1
    const projectResult = await pool.query<RawProjectMatch>(
      `SELECT
         p.id,
         p.title,
         p.lead_funder,
         p.funding_amount,
         p.abstract,
         p.transport_relevance_score,
         (1 - (p.embedding <=> $1::vector))::float                              AS cosine_sim,
         ((1 - (p.embedding <=> $1::vector)) * 0.6
           + COALESCE(p.transport_relevance_score::float / 100.0, 0) * 0.3
           + LEAST(COUNT(po.id), 5)::float / 50.0 * 0.1
         )::float                                                                AS weighted_score,
         COUNT(po.id)::int                                                       AS outcomes_count
       FROM atlas.projects p
       LEFT JOIN atlas.project_outcomes po ON po.project_id = p.id
       WHERE p.embedding IS NOT NULL
       GROUP BY p.id
       ORDER BY weighted_score DESC
       LIMIT 10`,
      [vectorStr],
    );

    // 4. Cosine similarity against atlas.live_calls (open only)
    const liveResult = await pool.query<RawLiveCallMatch>(
      `SELECT
         lc.id,
         lc.title,
         lc.funder,
         lc.funding_amount::text,
         lc.description,
         lc.deadline::text,
         lc.status,
         (1 - (lc.embedding <=> $1::vector))::float AS cosine_sim
       FROM atlas.live_calls lc
       WHERE lc.embedding IS NOT NULL AND lc.status = 'open'
       ORDER BY cosine_sim DESC
       LIMIT 5`,
      [vectorStr],
    );

    const rawProjects = projectResult.rows;
    const rawLive = liveResult.rows;

    if (rawProjects.length === 0 && rawLive.length === 0) {
      return {
        passport_id: passportId,
        project_matches: [],
        live_call_matches: [],
        total_matches: 0,
        embedding_dims: embedding.length,
      };
    }

    // 5. Generate summaries and evidence maps (single Claude call)
    const summaries = await generateMatchSummaries(
      claims,
      rawProjects,
      rawLive,
    );

    // 6. Delete existing matches for this passport and re-write (fresh run)
    await pool.query(`DELETE FROM atlas.matches WHERE passport_id = $1`, [
      passportId,
    ]);

    // 7. Write project matches to atlas.matches
    const projectMatches: MatchResult[] = [];
    for (const pm of rawProjects) {
      const s = summaries.project[pm.id] ?? {
        summary: pm.title,
        evidence_map: {},
        gaps: [],
      };
      const gapValueEstimate = pm.funding_amount
        ? Number(pm.funding_amount)
        : null;

      const ins = await pool.query<{ id: string }>(
        `INSERT INTO atlas.matches
           (passport_id, project_id, match_score, match_summary,
            evidence_map, gaps, gap_value_estimate, match_type, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'project', now())
         RETURNING id`,
        [
          passportId,
          pm.id,
          pm.weighted_score,
          s.summary,
          JSON.stringify(s.evidence_map),
          JSON.stringify(s.gaps),
          gapValueEstimate,
        ],
      );

      projectMatches.push({
        id: ins.rows[0].id,
        match_type: "project",
        match_score: pm.weighted_score,
        match_summary: s.summary,
        evidence_map: s.evidence_map,
        gaps: s.gaps,
        gap_value_estimate: gapValueEstimate,
        project_id: pm.id,
        title: pm.title,
        lead_funder: pm.lead_funder,
        funding_amount: pm.funding_amount ? Number(pm.funding_amount) : null,
      });
    }

    // 8. Write live call matches
    const liveCallMatches: MatchResult[] = [];
    for (const lm of rawLive) {
      const s = summaries.live[lm.id] ?? { summary: lm.title, gaps: [] };

      const ins = await pool.query<{ id: string }>(
        `INSERT INTO atlas.matches
           (passport_id, live_call_id, match_score, match_summary,
            evidence_map, gaps, match_type, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'live_call', now())
         RETURNING id`,
        [
          passportId,
          lm.id,
          lm.cosine_sim,
          s.summary,
          JSON.stringify({}),
          JSON.stringify(s.gaps),
        ],
      );

      liveCallMatches.push({
        id: ins.rows[0].id,
        match_type: "live_call",
        match_score: lm.cosine_sim,
        match_summary: s.summary,
        evidence_map: {},
        gaps: s.gaps,
        gap_value_estimate: null,
        live_call_id: lm.id,
        title: lm.title,
        lead_funder: lm.funder,
        funding_amount: null,
        deadline: lm.deadline,
        status: lm.status,
      });
    }

    // 9. Bump passport updated_at
    await pool.query(
      `UPDATE atlas.passports SET updated_at = now() WHERE id = $1`,
      [passportId],
    );

    return {
      passport_id: passportId,
      project_matches: projectMatches,
      live_call_matches: liveCallMatches,
      total_matches: projectMatches.length + liveCallMatches.length,
      embedding_dims: embedding.length,
    };
  } finally {
    await pool.end();
  }
}
