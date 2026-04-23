// ---------------------------------------------------------------------------
// web — physics layout anchored at the query, distance ∝ 1/similarity.
//
// The web layout is intentionally target-position-only (not an iterative
// d3 simulation). It pre-computes a polar position for every node so the
// canvas renderer can animate from whatever its current positions are
// to the target set in one shot. This keeps the layout deterministic
// (so the unit tests pass) AND gives the 2D renderer a cheap integration
// path — it just lerps each node mesh's position toward the target.
//
// POC equivalent: the same angle-derived-from-UMAP placement used in
// `applyGravityLayout` in `docs/force-graph-lens-poc.html` (`radius =
// (1 - sim) * CFG.MAX_R`, `angle = atan2(viz_y - 50, viz_x - 50)`).
//
// If a node has no similarity entry it is placed on the outer-most
// shell. Query anchor is always at origin.
// ---------------------------------------------------------------------------

import {
  CFG,
  type LayoutOptions,
  type LayoutResult,
  type LensLink,
  type LensNode,
  type SimilarityMap,
} from "../types";
import { buildQueryAnchor, buildQueryLinks } from "./query-anchor";
import { finaliseLayout } from "./finalise";

export function webLayout(
  baseNodes: LensNode[],
  baseLinks: LensLink[],
  similarity: SimilarityMap,
  queryText: string,
  options: LayoutOptions = {},
): LayoutResult {
  const maxR = options.maxRadius ?? CFG.MAX_R;

  const nodes: LensNode[] = baseNodes.map((n) => {
    const sim = similarity.get(n.id) ?? 0;
    const safeSim = Math.max(0, Math.min(1, sim));
    const radius = (1 - safeSim) * maxR;
    const dx = (n.viz_x ?? 50) - 50;
    const dy = (n.viz_y ?? 50) - 50;
    const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = n.type === "live_call" ? 40 : 0;
    return { ...n, x, y, z };
  });

  const anchor = buildQueryAnchor(queryText);
  nodes.unshift(anchor);

  const queryLinks = buildQueryLinks(nodes, similarity);
  return finaliseLayout(nodes, [...baseLinks, ...queryLinks]);
}
