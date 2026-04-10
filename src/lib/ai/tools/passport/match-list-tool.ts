import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool } from "@/lib/passport/db";

export type MatchRow = {
  id: string;
  match_score: number;
  match_summary: string | null;
  evidence_map: Record<string, unknown> | null;
  gaps: unknown[] | null;
  project_id: string;
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
      const result = await pool.query(
        `SELECT m.id, m.match_score, m.match_summary, m.evidence_map, m.gaps,
                p.id AS project_id, p.title, p.lead_funder, p.funding_amount
         FROM atlas.matches m
         JOIN atlas.projects p ON p.id = m.project_id
         WHERE m.passport_id = $1
         ORDER BY m.match_score DESC
         LIMIT $2`,
        [passport_id, limit ?? 5],
      );
      return { passport_id, matches: result.rows as MatchRow[] };
    } finally {
      await pool.end();
    }
  },
});
