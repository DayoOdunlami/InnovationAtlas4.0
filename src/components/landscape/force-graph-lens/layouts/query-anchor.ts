// ---------------------------------------------------------------------------
// query-anchor — build the synthetic query node + the similarity links
// that anchor nodes toward it.
//
// Verbatim from `docs/force-graph-lens-poc.html`: the query anchor is a
// small (`val: 6` / radius 6) node pinned at origin; link distance is
// proportional to `1 / max(similarity, 0.05)` and link strength is
// proportional to `similarity`, so strong matches tug hardest.
// ---------------------------------------------------------------------------

import { QUERY_NODE_ID, type LensLink, type LensNode, type SimilarityMap } from "../types";

export function buildQueryAnchor(queryText: string): LensNode {
  return {
    id: QUERY_NODE_ID,
    type: "query",
    title: queryText,
    viz_x: 50,
    viz_y: 50,
    score: 1,
    x: 0,
    y: 0,
    z: 0,
  };
}

/**
 * Build similarity links from the query anchor to every node in `nodes`
 * that has a similarity entry. Weak matches are kept as faint tether
 * lines so the POC's "gravity" metaphor still reads correctly.
 */
export function buildQueryLinks(
  nodes: LensNode[],
  similarity: SimilarityMap,
): LensLink[] {
  const out: LensLink[] = [];
  for (const n of nodes) {
    if (n.id === QUERY_NODE_ID) continue;
    const s = similarity.get(n.id);
    if (s === undefined) continue;
    out.push({
      source_id: QUERY_NODE_ID,
      target_id: n.id,
      edge_type: "query",
      weight: Math.max(0, Math.min(1, s)),
    });
  }
  return out;
}
