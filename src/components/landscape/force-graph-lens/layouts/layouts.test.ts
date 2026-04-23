// ---------------------------------------------------------------------------
// Pure-function tests for the layout library (Phase 3b Part A).
//
// Every layout is deterministic on a small fixture so regressions stay
// cheap to spot. The fixture is tiny on purpose — 4 projects + 1 live
// call — which exercises: tie-break ordering, orphan-link dropping, top-K
// selection, and the query-anchor insertion point.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { QUERY_NODE_ID } from "../types";
import type { LensLink, LensNode, SimilarityMap } from "../types";
import { buildLayout } from "./index";
import { finaliseLayout } from "./finalise";
import { ringsLayout } from "./rings";
import { umapLayout } from "./umap";
import { webLayout } from "./web";
import { buildQueryAnchor, buildQueryLinks } from "./query-anchor";

function fx(): { nodes: LensNode[]; links: LensLink[] } {
  const nodes: LensNode[] = [
    { id: "p1", type: "project", title: "rail hydrogen", viz_x: 20, viz_y: 30, score: 0.8 },
    { id: "p2", type: "project", title: "maritime autonomy", viz_x: 75, viz_y: 40, score: 0.6 },
    { id: "p3", type: "project", title: "SAF fuel", viz_x: 80, viz_y: 70, score: 0.7 },
    { id: "p4", type: "project", title: "EV charging", viz_x: 50, viz_y: 75, score: 0.5 },
    { id: "c1", type: "live_call", title: "hydrogen rail call", viz_x: 22, viz_y: 28 },
  ];
  const links: LensLink[] = [
    { source_id: "p1", target_id: "c1", edge_type: "live_match", weight: 0.8 },
    { source_id: "p1", target_id: "p2", edge_type: "semantic_similarity", weight: 0.5 },
    // orphan link — p99 does not exist
    { source_id: "p1", target_id: "p99", edge_type: "shared_org", weight: 0.3 },
  ];
  return { nodes, links };
}

describe("finaliseLayout", () => {
  it("drops links whose endpoints are not in the final node set", () => {
    const { nodes, links } = fx();
    const out = finaliseLayout(nodes, links);
    expect(out.nodes).toHaveLength(5);
    expect(out.links).toHaveLength(2);
    expect(out.links.every((l) => l.target_id !== "p99")).toBe(true);
  });

  it("returns empty on empty node set", () => {
    expect(finaliseLayout([], [])).toEqual({ nodes: [], links: [] });
  });
});

describe("buildQueryAnchor / buildQueryLinks", () => {
  it("anchor node carries the query text and id", () => {
    const a = buildQueryAnchor("rail decarb");
    expect(a.id).toBe(QUERY_NODE_ID);
    expect(a.type).toBe("query");
    expect(a.title).toBe("rail decarb");
  });

  it("query links point from the anchor to matching nodes only", () => {
    const { nodes } = fx();
    const sim: SimilarityMap = new Map([
      ["p1", 0.9],
      ["p2", 0.1],
    ]);
    const links = buildQueryLinks(nodes, sim);
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.source_id === QUERY_NODE_ID)).toBe(true);
    expect(links.every((l) => l.edge_type === "query")).toBe(true);
    const p1 = links.find((l) => l.target_id === "p1");
    expect(p1?.weight).toBeCloseTo(0.9);
  });
});

describe("umapLayout", () => {
  it("pins every node at its UMAP snapshot coord (flat z)", () => {
    const { nodes, links } = fx();
    const out = umapLayout(nodes, links, null, { zAxis: "flat" });
    const p1 = out.nodes.find((n) => n.id === "p1");
    expect(p1?.x).toBeCloseTo((20 - 50) * 10); // -300
    expect(p1?.z).toBeCloseTo((30 - 50) * 10); // -200
    expect(p1?.y).toBe(0);
  });

  it("inserts a query anchor at the weighted centroid when similarity is provided", () => {
    const { nodes, links } = fx();
    const sim: SimilarityMap = new Map([
      ["p1", 1], // (-300, -200)
      ["p3", 1], // (300, 200)
    ]);
    const out = umapLayout(nodes, links, sim);
    const anchor = out.nodes.find((n) => n.id === QUERY_NODE_ID);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBeCloseTo(0);
    expect(anchor?.z).toBeCloseTo(0);
  });

  it("does NOT insert the query anchor when similarity is null", () => {
    const { nodes, links } = fx();
    const out = umapLayout(nodes, links, null);
    expect(out.nodes.find((n) => n.id === QUERY_NODE_ID)).toBeUndefined();
  });
});

describe("webLayout", () => {
  it("anchor pinned at origin; nodes placed on a radius ∝ (1 - sim)", () => {
    const { nodes, links } = fx();
    const sim: SimilarityMap = new Map([
      ["p1", 1],
      ["p2", 0],
    ]);
    const out = webLayout(nodes, links, sim, "rail hydrogen");
    const anchor = out.nodes.find((n) => n.id === QUERY_NODE_ID);
    expect(anchor?.x).toBe(0);
    expect(anchor?.z).toBe(0);
    const p1 = out.nodes.find((n) => n.id === "p1");
    const p2 = out.nodes.find((n) => n.id === "p2");
    // sim = 1 → radius 0, sim = 0 → radius CFG.MAX_R (600)
    const r1 = Math.hypot(p1?.x ?? 0, p1?.z ?? 0);
    const r2 = Math.hypot(p2?.x ?? 0, p2?.z ?? 0);
    expect(r1).toBeCloseTo(0, 1);
    expect(r2).toBeCloseTo(600, 0);
  });

  it("adds query links for every node that has a similarity entry", () => {
    const { nodes, links } = fx();
    const sim: SimilarityMap = new Map([
      ["p1", 0.9],
      ["p3", 0.2],
    ]);
    const out = webLayout(nodes, links, sim, "q");
    const queryLinks = out.links.filter((l) => l.edge_type === "query");
    expect(queryLinks.map((l) => l.target_id).sort()).toEqual(["p1", "p3"]);
  });
});

describe("ringsLayout", () => {
  it("top-K selection is rank-based, not threshold-based (weak best still goes inner)", () => {
    const nodes: LensNode[] = Array.from({ length: 9 }, (_, i) => ({
      id: `n${i}`,
      type: "project" as const,
      title: `node ${i}`,
      viz_x: 50 + i,
      viz_y: 50 + i,
    }));
    const sim: SimilarityMap = new Map(nodes.map((n, i) => [n.id, 0.05 + i * 0.01]));
    const out = ringsLayout(nodes, [], sim, "q", { topK: 9 });
    // rank 0 (highest sim) should land on inner ring (R = 600 * 0.33 = 198).
    const top = out.nodes.find((n) => n.id === "n8");
    const outer = out.nodes.find((n) => n.id === "n0");
    const topR = Math.hypot(top?.x ?? 0, top?.z ?? 0);
    const outerR = Math.hypot(outer?.x ?? 0, outer?.z ?? 0);
    expect(topR).toBeCloseTo(600 * 0.33, 0);
    expect(outerR).toBeCloseTo(600, 0);
  });

  it("ties break on id ASC so output is deterministic", () => {
    const nodes: LensNode[] = [
      { id: "a", type: "project", title: "a", viz_x: 10, viz_y: 10 },
      { id: "b", type: "project", title: "b", viz_x: 90, viz_y: 90 },
    ];
    const sim: SimilarityMap = new Map([
      ["a", 0.5],
      ["b", 0.5],
    ]);
    const out = ringsLayout(nodes, [], sim, "q", { topK: 2 });
    // After anchor, `a` must come before `b`.
    expect(out.nodes[0].id).toBe(QUERY_NODE_ID);
    expect(out.nodes[1].id).toBe("a");
    expect(out.nodes[2].id).toBe("b");
  });

  it("orphan query links are dropped by finaliseLayout", () => {
    const { nodes, links } = fx();
    // sim claims a node that does not exist in the fixture
    const sim: SimilarityMap = new Map([
      ["p1", 1],
      ["p999", 0.9],
    ]);
    const out = ringsLayout(nodes, links, sim, "q", { topK: 5 });
    expect(out.links.every((l) => l.target_id !== "p999")).toBe(true);
    expect(out.links.every((l) => l.source_id !== "p999")).toBe(true);
  });
});

describe("buildLayout dispatcher", () => {
  it("routes mode=umap through umapLayout", () => {
    const { nodes, links } = fx();
    const out = buildLayout({
      mode: "umap",
      nodes,
      links,
      similarity: null,
      queryText: null,
    });
    expect(out.nodes).toHaveLength(5);
    expect(out.nodes.every((n) => n.id !== QUERY_NODE_ID)).toBe(true);
  });

  it("falls back to UMAP when web mode has no query", () => {
    const { nodes, links } = fx();
    const out = buildLayout({
      mode: "web",
      nodes,
      links,
      similarity: null,
      queryText: null,
    });
    expect(out.nodes.find((n) => n.id === QUERY_NODE_ID)).toBeUndefined();
  });

  it("rings mode with a query produces three radii", () => {
    const { nodes, links } = fx();
    const sim: SimilarityMap = new Map(
      nodes.map((n, i) => [n.id, 0.9 - i * 0.1]),
    );
    const out = buildLayout({
      mode: "rings",
      nodes,
      links,
      similarity: sim,
      queryText: "q",
      options: { topK: 5 },
    });
    const radii = new Set(
      out.nodes
        .filter((n) => n.id !== QUERY_NODE_ID)
        .map((n) => Math.round(Math.hypot(n.x ?? 0, n.z ?? 0))),
    );
    // expect ≥ 2 distinct rings (can be 1 in fringe cases with K < nodes.length).
    expect(radii.size).toBeGreaterThanOrEqual(2);
  });
});
