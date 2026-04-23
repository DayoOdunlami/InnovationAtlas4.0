// ---------------------------------------------------------------------------
// Data-adapter tests (Phase 3b).
//
// Cover the two invariants the rest of the lens relies on:
//   1. Every node in the snapshot ends up with a cluster_id after the
//      adapter runs (k-means converges and all points are assigned).
//   2. `computeClusterStats` returns one (centroid, radius) per cluster
//      that contains at least one node with laid-out coordinates.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { adaptLandscapeData, computeClusterStats } from "./data-adapter";
import type { LandscapeData } from "@/lib/landscape/types";

function snapshot(): LandscapeData {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      {
        id: "p1",
        type: "project",
        title: "hydrogen rail",
        x: 20,
        y: 25,
        score: 0.8,
      },
      {
        id: "p2",
        type: "project",
        title: "maritime autonomy",
        x: 75,
        y: 30,
        score: 0.6,
      },
      {
        id: "p3",
        type: "project",
        title: "SAF fuel",
        x: 80,
        y: 70,
        score: 0.7,
      },
      {
        id: "p4",
        type: "project",
        title: "EV charging",
        x: 50,
        y: 75,
        score: 0.5,
      },
      {
        id: "c1",
        type: "live_call",
        title: "hydrogen rail call",
        x: 22,
        y: 28,
      },
    ],
    links: [
      { source_id: "p1", target_id: "p2", edge_type: "semantic", weight: 0.5 },
    ],
  };
}

describe("adaptLandscapeData", () => {
  it("assigns a cluster_id to every node", () => {
    const g = adaptLandscapeData(snapshot(), { clusterCount: 3 });
    for (const n of g.nodes) {
      expect(n.cluster_id).toBeDefined();
    }
  });

  it("applies cluster labels and tags when provided", () => {
    const labels = new Map<number, string>([
      [0, "Rail · Hydrogen"],
      [1, "Maritime · Autonomy"],
    ]);
    const g = adaptLandscapeData(snapshot(), {
      clusterCount: 2,
      clusterLabels: labels,
    });
    const labelled = g.nodes.filter((n) => n.cluster_label);
    expect(labelled.length).toBeGreaterThan(0);
    for (const n of labelled) {
      expect(["Rail · Hydrogen", "Maritime · Autonomy"]).toContain(
        n.cluster_label,
      );
    }
  });

  it("converts link types into the lens working vocabulary", () => {
    const g = adaptLandscapeData(snapshot());
    for (const l of g.links) {
      expect(["semantic_similarity", "shared_org", "live_match"]).toContain(
        l.edge_type,
      );
    }
  });

  it("is deterministic across runs for the same seed", () => {
    const a = adaptLandscapeData(snapshot(), { clusterCount: 3, seed: "x" });
    const b = adaptLandscapeData(snapshot(), { clusterCount: 3, seed: "x" });
    expect(a.nodes.map((n) => n.cluster_id)).toEqual(
      b.nodes.map((n) => n.cluster_id),
    );
  });
});

describe("computeClusterStats", () => {
  it("returns (centroid, radius) only for clusters with positioned nodes", () => {
    const g = adaptLandscapeData(snapshot(), { clusterCount: 2 });
    // The layout hasn't run yet → x/z undefined. Stats should be empty.
    expect(computeClusterStats(g).size).toBe(0);

    // Pretend the layout ran with UMAP positions.
    for (const n of g.nodes) {
      n.x = (n.viz_x ?? 50) - 50;
      n.y = 0;
      n.z = (n.viz_y ?? 50) - 50;
    }
    const stats = computeClusterStats(g);
    expect(stats.size).toBeGreaterThan(0);
    for (const [, stat] of stats) {
      expect(stat.radius).toBeGreaterThan(0);
    }
  });
});
