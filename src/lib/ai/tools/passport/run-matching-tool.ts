import { runPassportMatching } from "@/lib/passport/matching";
import { tool as createTool } from "ai";
import { z } from "zod";
import type { MatchListOutput, MatchRow } from "./match-list-tool";
import { sortMatches } from "./match-list-tool";

/**
 * runMatchingTool — JARVIS tool that:
 *  1. Embeds all non-rejected claims for the given passport
 *  2. Runs pgvector cosine similarity against atlas.projects + atlas.live_calls
 *  3. Generates match_summary + evidence_map + gaps via Claude
 *  4. Writes results to atlas.matches
 *  5. Returns MatchListOutput (same shape as showMatchListTool) → renders MatchListCard
 *
 * JARVIS should call this automatically after saveClaimsToPassport or addEvidenceToPassport succeeds.
 */

export const runMatchingInputSchema = z.object({
  passport_id: z
    .string()
    .uuid()
    .describe("UUID of the passport to run matching for"),
});

/**
 * Shared by text chat tool and voice Realtime dispatcher.
 * Encapsulates runPassportMatching() + MatchingOutput → MatchListOutput conversion.
 * NOTE: This is a long-running operation (30-60 s) — embeddings + Claude + pgvector.
 */
export async function runMatchingRunner(
  passportId: string,
): Promise<MatchListOutput> {
  const { passport_id } = runMatchingInputSchema.parse({
    passport_id: passportId,
  });
  const result = await runPassportMatching(passport_id);

  const projectRows: MatchRow[] = result.project_matches.map((m) => ({
    id: m.id,
    match_type: "project" as const,
    match_score: m.match_score,
    match_summary: m.match_summary,
    evidence_map: m.evidence_map as Record<string, unknown>,
    gaps: m.gaps as unknown[],
    project_id: m.project_id,
    title: m.title ?? "",
    lead_funder: m.lead_funder ?? null,
    funding_amount: m.funding_amount ?? null,
    source_url: m.source_url ?? null,
  }));

  const liveRows: MatchRow[] = result.live_call_matches.map((m) => ({
    id: m.id,
    match_type: "live_call" as const,
    match_score: m.match_score,
    match_summary: m.match_summary,
    evidence_map: {},
    gaps: m.gaps as unknown[],
    live_call_id: m.live_call_id,
    title: m.title ?? "",
    lead_funder: m.lead_funder ?? null,
    funding_amount: null,
    deadline: m.deadline ?? null,
    status: m.status,
    source_url: m.source_url ?? null,
  }));

  // Open live calls first, then projects — both ordered by score within group
  const matches = sortMatches([...projectRows, ...liveRows]);

  return { passport_id, matches };
}

export const runMatchingTool = createTool({
  description:
    "Run the matching engine for a passport: embeds claims, finds top cross-sector " +
    "project matches (weighted by transport_relevance_score) and open Horizon Europe " +
    "live calls via pgvector similarity, generates summaries, and writes results to " +
    "atlas.matches. Returns a MatchListCard. " +
    "IMPORTANT: Call this automatically after every saveClaimsToPassport or addEvidenceToPassport completion.",
  inputSchema: runMatchingInputSchema,
  execute: async ({ passport_id }): Promise<MatchListOutput> =>
    runMatchingRunner(passport_id),
});
