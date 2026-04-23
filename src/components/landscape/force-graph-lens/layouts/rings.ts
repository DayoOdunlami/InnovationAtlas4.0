// ---------------------------------------------------------------------------
// rings — rank-based concentric rings, top-K by similarity.
//
// Design (plan §5, row 3):
//   * top-`K` (default 120) nodes distributed across THREE rings by
//     rank, not by absolute similarity.
//   * Ring 0 (inner):  ranks 1..⌈K/3⌉   at radius CFG.MAX_R * 0.33
//   * Ring 1 (middle): next ⌈K/3⌉ ranks at radius CFG.MAX_R * 0.66
//   * Ring 2 (outer):  remaining        at radius CFG.MAX_R
//   * Nodes outside the top-K are pinned at their UMAP position and
//     dimmed by the renderer (grey backdrop).
//   * Query anchor is pinned at origin, small (`val: 6` in POC).
//
// Tie-break on id ASC so tests are deterministic.
// ---------------------------------------------------------------------------

import {
  CFG,
  QUERY_NODE_ID,
  type LayoutOptions,
  type LayoutResult,
  type LensLink,
  type LensNode,
  type SimilarityMap,
} from "../types";
import { buildQueryAnchor, buildQueryLinks } from "./query-anchor";
import { finaliseLayout } from "./finalise";

const RING_RADII_FACTORS = [0.33, 0.66, 1.0];

export function ringsLayout(
  baseNodes: LensNode[],
  baseLinks: LensLink[],
  similarity: SimilarityMap,
  queryText: string,
  options: LayoutOptions = {},
): LayoutResult {
  const K = options.topK ?? 120;
  const maxR = options.maxRadius ?? CFG.MAX_R;

  const ranked = [...baseNodes]
    .filter((n) => n.id !== QUERY_NODE_ID)
    .sort((a, b) => {
      const diff =
        (similarity.get(b.id) ?? 0) - (similarity.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return a.id < b.id ? -1 : 1;
    });

  const topK = ranked.slice(0, K);
  const rest = ranked.slice(K);

  const perRing = Math.max(1, Math.ceil(topK.length / 3));
  const placedTop: LensNode[] = topK.map((n, idx) => {
    const ring = Math.min(2, Math.floor(idx / perRing));
    const countThisRing = Math.min(
      perRing,
      topK.length - ring * perRing,
    );
    const posInRing = idx - ring * perRing;
    const angle = (posInRing / countThisRing) * Math.PI * 2;
    const radius = maxR * RING_RADII_FACTORS[ring];
    return {
      ...n,
      x: Math.cos(angle) * radius,
      y: n.type === "live_call" ? 30 : 0,
      z: Math.sin(angle) * radius,
    };
  });

  const placedRest: LensNode[] = rest.map((n) => ({
    ...n,
    x: ((n.viz_x ?? 50) - 50) * CFG.X_SCALE,
    y: 0,
    z: ((n.viz_y ?? 50) - 50) * CFG.X_SCALE,
  }));

  const anchor = buildQueryAnchor(queryText);
  const nodes = [anchor, ...placedTop, ...placedRest];

  const queryLinks = buildQueryLinks(nodes, similarity);
  return finaliseLayout(nodes, [...baseLinks, ...queryLinks]);
}
