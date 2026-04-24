// ---------------------------------------------------------------------------
// Phase 3b — Force-graph lens shared types.
//
// The lens consumes two upstream payloads:
//
//   1. `LandscapeGraph` — the canonical node/link set. Comes from
//      `/api/landscape/data` (projects + live calls + organisations) and
//      is normalised to a `LensNode` shape that matches the v2 POC's
//      working vocabulary (id, type, viz_x, viz_y, score, …).
//   2. `SimilarityMap` — a Map<id, number> computed from
//      `/api/landscape/gravity-search` when the user enters a query.
//
// Every layout in `./layouts/*.ts` accepts both and returns
// `{ nodes, links }` with deterministic positions. The renderer then
// syncs meshes / sprites to those positions.
//
// Colour tokens and magic numbers mirror `docs/force-graph-lens-poc.html`
// verbatim. See `CLUSTER_LABEL_FADE_*`, `NODE_LABEL_FADE_START`,
// `CFG.MAX_R`, `CFG.COMPARE_ANCHOR_X` etc. in the POC.
// ---------------------------------------------------------------------------

export const QUERY_NODE_ID = "__query__";

export type LensLayoutMode = "web" | "umap" | "rings";

export type LensPocMode = "explore" | "gravity" | "compare";

export type LensNodeType = "project" | "live_call" | "query" | "organisation";

export type LensZAxis = "score" | "time" | "funding" | "flat";

export type LensNode = {
  id: string;
  type: LensNodeType;
  title: string;
  /** Percentage in [0,100] — UMAP snapshot x. For `query` the POC anchors
   *  at origin regardless. */
  viz_x?: number;
  viz_y?: number;
  /** Normalised transport-relevance / funding score in [0,1]. */
  score?: number;
  lead_funder?: string | null;
  funder?: string | null;
  status?: string | null;
  deadline?: string | null;
  funding_amount?: number | null;
  start_year?: number | null;
  /** Target positions set by async layout transitions (POC `_tx`/`_ty`/`_tz`). */
  _tx?: number;
  _ty?: number;
  _tz?: number;
  /** Cluster the node belongs to (assigned by
   *  `assign-clusters.ts` in deterministic k-means over viz_x/viz_y). */
  cluster_id?: number;
  cluster_label?: string;
  cluster_tag?: string;
  /** Positions set by the layout. 2D uses `x`/`z` (y = 0 for flat z);
   *  3D renderer uses all three. */
  x?: number;
  y?: number;
  z?: number;
};

export type LensLink = {
  source_id: string;
  target_id: string;
  edge_type: "semantic_similarity" | "shared_org" | "live_match" | "query";
  weight?: number;
};

export type LensGraph = {
  nodes: LensNode[];
  links: LensLink[];
};

export type SimilarityMap = Map<string, number>;

export type LayoutOptions = {
  /** Ring-mode top-K. POC uses 120. */
  topK?: number;
  /** Maximum radius for rings / web outer shell. POC: `CFG.MAX_R = 600`. */
  maxRadius?: number;
  /** Z-axis mode (POC: score | time | funding | flat). 2D renderer
   *  ignores this; 3D detail variant honours it. */
  zAxis?: "score" | "time" | "funding" | "flat";
};

export type LayoutResult = {
  nodes: LensNode[];
  links: LensLink[];
};

// POC-verbatim scaling constants. Do not change without updating the POC
// — these are part of the visual contract (grid spacing, label fade
// distances, ring radii).
export const CFG = {
  X_SCALE: 10,
  Z_SCALE: 250,
  MAX_R: 600,
  COMPARE_ANCHOR_X: 450,
  CLUSTER_LABEL_FADE_START: 600,
  CLUSTER_LABEL_FADE_END: 350,
  NODE_LABEL_FADE_START: 420,
} as const;
