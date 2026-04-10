import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool } from "@/lib/passport/db";

export type GapRow = {
  id: string;
  gap_type:
    | "missing_evidence"
    | "trl_gap"
    | "sector_gap"
    | "certification_gap"
    | "conditions_mismatch";
  severity: "blocking" | "significant" | "minor";
  gap_description: string;
};

export type GapAnalysisOutput = {
  passport_id: string;
  gaps: GapRow[];
};

export const showGapAnalysisTool = createTool({
  description:
    "Display a GapAnalysisCard listing evidence gaps for a passport. " +
    "Each gap shows gap_type, severity (blocking/significant/minor), and description of what would close it.",
  inputSchema: z.object({
    passport_id: z
      .string()
      .describe("UUID of the passport to show gap analysis for"),
  }),
  execute: async ({ passport_id }): Promise<GapAnalysisOutput> => {
    const pool = getPassportPool();
    try {
      const result = await pool.query(
        `SELECT id, gap_type, severity, gap_description
         FROM atlas.passport_gaps
         WHERE evidence_passport_id = $1
         ORDER BY
           CASE severity
             WHEN 'blocking' THEN 1
             WHEN 'significant' THEN 2
             WHEN 'minor' THEN 3
           END`,
        [passport_id],
      );
      return { passport_id, gaps: result.rows as GapRow[] };
    } finally {
      await pool.end();
    }
  },
});
