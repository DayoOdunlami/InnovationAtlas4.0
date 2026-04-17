import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool } from "@/lib/passport/db";

export type ConsortiumPartner = {
  name: string;
  project_count: number;
  total_funding: number | null;
  sectors: string[];
  most_recent_project_title: string | null;
  most_recent_funder: string | null;
  companies_house_status: string | null;
  sic_codes: string[] | null;
};

export type ConsortiumPartnersOutput = {
  query: string;
  sector?: string;
  partners: ConsortiumPartner[];
  total_organisations: number;
};

export const findConsortiumPartnersTool = createTool({
  description:
    "Find organisations that have led funded innovation projects in a specific technology domain or sector. " +
    "Use this when the user asks about consortium partners, who to work with, which organisations are active " +
    "in a technology area, or who has been funded to work on similar challenges. " +
    "Returns organisations with their grant history, sector focus, and funding track record.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Natural language description of the technology area or challenge",
      ),
    sector: z
      .enum(["rail", "aviation", "maritime", "highways", "built_environment"])
      .optional()
      .describe(
        "Optional filter: rail, aviation, maritime, highways, built_environment",
      ),
    min_projects: z
      .number()
      .optional()
      .default(1)
      .describe("Optional minimum projects led, default 1"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum results to return, default 10, max 20"),
  }),
  execute: async ({
    query,
    sector,
    min_projects = 1,
    limit = 10,
  }): Promise<ConsortiumPartnersOutput> => {
    const pool = getPassportPool();
    try {
      const safeLimit = Math.min(limit ?? 10, 20);
      const keywords = query
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);
      const likePatterns = keywords.map((k) => `%${k}%`);

      // Build keyword conditions for abstract and research_topics
      const keywordConditions =
        likePatterns.length > 0
          ? likePatterns
              .map(
                (_, i) =>
                  `(p.abstract ILIKE $${i + 1} OR p.research_topics::text ILIKE $${i + 1})`,
              )
              .join(" OR ")
          : "TRUE";

      const params: (string | number)[] = [...likePatterns];

      let sectorCondition = "";
      if (sector) {
        params.push(`%${sector}%`);
        sectorCondition = `AND p.research_topics::text ILIKE $${params.length}`;
      }

      params.push(min_projects);
      const minProjectsIdx = params.length;

      params.push(safeLimit);
      const limitIdx = params.length;

      const sql = `
        SELECT
          p.lead_org_name                                              AS name,
          COUNT(p.id)::int                                            AS project_count,
          SUM(p.funding_amount)                                       AS total_funding,
          ARRAY_AGG(DISTINCT elem)
            FILTER (WHERE elem IS NOT NULL)                           AS sectors,
          (ARRAY_AGG(p.title ORDER BY p.start_date DESC NULLS LAST))[1]
                                                                      AS most_recent_project_title,
          (ARRAY_AGG(p.lead_funder ORDER BY p.start_date DESC NULLS LAST))[1]
                                                                      AS most_recent_funder,
          NULL::text                                                AS companies_house_status,
          NULL::text[]                                              AS sic_codes
        FROM atlas.projects p
        LEFT JOIN LATERAL unnest(p.research_topics) AS elem ON TRUE
        WHERE p.lead_org_name IS NOT NULL
          AND (${keywordConditions})
          ${sectorCondition}
        GROUP BY p.lead_org_name
        HAVING COUNT(p.id) >= $${minProjectsIdx}
        ORDER BY COUNT(p.id) DESC, SUM(p.funding_amount) DESC NULLS LAST
        LIMIT $${limitIdx}
      `;

      const result = await pool.query<ConsortiumPartner>(sql, params);

      return {
        query,
        sector,
        partners: result.rows,
        total_organisations: result.rowCount ?? 0,
      };
    } catch (err) {
      // Graceful degradation — if atlas.organisations doesn't exist yet, retry without join
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("organisations")) {
        return await _queryWithoutEnrichment(
          pool,
          query,
          sector,
          min_projects,
          Math.min(limit ?? 10, 20),
        );
      }
      throw err;
    } finally {
      await pool.end();
    }
  },
});

async function _queryWithoutEnrichment(
  pool: Awaited<ReturnType<typeof getPassportPool>>,
  query: string,
  sector: string | undefined,
  min_projects: number,
  safeLimit: number,
): Promise<ConsortiumPartnersOutput> {
  const keywords = query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
  const likePatterns = keywords.map((k) => `%${k}%`);

  const keywordConditions =
    likePatterns.length > 0
      ? likePatterns
          .map(
            (_, i) =>
              `(p.abstract ILIKE $${i + 1} OR p.research_topics::text ILIKE $${i + 1})`,
          )
          .join(" OR ")
      : "TRUE";

  const params: (string | number)[] = [...likePatterns];

  let sectorCondition = "";
  if (sector) {
    params.push(`%${sector}%`);
    sectorCondition = `AND p.research_topics::text ILIKE $${params.length}`;
  }

  params.push(min_projects);
  const minProjectsIdx = params.length;
  params.push(safeLimit);
  const limitIdx = params.length;

  const sql = `
    SELECT
      p.lead_org_name                                              AS name,
      COUNT(p.id)::int                                            AS project_count,
      SUM(p.funding_amount)                                       AS total_funding,
      ARRAY_AGG(DISTINCT elem) FILTER (WHERE elem IS NOT NULL)    AS sectors,
      (ARRAY_AGG(p.title ORDER BY p.start_date DESC NULLS LAST))[1]
                                                                  AS most_recent_project_title,
      (ARRAY_AGG(p.lead_funder ORDER BY p.start_date DESC NULLS LAST))[1]
                                                                  AS most_recent_funder,
      NULL::text                                                  AS companies_house_status,
      NULL::text[]                                                AS sic_codes
    FROM atlas.projects p
    LEFT JOIN LATERAL unnest(p.research_topics) AS elem ON TRUE
    WHERE p.lead_org_name IS NOT NULL
      AND (${keywordConditions})
      ${sectorCondition}
    GROUP BY p.lead_org_name
    HAVING COUNT(p.id) >= $${minProjectsIdx}
    ORDER BY COUNT(p.id) DESC, SUM(p.funding_amount) DESC NULLS LAST
    LIMIT $${limitIdx}
  `;

  const result = await pool.query<ConsortiumPartner>(sql, params);
  return {
    query,
    sector,
    partners: result.rows,
    total_organisations: result.rowCount ?? 0,
  };
}
