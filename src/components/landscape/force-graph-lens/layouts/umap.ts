// ---------------------------------------------------------------------------
// umap — pin every node at its snapshot (viz_x, viz_y).
//
// The snapshot already carries UMAP-projected coordinates in the 0–100
// range (see `atlas.projects.viz_x/_y`). This layout re-centres them
// around (0, 0) and scales by `CFG.X_SCALE` so the canvas coordinate
// system matches the POC's (origin at scene centre, distances in "POC
// units").
//
// When a query is active (gravity-search returned `similarity`), the
// query anchor is pinned at the similarity-weighted centroid of the
// top-K nodes (plan §5, row 2). Without a query the anchor is not
// inserted — UMAP is pure snapshot geometry.
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

function zFor(n: LensNode, axis: LayoutOptions["zAxis"]): number {
  switch (axis ?? "flat") {
    case "flat":
      return 0;
    case "score":
      return ((n.score ?? 0.5) - 0.5) * CFG.Z_SCALE;
    case "time": {
      const y = n.start_year;
      if (!y) return 0;
      return ((y - 2006) / 20 - 0.5) * CFG.Z_SCALE;
    }
    case "funding": {
      const f = n.funding_amount;
      if (!f) return 0;
      return (Math.min(Math.log10(Math.max(f, 1)) / 8, 1) - 0.5) * CFG.Z_SCALE;
    }
  }
  return 0;
}

export function umapLayout(
  baseNodes: LensNode[],
  baseLinks: LensLink[],
  similarity: SimilarityMap | null,
  options: LayoutOptions = {},
): LayoutResult {
  const nodes: LensNode[] = baseNodes.map((n) => ({
    ...n,
    x: ((n.viz_x ?? 50) - 50) * CFG.X_SCALE,
    y: zFor(n, options.zAxis),
    z: ((n.viz_y ?? 50) - 50) * CFG.X_SCALE,
  }));

  if (similarity && similarity.size > 0) {
    // Weighted centroid of the top 80 matches — sorted by sim desc then
    // id asc for tie-break determinism.
    const ranked = [...nodes]
      .filter((n) => n.id !== QUERY_NODE_ID && similarity.has(n.id))
      .sort((a, b) => {
        const diff = (similarity.get(b.id) ?? 0) - (similarity.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        return a.id < b.id ? -1 : 1;
      })
      .slice(0, 80);

    let wx = 0;
    let wz = 0;
    let w = 0;
    for (const n of ranked) {
      const s = similarity.get(n.id) ?? 0;
      if (s <= 0) continue;
      wx += (n.x ?? 0) * s;
      wz += (n.z ?? 0) * s;
      w += s;
    }
    const anchor = buildQueryAnchor("query");
    if (w > 0) {
      anchor.x = wx / w;
      anchor.z = wz / w;
    } else {
      anchor.x = 0;
      anchor.z = 0;
    }
    nodes.unshift(anchor);
    return finaliseLayout(nodes, [
      ...baseLinks,
      ...buildQueryLinks(nodes, similarity),
    ]);
  }

  return finaliseLayout(nodes, baseLinks);
}
