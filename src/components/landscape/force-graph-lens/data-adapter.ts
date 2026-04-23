// ---------------------------------------------------------------------------
// Data adapter — convert the real DB-sourced landscape payload into the
// lens's working `LensGraph` shape.
//
// Source of truth is `LANDSCAPE_SNAPSHOT` (a frozen copy of
// `GET /api/landscape/v2-data` — see `src/lib/landscape/snapshot.ts`).
// That's the same real data the production `/landscape-3d` page renders.
// The POC's synthetic `buildData()` generator is NOT imported — Phase 3b
// execution prompt line 28: "Do NOT ship synthetic data."
//
// The adapter also performs **deterministic k-means** clustering over
// the UMAP coordinates so cluster labels (plan §3 / POC `CLUSTERS` list)
// can be generated without needing a Python-side HDBSCAN pipeline in
// the browser. Cluster labels themselves are supplied by the caller
// (either the in-app LLM cluster-label route, or a hard-coded fallback).
// ---------------------------------------------------------------------------

import type { LandscapeData, LandscapeNode } from "@/lib/landscape/types";
import type { LensGraph, LensLink, LensNode } from "./types";

const CLUSTER_COUNT = 10;
const KMEANS_ITERATIONS = 40;

type Centroid = { cx: number; cy: number };

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function kmeans(
  points: { id: string; x: number; y: number }[],
  k: number,
  seed: string,
): { assignments: Map<string, number>; centroids: Centroid[] } {
  if (points.length === 0) {
    return { assignments: new Map(), centroids: [] };
  }
  const rng = seededRandom(hashSeed(seed));
  const centroids: Centroid[] = [];
  // k-means++ seeding: first centroid is a seeded-random point, then
  // farthest-point heuristic. Keeps output stable across reloads on
  // the same snapshot hash.
  centroids.push({
    cx: points[Math.floor(rng() * points.length)].x,
    cy: points[Math.floor(rng() * points.length)].y,
  });
  while (centroids.length < k && centroids.length < points.length) {
    let best = { idx: 0, dist: -1 };
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      let nearest = Infinity;
      for (const c of centroids) {
        const dx = p.x - c.cx;
        const dy = p.y - c.cy;
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
      if (nearest > best.dist) {
        best = { idx: i, dist: nearest };
      }
    }
    centroids.push({ cx: points[best.idx].x, cy: points[best.idx].y });
  }

  const assignments = new Map<string, number>();
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter += 1) {
    let moved = false;
    for (const p of points) {
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < centroids.length; i += 1) {
        const dx = p.x - centroids[i].cx;
        const dy = p.y - centroids[i].cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const prev = assignments.get(p.id);
      if (prev !== bestI) {
        assignments.set(p.id, bestI);
        moved = true;
      }
    }
    const sums = centroids.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const p of points) {
      const i = assignments.get(p.id) ?? 0;
      sums[i].x += p.x;
      sums[i].y += p.y;
      sums[i].n += 1;
    }
    for (let i = 0; i < centroids.length; i += 1) {
      if (sums[i].n === 0) continue;
      centroids[i] = {
        cx: sums[i].x / sums[i].n,
        cy: sums[i].y / sums[i].n,
      };
    }
    if (!moved) break;
  }

  return { assignments, centroids };
}

export type LensDataOptions = {
  clusterLabels?: Map<number, string>;
  clusterTags?: Map<number, string>;
  clusterCount?: number;
  seed?: string;
};

function normaliseNode(n: LandscapeNode): LensNode {
  // The snapshot's working type lives on `x` / `y` (UMAP 0–100). The
  // lens working vocabulary stores them as `viz_x` / `viz_y` to mirror
  // the POC. The final `x` / `y` / `z` are set by the layout.
  if (n.type === "project") {
    return {
      id: n.id,
      type: "project",
      title: n.title,
      viz_x: typeof n.x === "number" ? n.x : 50,
      viz_y: typeof n.y === "number" ? n.y : 50,
      score: n.score,
      lead_funder: n.lead_funder ?? null,
    };
  }
  return {
    id: n.id,
    type: "live_call",
    title: n.title,
    viz_x: typeof n.x === "number" ? n.x : 50,
    viz_y: typeof n.y === "number" ? n.y : 50,
    funder: n.funder ?? null,
    status: n.status ?? null,
    deadline: n.deadline ?? null,
  };
}

export function adaptLandscapeData(
  data: LandscapeData,
  options: LensDataOptions = {},
): LensGraph {
  const nodes = data.nodes.map(normaliseNode);
  const links: LensLink[] = data.links.map((l) => ({
    source_id: l.source_id,
    target_id: l.target_id,
    edge_type:
      l.edge_type === "live_match"
        ? "live_match"
        : l.edge_type === "shared_org"
          ? "shared_org"
          : "semantic_similarity",
    weight: l.weight,
  }));

  const clusterCount = options.clusterCount ?? CLUSTER_COUNT;
  const seed = options.seed ?? data.generatedAt ?? "default";

  const points = nodes.map((n) => ({
    id: n.id,
    x: n.viz_x ?? 50,
    y: n.viz_y ?? 50,
  }));
  const { assignments } = kmeans(points, clusterCount, seed);

  const labels = options.clusterLabels;
  const tags = options.clusterTags;
  for (const n of nodes) {
    const cid = assignments.get(n.id);
    if (cid === undefined) continue;
    n.cluster_id = cid;
    if (labels?.has(cid)) n.cluster_label = labels.get(cid);
    if (tags?.has(cid)) n.cluster_tag = tags.get(cid);
  }

  return { nodes, links };
}

/**
 * Given a LensGraph (post-adapter), compute one (centroid, radius)
 * per cluster. Used by the renderer to place cluster labels + draw
 * translucent cluster volumes (POC: `clusterStats`).
 */
export function computeClusterStats(
  graph: LensGraph,
): Map<number, { cx: number; cy: number; cz: number; radius: number }> {
  const byCluster = new Map<number, LensNode[]>();
  for (const n of graph.nodes) {
    if (n.cluster_id === undefined) continue;
    const list = byCluster.get(n.cluster_id) ?? [];
    list.push(n);
    byCluster.set(n.cluster_id, list);
  }
  const out = new Map<
    number,
    { cx: number; cy: number; cz: number; radius: number }
  >();
  for (const [cid, ns] of byCluster) {
    if (ns.length === 0) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let counted = 0;
    for (const n of ns) {
      if (n.x === undefined) continue;
      cx += n.x;
      cy += n.y ?? 0;
      cz += n.z ?? 0;
      counted += 1;
    }
    if (counted === 0) continue;
    cx /= counted;
    cy /= counted;
    cz /= counted;
    let maxDist = 0;
    for (const n of ns) {
      if (n.x === undefined) continue;
      const d = Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy, (n.z ?? 0) - cz);
      if (d > maxDist) maxDist = d;
    }
    out.set(cid, { cx, cy, cz, radius: maxDist + 25 });
  }
  return out;
}
