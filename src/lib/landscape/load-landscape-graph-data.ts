import type { Pool } from "pg";
import type {
  EdgeType,
  LandscapeData,
  LandscapeLink,
  LandscapeNode,
} from "./types";

type ProjectRow = {
  id: string;
  title: string | null;
  lead_funder: string | null;
  transport_relevance_score: string | number | null;
  viz_x: string | number | null;
  viz_y: string | number | null;
};

type LiveCallRow = {
  id: string;
  title: string | null;
  funder: string | null;
  deadline: string | null;
  status: string | null;
  source: string | null;
  viz_x: string | number | null;
  viz_y: string | number | null;
};

type ProjectEdgeRow = {
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: string | number | null;
};

type LiveCallEdgeRow = {
  live_call_id: string;
  project_id: string;
  similarity_score: string | number | null;
};

/**
 * Loads graph-shaped landscape data from atlas.* via Postgres (same DB as
 * `/api/landscape/data`). Supabase PostgREST does not expose `atlas`, so this
 * path is required for v2 and snapshot generation.
 */
export async function loadLandscapeGraphData(
  pool: Pool,
): Promise<LandscapeData> {
  const [projectsResult, liveCallsResult, edgesResult, liveEdgesResult] =
    await Promise.all([
      pool.query<ProjectRow>(
        `SELECT id::text, title, lead_funder, transport_relevance_score,
                viz_x, viz_y
         FROM atlas.projects
         WHERE viz_x IS NOT NULL AND viz_y IS NOT NULL
         ORDER BY transport_relevance_score DESC NULLS LAST`,
      ),
      pool.query<LiveCallRow>(
        `SELECT id::text, title, funder, deadline::text, status, source,
                viz_x, viz_y
         FROM atlas.live_calls
         WHERE embedding IS NOT NULL
           AND (relevance_tag IS NULL OR relevance_tag <> 'irrelevant')
           AND viz_x IS NOT NULL
           AND viz_y IS NOT NULL
         ORDER BY status ASC NULLS LAST, deadline ASC NULLS LAST
         LIMIT 200`,
      ),
      pool.query<ProjectEdgeRow>(
        `SELECT source_id::text, target_id::text, edge_type, weight
         FROM atlas.project_edges
         WHERE weight >= 0.7`,
      ),
      pool.query<LiveCallEdgeRow>(
        `SELECT live_call_id::text, project_id::text, similarity_score
         FROM atlas.live_call_edges
         WHERE similarity_score >= 0.35`,
      ),
    ]);

  const projects = projectsResult.rows;
  const liveCalls = liveCallsResult.rows;
  const edges = edgesResult.rows;
  const liveEdges = liveEdgesResult.rows;

  const nodes: LandscapeNode[] = [
    ...projects.map((p) => ({
      id: p.id,
      type: "project" as const,
      title: (p.title ?? "").substring(0, 80),
      lead_funder: p.lead_funder ?? undefined,
      score:
        p.transport_relevance_score != null
          ? Math.round(Number(p.transport_relevance_score) * 1000) / 1000
          : undefined,
      x: p.viz_x ? Math.round(Number(p.viz_x) * 100) / 100 : undefined,
      y: p.viz_y ? Math.round(Number(p.viz_y) * 100) / 100 : undefined,
    })),
    ...liveCalls.map((lc) => ({
      id: lc.id,
      type: "live_call" as const,
      title: lc.title ?? "",
      funder: lc.funder ?? undefined,
      deadline: lc.deadline ?? null,
      status: lc.status ?? undefined,
      source: lc.source ?? undefined,
      x: lc.viz_x ? Math.round(Number(lc.viz_x) * 100) / 100 : undefined,
      y: lc.viz_y ? Math.round(Number(lc.viz_y) * 100) / 100 : undefined,
    })),
  ];

  const links: LandscapeLink[] = [
    ...edges.map((e) => ({
      source_id: e.source_id,
      target_id: e.target_id,
      edge_type: e.edge_type as EdgeType,
      weight:
        e.weight != null
          ? Math.round(Number(e.weight) * 1000) / 1000
          : undefined,
    })),
    ...liveEdges.map((e) => ({
      source_id: e.live_call_id,
      target_id: e.project_id,
      edge_type: "live_match" as const,
      weight:
        e.similarity_score != null
          ? Math.round(Number(e.similarity_score) * 1000) / 1000
          : undefined,
    })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    links,
  };
}
