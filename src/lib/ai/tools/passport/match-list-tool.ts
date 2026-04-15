import { getPassportPool } from "@/lib/passport/db";
import { tool as createTool } from "ai";
import { z } from "zod";

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
  source_url?: string | null;
  /** Pre-computed: true when match_type=live_call and status=open */
  isOpen?: boolean;
  // shared
  title: string;
  lead_funder: string | null;
  funding_amount: number | null;
};

export type MatchListOutput = {
  passport_id: string;
  matches: MatchRow[];
};

const MIN_SCORE = 0.25;

export const showMatchListInputSchema = z.object({
  passport_id: z.string().describe("UUID of the passport to show matches for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum total matches to return (default 10)"),
});

/**
 * 3-tier sort:
 *   Tier 0 — open live calls      (sorted by score desc)
 *   Tier 1 — closed/archived live calls (sorted by score desc)
 *   Tier 2 — project matches      (sorted by score desc)
 */
export function sortMatches(matches: MatchRow[]): MatchRow[] {
  const tier = (r: MatchRow): number => {
    if (r.match_type === "live_call" && r.status === "open") return 0;
    if (r.match_type === "live_call") return 1;
    return 2;
  };
  return matches.slice().sort((a, b) => {
    const tierDiff = tier(a) - tier(b);
    if (tierDiff !== 0) return tierDiff;
    return b.match_score - a.match_score;
  });
}

/** Shared by text chat tool and voice Realtime dispatcher. */
export async function runShowMatchListRunner(
  passportId: string,
  limit?: number,
): Promise<MatchListOutput> {
  const { passport_id, limit: resolvedLimit } = showMatchListInputSchema.parse({
    passport_id: passportId,
    limit: limit ?? 10,
  });

  console.log("[showMatchList] passportId received:", passport_id);

  const pool = getPassportPool();
  try {
    // Single UNION query — project matches + live call matches together.
    // • score threshold: ≥ 0.25 (removes low-quality noise)
    // • source_url: taken directly from atlas.projects or atlas.live_calls
    const result = await pool.query(
      `SELECT
         m.id,
         'project'::text            AS match_type,
         m.match_score::float,
         m.match_summary,
         m.evidence_map,
         m.gaps,
         p.id                       AS project_id,
         NULL::uuid                 AS live_call_id,
         p.title,
         p.lead_funder,
         p.funding_amount::float    AS funding_amount,
         NULL::text                 AS deadline,
         NULL::text                 AS status,
         COALESCE(
           p.source_url,
           CASE WHEN p.gtr_id IS NOT NULL
                THEN 'https://gtr.ukri.org/projects?ref=' || p.gtr_id
                ELSE NULL END
         )                          AS source_url
       FROM atlas.matches m
       JOIN atlas.projects p ON p.id = m.project_id
       WHERE m.passport_id = $1
         AND m.match_score >= $3

       UNION ALL

       SELECT
         m.id,
         'live_call'::text          AS match_type,
         m.match_score::float,
         m.match_summary,
         m.evidence_map,
         m.gaps,
         NULL::uuid                 AS project_id,
         lc.id                      AS live_call_id,
         lc.title,
         lc.funder                  AS lead_funder,
         NULL::float                AS funding_amount,
         lc.deadline::text          AS deadline,
         lc.status,
         lc.source_url
       FROM atlas.matches m
       JOIN atlas.live_calls lc ON lc.id = m.live_call_id
       WHERE m.passport_id = $1
         AND m.match_score >= $3`,
      [passport_id, resolvedLimit, MIN_SCORE],
    );

    const raw = result.rows as MatchRow[];
    const projectCount = raw.filter((r) => r.match_type === "project").length;
    const liveCount = raw.filter((r) => r.match_type === "live_call").length;
    console.log(
      "[showMatchList] project rows:",
      projectCount,
      "live rows:",
      liveCount,
    );

    const all = raw.map((r) => ({
      ...r,
      isOpen: r.match_type === "live_call" && r.status === "open",
    }));
    const matches = sortMatches(all).slice(0, resolvedLimit);

    return { passport_id, matches };
  } finally {
    await pool.end();
  }
}

export const showMatchListTool = createTool({
  description:
    "Display a MatchListCard showing cross-sector matches for a passport. " +
    "Shows OPEN live funding calls first (actionable NOW — with deadlines and Horizon Europe links), " +
    "then historical GtR project matches. " +
    "Includes match_score, title, funder, deadline, source_url, match_summary, and gap indicator. " +
    "Call this when the user asks 'what matches do I have?' or 'show my matches'.",
  inputSchema: showMatchListInputSchema,
  execute: async ({ passport_id, limit }): Promise<MatchListOutput> =>
    runShowMatchListRunner(passport_id, limit),
});
