import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool } from "@/lib/passport/db";

export type PassportListItem = {
  id: string;
  title: string | null;
  project_name: string | null;
  claim_count: number;
  verified_count: number;
  updated_at: string;
};

export type PassportListOutput = {
  passports: PassportListItem[];
};

export const listPassportsTool = createTool({
  description:
    "List all existing passports with their claim counts. " +
    "Call this after extractClaimsPreview to present the user with a numbered list " +
    "of passports to save their claims to. " +
    "Display as: 1. [project_name or title] — N claims (V verified)",
  inputSchema: z.object({}),
  execute: async (): Promise<PassportListOutput> => {
    const pool = getPassportPool();
    try {
      const result = await pool.query<PassportListItem>(
        `SELECT
           p.id,
           p.title,
           p.project_name,
           COUNT(pc.id) FILTER (WHERE pc.rejected = false)::int           AS claim_count,
           COUNT(pc.id) FILTER (WHERE pc.confidence_tier = 'verified'
                                  AND pc.rejected = false)::int           AS verified_count,
           p.updated_at::text
         FROM atlas.passports p
         LEFT JOIN atlas.passport_claims pc ON pc.passport_id = p.id
         WHERE COALESCE(p.is_archived, false) = false
         GROUP BY p.id
         ORDER BY p.updated_at DESC
         LIMIT 20`,
      );
      return { passports: result.rows };
    } finally {
      await pool.end();
    }
  },
});
