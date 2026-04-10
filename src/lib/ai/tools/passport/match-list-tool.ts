import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool } from "@/lib/passport/db";

export type MatchRow = {
  id: string;
  match_type?: "project" | "live_call";
  match_score: number;
  match_summary: string | null;
  evidence_map: Record<string, unknown> | null;
  gaps: unknown[] | null;
  // project match fields
  project_id?: string;
  // live call match fields
  live_call_id?: string;
  deadline?: string | null;
  status?: string | null;
  // shared
  title: string;
  lead_funder: string | null;
  funding_amount: number | null;
};

export type MatchListOutput = {
  passport_id: string;
  matches: MatchRow[];
};

export const showMatchListTool = createTool({
  description:
    "Display a MatchListCard showing the top cross-sector project matches for a passport. " +
    "Shows match_score, title, lead_funder, funding_amount, match_summary, and gap indicator.",
  inputSchema: z.object({
    passport_id: z
      .string()
      .describe("UUID of the passport to show matches for"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of top matches to show (default 5)"),
  }),
  execute: async ({ passport_id, limit }): Promise<MatchListOutput> => {
    const pool = getPassportPool();
    try {
      // Project matches
      const projRes = await pool.query(
        `SELECT m.id, 'project' AS match_type, m.match_score, m.match_summary,
                m.evidence_map, m.gaps,
                p.id AS project_id, p.title, p.lead_funder,
                p.funding_amount::float AS funding_amount,
                NULL AS live_call_id, NULL AS deadline, NULL AS status
         FROM atlas.matches m
         JOIN atlas.projects p ON p.id = m.project_id
         WHERE m.passport_id = $1 AND m.match_type = 'project'
         ORDER BY m.match_score DESC
         LIMIT $2`,
        [passport_id, limit ?? 5],
      );
      // Live call matches
      const liveRes = await pool.query(
        `SELECT m.id, 'live_call' AS match_type, m.match_score, m.match_summary,
                m.evidence_map, m.gaps,
                NULL AS project_id,
                lc.id AS live_call_id, lc.title, lc.funder AS lead_funder,
                NULL AS funding_amount,
                lc.deadline::text AS deadline, lc.status
         FROM atlas.matches m
         JOIN atlas.live_calls lc ON lc.id = m.live_call_id
         WHERE m.passport_id = $1 AND m.match_type = 'live_call'
         ORDER BY m.match_score DESC
         LIMIT 3`,
        [passport_id],
      );
      const matches = [
        ...(projRes.rows as MatchRow[]),
        ...(liveRes.rows as MatchRow[]),
      ].sort((a, b) => b.match_score - a.match_score);
      return { passport_id, matches };
    } finally {
      await pool.end();
    }
  },
});
