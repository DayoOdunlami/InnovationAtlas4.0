import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getPassportPool } from "@/lib/passport/db";

export type ProjectEdge = {
  source_id: string;
  target_id: string;
  weight: number;
  edge_type: string;
};

export type EdgesData = {
  edges: ProjectEdge[];
};

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPassportPool();
  try {
    // Layer 1 — sparse physics edges (top 2 per source, max 800 total)
    let layoutEdges: ProjectEdge[] = [];
    try {
      const layoutResult = await pool.query<ProjectEdge>(
        `WITH top_edges AS (
           SELECT
             source_id::text,
             target_id::text,
             weight,
             edge_type,
             ROW_NUMBER() OVER (
               PARTITION BY source_id ORDER BY weight DESC
             ) AS rn
           FROM atlas.project_edges
           WHERE edge_type IN ('shared_org', 'semantic')
         )
         SELECT source_id, target_id, weight, edge_type
         FROM top_edges
         WHERE rn <= 2
         LIMIT 800`,
      );
      layoutEdges = layoutResult.rows;
    } catch {
      layoutEdges = [];
    }

    // shared_topic — display-only (not used by force link simulation)
    let sharedTopicEdges: ProjectEdge[] = [];
    try {
      const stResult = await pool.query<ProjectEdge>(
        `SELECT source_id, target_id, weight, edge_type
         FROM atlas.project_edges
         WHERE edge_type = 'shared_topic' AND weight >= 0.6
         ORDER BY weight DESC
         LIMIT 8000`,
      );
      sharedTopicEdges = stResult.rows;
    } catch {
      sharedTopicEdges = [];
    }

    // Live-call-to-project edges (table may not exist yet)
    let liveCallEdges: ProjectEdge[] = [];
    try {
      const liveCallResult = await pool.query<ProjectEdge>(
        `SELECT
           live_call_id::text AS source_id,
           project_id::text   AS target_id,
           similarity_score   AS weight,
           'live_call'        AS edge_type
         FROM atlas.live_call_edges
         WHERE similarity_score > 0.6
         LIMIT 1000`,
      );
      liveCallEdges = liveCallResult.rows;
    } catch {
      // Table doesn't exist yet — safe to ignore
    }

    // Live-call-to-live-call edges (table may not exist yet)
    let callToCallEdges: ProjectEdge[] = [];
    try {
      const callToCallResult = await pool.query<ProjectEdge>(
        `SELECT
           source_call_id::text AS source_id,
           target_call_id::text AS target_id,
           similarity_score     AS weight,
           'live_call_similarity' AS edge_type
         FROM atlas.live_call_to_call_edges
         WHERE similarity_score > 0.75
         LIMIT 400`,
      );
      callToCallEdges = callToCallResult.rows;
    } catch {
      // Table doesn't exist yet — safe to ignore
    }

    return NextResponse.json({
      edges: [
        ...layoutEdges,
        ...sharedTopicEdges,
        ...liveCallEdges,
        ...callToCallEdges,
      ],
    } satisfies EdgesData);
  } catch {
    return NextResponse.json({ edges: [] } satisfies EdgesData);
  } finally {
    await pool.end();
  }
}
