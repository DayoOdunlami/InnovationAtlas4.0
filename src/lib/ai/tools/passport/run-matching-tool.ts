import { tool as createTool } from "ai";
import { z } from "zod";
import { runPassportMatching } from "@/lib/passport/matching";
import type { MatchListOutput, MatchRow } from "./match-list-tool";

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
export const runMatchingTool = createTool({
  description:
    "Run the matching engine for a passport: embeds claims, finds top cross-sector " +
    "project matches (weighted by transport_relevance_score) and open Horizon Europe " +
    "live calls via pgvector similarity, generates summaries, and writes results to " +
    "atlas.matches. Returns a MatchListCard. " +
    "IMPORTANT: Call this automatically after every saveClaimsToPassport or addEvidenceToPassport completion.",
  inputSchema: z.object({
    passport_id: z
      .string()
      .uuid()
      .describe("UUID of the passport to run matching for"),
  }),
  execute: async ({ passport_id }): Promise<MatchListOutput> => {
    const result = await runPassportMatching(passport_id);

    // Convert MatchingOutput → MatchListOutput (MatchListCard shape)
    const projectRows: MatchRow[] = result.project_matches.map((m) => ({
      id: m.id,
      match_type: "project",
      match_score: m.match_score,
      match_summary: m.match_summary,
      evidence_map: m.evidence_map as Record<string, unknown>,
      gaps: m.gaps as unknown[],
      project_id: m.project_id,
      title: m.title ?? "",
      lead_funder: m.lead_funder ?? null,
      funding_amount: m.funding_amount ?? null,
    }));

    const liveRows: MatchRow[] = result.live_call_matches.map((m) => ({
      id: m.id,
      match_type: "live_call",
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
    }));

    const matches = [...projectRows, ...liveRows].sort(
      (a, b) => b.match_score - a.match_score,
    );

    return { passport_id, matches };
  },
});
