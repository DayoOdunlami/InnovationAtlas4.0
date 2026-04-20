"use client";

import { appStore } from "@/app/store";
import type { CanvasFilter } from "@/app/store";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import type {
  EdgeType,
  LandscapeData,
  LandscapeLink,
  LandscapeNode,
} from "@/lib/landscape/types";
import type { ForceGraphMethods } from "react-force-graph-3d";
import type { Root } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useShallow } from "zustand/shallow";

type ZMode = "year" | "funding" | "degree" | "score";
type GravityRing = "inner" | "middle" | "outer" | "hidden";
type EdgeVisibility = Record<EdgeType, boolean>;

type Graph3DNode = LandscapeNode & {
  x: number;
  y: number;
  z: number;
  fx?: number;
  fy?: number;
  fz?: number;
  color: string;
  val: number;
  umapX: number;
  umapY: number;
  startYear?: number;
  fundingAmount?: number;
  degree?: number;
  gravitySimilarity?: number;
  gravityRing?: Exclude<GravityRing, "hidden">;
};

type Graph3DLink = {
  source: string;
  target: string;
  edgeType: EdgeType;
  color: string;
  particles: number;
  weight?: number;
};

const DEFAULT_EDGE_VISIBILITY: EdgeVisibility = {
  shared_org: true,
  semantic: true,
  shared_topic: true,
  live_match: true,
};

const FUNDER_COLOURS: Record<string, string> = {
  "Innovate UK": "#3fb950",
  EPSRC: "#a371f7",
  ISCF: "#388bfd",
  ESRC: "#f0883e",
  AHRC: "#f0883e",
  "Horizon Europe Guarantee": "#58a6ff",
  MRC: "#f0883e",
  NERC: "#f0883e",
};

const LIVE_CALL_COLOURS: Record<string, string> = {
  horizon_europe: "#58a6ff",
  innovate_uk: "#3fb950",
  find_a_tender: "#e3b341",
};

const MIN_FUNDING = 5_000;
const MAX_FUNDING = 55_735_500;
const MIN_YEAR = 2006;
const MAX_YEAR = 2026;

function hashUmapComponent(id: string, axis: "x" | "y"): number {
  const seed = `${id}:${axis}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10001) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseFundingAmount(node: LandscapeNode): number | undefined {
  const raw = (node as { funding_amount?: unknown }).funding_amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replaceAll(",", "").replaceAll("£", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseProjectStartYear(node: LandscapeNode): number | undefined {
  const rawStartYear = (node as { start_year?: unknown }).start_year;
  if (typeof rawStartYear === "number" && Number.isFinite(rawStartYear)) {
    return rawStartYear;
  }
  const rawStartDate = (node as { start_date?: unknown }).start_date;
  if (typeof rawStartDate === "string") {
    const date = new Date(rawStartDate);
    if (!Number.isNaN(date.getTime())) return date.getUTCFullYear();
  }
  return undefined;
}

function parseLiveCallYear(node: LandscapeNode): number | undefined {
  if (node.type !== "live_call") return undefined;
  const d = node.deadline ? new Date(node.deadline) : null;
  if (d && !Number.isNaN(d.getTime())) return d.getUTCFullYear();
  return undefined;
}

function toDepthBand(norm: number): number {
  return norm * 600 - 300;
}

function computeZ(node: Graph3DNode, mode: ZMode): number {
  if (mode === "score")
    return node.type === "project" ? ((node.score ?? 0.7) - 0.6) * 200 : 50;
  if (mode === "degree")
    return toDepthBand(clamp((node.degree ?? 0) / 20, 0, 1));
  if (mode === "year") {
    if (node.type === "live_call") return 300;
    if (node.startYear == null) return 0;
    return toDepthBand(
      clamp((node.startYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR), 0, 1),
    );
  }
  if (node.type === "live_call") return 300;
  if (node.fundingAmount == null || node.fundingAmount <= 0) return 0;
  const amount = clamp(node.fundingAmount, MIN_FUNDING, MAX_FUNDING);
  return toDepthBand(
    (Math.log10(amount) - Math.log10(MIN_FUNDING)) /
      (Math.log10(MAX_FUNDING) - Math.log10(MIN_FUNDING)),
  );
}

/** Stable [0, 1) from id — spreads nodes that share nearly the same similarity. */
function gravityJitter01(id: string, salt: string): number {
  const seed = `${id}:${salt}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10000) / 10000;
}

/**
 * Gravity layout: similarity → radius (close = high sim). Many nodes often share
 * almost the same score, which stacks them on one ring (“two big circles”).
 * We use sqrt on (1 − sim) to open up the inner/middle bands, plus small
 * deterministic jitter so same-radius nodes fan out instead of merging visually.
 */
function computeGravityPosition(node: Graph3DNode, similarity: number) {
  const MAX_R = 320;
  const t = clamp(1 - similarity, 0, 1);
  const radiusCore = Math.sqrt(t) * MAX_R;
  const radialJitter = (gravityJitter01(node.id, "r") - 0.5) * 42;
  const radius = Math.max(14, radiusCore + radialJitter);
  const baseAngle = Math.atan2(node.umapY - 50, node.umapX - 50);
  const angleJitter = (gravityJitter01(node.id, "θ") - 0.5) * 0.22;
  const angle = baseAngle + angleJitter;
  const z = (similarity - 0.6) * 300 + (node.type === "live_call" ? 14 : 0);
  return {
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
    z,
  };
}

function getGravityRing(sim: number): GravityRing {
  if (sim >= 0.75) return "inner";
  if (sim >= 0.6) return "middle";
  if (sim >= 0.45) return "outer";
  return "hidden";
}

function buildBaseNodes(data: LandscapeData): Graph3DNode[] {
  return data.nodes.map((n) => {
    const umapX = n.x ?? hashUmapComponent(n.id, "x");
    const umapY = n.y ?? hashUmapComponent(n.id, "y");
    return {
      ...n,
      x: (umapX - 50) * 8,
      y: (umapY - 50) * 8,
      z: 0,
      umapX,
      umapY,
      color:
        n.type === "live_call"
          ? (LIVE_CALL_COLOURS[n.source ?? ""] ?? "#e3b341")
          : (FUNDER_COLOURS[n.lead_funder ?? ""] ?? "#6e7681"),
      val:
        n.type === "live_call"
          ? 4
          : Math.max(0.5, ((n.score ?? 0.7) - 0.7) * 20),
      startYear:
        n.type === "project" ? parseProjectStartYear(n) : parseLiveCallYear(n),
      fundingAmount: n.type === "project" ? parseFundingAmount(n) : undefined,
      degree: 0,
    };
  });
}

function filterNodes(nodes: Graph3DNode[], filter: string): Graph3DNode[] {
  if (filter === "innovate_uk") {
    return nodes.filter(
      (n) =>
        n.type === "live_call" ||
        (n.type === "project" && n.lead_funder === "Innovate UK"),
    );
  }
  if (filter === "epsrc") {
    return nodes.filter(
      (n) =>
        n.type === "live_call" ||
        (n.type === "project" && n.lead_funder === "EPSRC"),
    );
  }
  if (filter === "iscf") {
    return nodes.filter(
      (n) =>
        n.type === "live_call" ||
        (n.type === "project" && n.lead_funder === "ISCF"),
    );
  }
  if (filter === "live") return nodes.filter((n) => n.type === "live_call");
  return nodes;
}

function buildLinks(
  links: LandscapeLink[],
  nodeIds: Set<string>,
  edgeVisibility: EdgeVisibility,
  particleSpeed: number,
  gravityMode: boolean,
): Graph3DLink[] {
  return links
    .filter(
      (l) =>
        nodeIds.has(l.source_id) &&
        nodeIds.has(l.target_id) &&
        edgeVisibility[l.edge_type],
    )
    .map((l) => ({
      source:
        gravityMode && l.edge_type === "live_match" ? l.target_id : l.source_id,
      target:
        gravityMode && l.edge_type === "live_match" ? l.source_id : l.target_id,
      edgeType: l.edge_type,
      weight: l.weight,
      color:
        l.edge_type === "live_match"
          ? "rgba(88,166,255,0.6)"
          : l.edge_type === "shared_org"
            ? "rgba(63,185,80,0.4)"
            : l.edge_type === "semantic"
              ? "rgba(139,148,158,0.15)"
              : "rgba(167,139,250,0.12)",
      particles: l.edge_type === "live_match" && particleSpeed > 0 ? 2 : 0,
    }));
}

function applyLayoutMode(nodes: Graph3DNode[], layoutSpread: boolean) {
  return nodes.map((n) =>
    !layoutSpread
      ? { ...n, fx: n.x, fy: n.y, fz: n.z }
      : { ...n, fx: undefined, fy: undefined, fz: undefined },
  );
}

function escapeAttr(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ControlButton({
  active,
  label,
  onClick,
}: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: active
          ? "1px solid #388bfd"
          : "0.5px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        padding: "6px 10px",
        color: active ? "#79c0ff" : "#c9d1d9",
        fontSize: 11,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          color: "#6e7681",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span style={{ color: "#c9d1d9", fontSize: 12 }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas ↔ legacy-filter mapping (Sprint X Commit 3)
//
// The existing UI exposes a single-string "activeFilter" ("all" | "innovate_uk"
// | "epsrc" | "iscf" | "live"). The canonical `canvas.filter` slice on
// `appStore` is structured (funder + mode + …). These two helpers bridge the
// two without the filterNodes() helper caring about the change.
// ---------------------------------------------------------------------------

type FilterButtonKey = "all" | "innovate_uk" | "epsrc" | "iscf" | "live";

function canvasFilterToButtonKey(filter: CanvasFilter): FilterButtonKey {
  if (filter.mode === "live") return "live";
  if (filter.funder === "Innovate UK") return "innovate_uk";
  if (filter.funder === "EPSRC") return "epsrc";
  if (filter.funder === "ISCF") return "iscf";
  return "all";
}

function buttonKeyToCanvasFilter(key: FilterButtonKey): CanvasFilter {
  switch (key) {
    case "all":
      return {};
    case "innovate_uk":
      return { funder: "Innovate UK" };
    case "epsrc":
      return { funder: "EPSRC" };
    case "iscf":
      return { funder: "ISCF" };
    case "live":
      return { mode: "live" };
  }
}

/** Coerce a landscape node's raw `type` into the structured CanvasNodeType. */
function landscapeNodeTypeToCanvas(
  node: LandscapeNode,
): "project" | "organisation" | "theme" | null {
  if (node.type === "project") return "project";
  // Live calls and any other landscape-specific types have no natural mapping
  // into the three CanvasNodeType buckets. Leaving as null keeps the contract
  // honest; agents that care about orgs/themes will select via other lenses.
  return null;
}

export default function Landscape3DPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<Graph3DNode, Graph3DLink> | undefined>(
    undefined,
  );

  const [dimensions, setDimensions] = useState({ w: 1200, h: 800 });
  const [edgeVisibility, setEdgeVisibility] = useState<EdgeVisibility>(
    DEFAULT_EDGE_VISIBILITY,
  );
  const [layoutSpread, setLayoutSpread] = useState(true);
  const [particleSpeed, setParticleSpeed] = useState(20);
  const [zMode, setZMode] = useState<ZMode>("year");

  // Canvas slice (Sprint X Commit 3): selection + filter + active lens now
  // live in the appStore. Everything below is sourced from there so the
  // agent's forthcoming write tools (Commits 5–6) can mutate the same state
  // via synchronous `canvasMutate` calls and trigger re-renders here.
  const [appStoreMutate, selectedNodeId, canvasFilter] = appStore(
    useShallow((s) => [s.mutate, s.canvas.selectedNodeId, s.canvas.filter]),
  );
  const activeFilter: FilterButtonKey = useMemo(
    () => canvasFilterToButtonKey(canvasFilter),
    [canvasFilter],
  );

  // This page IS the force-graph lens. Reflect that in the store on mount so
  // any tool-call that opens the page (e.g. a future passport deep-link)
  // sees the correct lens. Guarded to avoid write-loops under StrictMode.
  useEffect(() => {
    const current = appStore.getState().canvas.activeLens;
    if (current !== "force-graph") {
      appStore.setState((prev) => ({
        canvas: {
          ...prev.canvas,
          activeLens: "force-graph",
          lastAction: {
            type: "setActiveLens",
            payload: { lens: "force-graph" },
            result: { activeLens: "force-graph" },
            at: Date.now(),
            source: "user",
          },
        },
      }));
    }
  }, []);

  const setSelectedNodeId = useCallback(
    (id: string | null, node?: LandscapeNode) => {
      appStoreMutate((prev) => ({
        canvas: {
          ...prev.canvas,
          selectedNodeId: id,
          selectedNodeType: id && node ? landscapeNodeTypeToCanvas(node) : null,
          lastAction: {
            type: id ? "selectNode" : "clearSelection",
            payload: id ? { id } : {},
            result: { selectedNodeId: id },
            at: Date.now(),
            source: "user",
          },
        },
      }));
    },
    [appStoreMutate],
  );

  const setActiveFilter = useCallback(
    (key: FilterButtonKey) => {
      const nextFilter = buttonKeyToCanvasFilter(key);
      appStoreMutate((prev) => ({
        canvas: {
          ...prev.canvas,
          filter: nextFilter,
          lastAction: {
            type: "setFilter",
            payload: { filter: nextFilter, buttonKey: key },
            result: { filter: nextFilter },
            at: Date.now(),
            source: "user",
          },
        },
      }));
    },
    [appStoreMutate],
  );

  const [gravityMode, setGravityMode] = useState(false);
  const [gravityQuery, setGravityQuery] = useState("");
  const [gravityLoading, setGravityLoading] = useState(false);
  const [gravityError, setGravityError] = useState<string | null>(null);
  const [lastAppliedQuery, setLastAppliedQuery] = useState<string | null>(null);
  const [similarityScores, setSimilarityScores] = useState<Map<string, number>>(
    new Map(),
  );

  const baseNodes = useMemo(() => buildBaseNodes(LANDSCAPE_SNAPSHOT), []);

  const graphData = useMemo(() => {
    const filtered = filterNodes(baseNodes, activeFilter);
    const nodeIds = new Set(filtered.map((n) => n.id));
    const links = buildLinks(
      LANDSCAPE_SNAPSHOT.links,
      nodeIds,
      edgeVisibility,
      particleSpeed,
      gravityMode,
    );

    const degreeById = new Map<string, number>();
    for (const n of filtered) degreeById.set(n.id, 0);
    for (const l of links) {
      degreeById.set(l.source, (degreeById.get(l.source) ?? 0) + 1);
      degreeById.set(l.target, (degreeById.get(l.target) ?? 0) + 1);
    }

    const withPositions: (Graph3DNode | null)[] =
      gravityMode && similarityScores.size > 0
        ? filtered.map((n) => {
            const sim = similarityScores.get(n.id) ?? 0;
            const ring = getGravityRing(sim);
            if (ring === "hidden") return null;
            const pos = computeGravityPosition(n, sim);
            const valMultiplier =
              ring === "inner" ? 1.4 : ring === "middle" ? 1.0 : 0.6;
            return {
              ...n,
              ...pos,
              fx: pos.x,
              fy: pos.y,
              fz: pos.z,
              val: n.val * valMultiplier,
              gravitySimilarity: sim,
              gravityRing: ring,
            };
          })
        : filtered.map((n) => {
            const withDegree = { ...n, degree: degreeById.get(n.id) ?? 0 };
            return { ...withDegree, z: computeZ(withDegree, zMode) };
          });

    const validNodes = withPositions.filter(
      (n): n is Graph3DNode => n !== null,
    );
    if (gravityMode && similarityScores.size > 0) {
      validNodes.push({
        id: "__sun__",
        type: "project",
        title: lastAppliedQuery?.slice(0, 40) ?? "Query",
        lead_funder: "",
        score: 1,
        x: 0,
        y: 0,
        z: 0,
        fx: 0,
        fy: 0,
        fz: 0,
        umapX: 50,
        umapY: 50,
        color: "#79c0ff",
        val: 14,
        degree: 0,
        gravitySimilarity: 1,
        gravityRing: "inner",
      } as Graph3DNode);
    }
    return { nodes: applyLayoutMode(validNodes, layoutSpread), links };
  }, [
    activeFilter,
    baseNodes,
    edgeVisibility,
    gravityMode,
    lastAppliedQuery,
    layoutSpread,
    particleSpeed,
    similarityScores,
    zMode,
  ]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!graphData.nodes.some((n) => n.id === selectedNodeId))
      setSelectedNodeId(null);
  }, [graphData.nodes, selectedNodeId, setSelectedNodeId]);

  const runGravitySearch = useCallback(async () => {
    if (!gravityQuery.trim() || gravityLoading) return;
    setGravityLoading(true);
    setGravityError(null);
    try {
      const res = await fetch("/api/landscape/gravity-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gravityQuery }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { results } = (await res.json()) as {
        results: Array<{ id: string; similarity: number; node_type: string }>;
      };
      if (!results?.length)
        return setGravityError("No results returned. Try a different query.");
      if (results.filter((r) => r.similarity >= 0.45).length === 0) {
        return setGravityError(
          "No matches above threshold. Try a broader query.",
        );
      }
      setSimilarityScores(new Map(results.map((r) => [r.id, r.similarity])));
      setLastAppliedQuery(gravityQuery);
      setTimeout(() => fgRef.current?.zoomToFit(800, 80), 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setGravityError(`Search failed: ${msg}`);
    } finally {
      setGravityLoading(false);
    }
  }, [gravityLoading, gravityQuery]);

  const nodeById = useMemo(
    () => new Map(graphData.nodes.map((n) => [n.id, n])),
    [graphData.nodes],
  );
  const selectedNode =
    selectedNodeId && selectedNodeId !== "__sun__"
      ? (nodeById.get(selectedNodeId) ?? null)
      : null;
  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];
    return graphData.links
      .filter(
        (l) => l.source === selectedNode.id || l.target === selectedNode.id,
      )
      .flatMap((l) => {
        const other = nodeById.get(
          l.source === selectedNode.id ? l.target : l.source,
        );
        return other ? [{ link: l, other }] : [];
      })
      .slice(0, 8);
  }, [graphData.links, nodeById, selectedNode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setDimensions({
        w: Math.max(320, Math.floor(r.width)),
        h: Math.max(320, Math.floor(r.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let root: Root | null = null;
    const run = async () => {
      const [{ default: ForceGraph3D }, { createRoot }] = await Promise.all([
        import("react-force-graph-3d"),
        import("react-dom/client"),
      ]);
      if (cancelled || !containerRef.current) return;
      root = createRoot(containerRef.current);
      root.render(
        <ForceGraph3D<Graph3DNode, Graph3DLink>
          ref={
            fgRef as MutableRefObject<
              ForceGraphMethods<Graph3DNode, Graph3DLink> | undefined
            >
          }
          graphData={graphData}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="#0d1117"
          nodeColor="color"
          nodeVal="val"
          nodeLabel={(node) => {
            if (node.id === "__sun__") {
              return `<div style="background:rgba(13,17,23,0.95);border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;font-family:ui-monospace,monospace;font-size:12px;color:#e6edf3;"><strong>Query anchor</strong><br><span style="color:#79c0ff">${escapeAttr(lastAppliedQuery ?? "")}</span></div>`;
            }
            const simLine =
              gravityMode && node.gravitySimilarity != null
                ? `<br><span style="color:#79c0ff">Similarity: ${node.gravitySimilarity.toFixed(3)} · ${node.gravityRing ?? ""} ring</span>`
                : "";
            return `<div style="background:rgba(13,17,23,0.95);border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;font-family:ui-monospace,monospace;font-size:12px;color:#e6edf3;"><strong>${escapeAttr(node.title)}</strong><br><span style="color:#8b949e">${escapeAttr(node.lead_funder ?? node.funder ?? "")}</span>${simLine}</div>`;
          }}
          linkColor="color"
          linkWidth={(link) => (link.particles > 0 ? 1.5 : 0.5)}
          linkDirectionalParticles={(link) => link.particles}
          linkDirectionalParticleSpeed={() => {
            const base = 0.0003 + (particleSpeed / 100) * 0.006;
            return gravityMode ? -base : base;
          }}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => "#79c0ff"}
          onNodeClick={(node) => {
            if (node.id === "__sun__") return;
            setSelectedNodeId(node.id, node);
            const g = fgRef.current;
            if (!g) return;
            g.cameraPosition(
              {
                x: (node.x ?? 0) + 65,
                y: (node.y ?? 0) + 58,
                z: (node.z ?? 0) + 130,
              },
              { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 },
              1400,
            );
          }}
          onNodeDragEnd={(node) => {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
          }}
          onBackgroundClick={() => setSelectedNodeId(null)}
          cooldownTicks={gravityMode ? 0 : layoutSpread ? 120 : 0}
          d3AlphaDecay={gravityMode ? 1 : layoutSpread ? 0.02 : 1}
          d3VelocityDecay={layoutSpread ? 0.3 : 1}
        />,
      );
    };
    void run();
    return () => {
      cancelled = true;
      root?.unmount();
      fgRef.current = undefined;
    };
  }, [
    dimensions.h,
    dimensions.w,
    graphData,
    gravityMode,
    lastAppliedQuery,
    layoutSpread,
    particleSpeed,
  ]);

  const patchEdgeVisibility = useCallback((patch: Partial<EdgeVisibility>) => {
    setEdgeVisibility((prev) => ({ ...prev, ...patch }));
  }, []);

  const projectCount = graphData.nodes.filter(
    (n) => n.type === "project",
  ).length;
  const liveCallCount = graphData.nodes.filter(
    (n) => n.type === "live_call",
  ).length;
  const visibleWithoutSun = graphData.nodes.filter(
    (n) => n.id !== "__sun__",
  ).length;
  const strongMatches = graphData.nodes.filter(
    (n) => n.gravityRing === "inner",
  ).length;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: "#0d1117",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxWidth: 280,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <ControlButton
          active={activeFilter === "all"}
          label="All nodes"
          onClick={() => setActiveFilter("all")}
        />
        <ControlButton
          active={activeFilter === "innovate_uk"}
          label="Innovate UK"
          onClick={() => setActiveFilter("innovate_uk")}
        />
        <ControlButton
          active={activeFilter === "epsrc"}
          label="EPSRC"
          onClick={() => setActiveFilter("epsrc")}
        />
        <ControlButton
          active={activeFilter === "iscf"}
          label="ISCF"
          onClick={() => setActiveFilter("iscf")}
        />
        <ControlButton
          active={activeFilter === "live"}
          label="Live calls only"
          onClick={() => setActiveFilter("live")}
        />
        <div
          style={{
            marginTop: 6,
            paddingTop: 8,
            borderTop: "0.5px solid rgba(255,255,255,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span
            style={{
              color: "#6e7681",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Gravity mode
          </span>
          <ControlButton
            active={gravityMode}
            label={gravityMode ? "☀ Gravity ON" : "☀ Gravity mode"}
            onClick={() => {
              const next = !gravityMode;
              setGravityMode(next);
              if (!next) {
                setSimilarityScores(new Map());
                setGravityError(null);
                setLastAppliedQuery(null);
              }
            }}
          />
          {gravityMode && (
            <>
              <textarea
                value={gravityQuery}
                onChange={(e) => setGravityQuery(e.target.value)}
                rows={3}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "0.5px solid rgba(255,255,255,0.2)",
                  borderRadius: 6,
                  color: "#e6edf3",
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  padding: "6px 8px",
                  resize: "none",
                  outline: "none",
                  width: "100%",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runGravitySearch();
                  }
                }}
              />
              <ControlButton
                active={false}
                label={gravityLoading ? "⟳ Computing..." : "→ Apply gravity"}
                onClick={() => void runGravitySearch()}
              />
              {similarityScores.size > 0 && (
                <ControlButton
                  active={false}
                  label="✕ Reset gravity"
                  onClick={() => {
                    setSimilarityScores(new Map());
                    setLastAppliedQuery(null);
                    setGravityError(null);
                  }}
                />
              )}
              {gravityError && (
                <div style={{ fontSize: 10, color: "#f85149" }}>
                  {gravityError}
                </div>
              )}
              {similarityScores.size > 0 && !gravityError && (
                <div style={{ fontSize: 10, color: "#8b949e" }}>
                  {visibleWithoutSun} nodes visible ·{" "}
                  <span style={{ color: "#79c0ff" }}>
                    {strongMatches} strong matches
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <ControlButton
          active={false}
          label="⊡ Fit view"
          onClick={() => fgRef.current?.zoomToFit(700, 40)}
        />
        <ControlButton
          active={false}
          label="↺ Reheat"
          onClick={() => {
            if (!layoutSpread) return;
            fgRef.current?.d3ReheatSimulation();
          }}
        />
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            color: "#8b949e",
            fontSize: 10,
          }}
        >
          Particle speed
          <input
            type="range"
            min={0}
            max={100}
            value={particleSpeed}
            onChange={(e) => setParticleSpeed(Number(e.target.value))}
          />
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#c9d1d9",
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={layoutSpread}
            onChange={() => setLayoutSpread((v) => !v)}
          />
          Allow spread
        </label>
        <ControlButton
          active={zMode === "year"}
          label="Z: Year (2006-26)"
          onClick={() => setZMode("year")}
        />
        <ControlButton
          active={zMode === "funding"}
          label="Z: Funding (log GBP)"
          onClick={() => setZMode("funding")}
        />
        <ControlButton
          active={zMode === "degree"}
          label="Z: Connectivity (degree)"
          onClick={() => setZMode("degree")}
        />
        <ControlButton
          active={zMode === "score"}
          label="Z: Relevance score"
          onClick={() => setZMode("score")}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#c9d1d9",
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={edgeVisibility.shared_org}
            onChange={() =>
              patchEdgeVisibility({ shared_org: !edgeVisibility.shared_org })
            }
          />
          Shared org
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#c9d1d9",
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={edgeVisibility.semantic}
            onChange={() =>
              patchEdgeVisibility({ semantic: !edgeVisibility.semantic })
            }
          />
          Semantic similarity
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#c9d1d9",
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={edgeVisibility.shared_topic}
            onChange={() =>
              patchEdgeVisibility({
                shared_topic: !edgeVisibility.shared_topic,
              })
            }
          />
          Shared topics
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#c9d1d9",
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={edgeVisibility.live_match}
            onChange={() =>
              patchEdgeVisibility({ live_match: !edgeVisibility.live_match })
            }
          />
          Live match + particles
        </label>
      </div>
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "340px",
            height: "100%",
            background: "rgba(13,17,23,0.96)",
            borderLeft: "0.5px solid rgba(255,255,255,0.12)",
            padding: "24px 20px",
            overflowY: "auto",
            fontFamily: "ui-monospace, monospace",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedNodeId(null)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              color: "#8b949e",
              fontSize: 18,
            }}
          >
            ✕
          </button>
          <div style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600 }}>
            {selectedNode.title}
          </div>
          <DetailRow
            label="UMAP"
            value={`${selectedNode.umapX.toFixed(1)}, ${selectedNode.umapY.toFixed(1)}`}
          />
          <DetailRow label="3D Z" value={selectedNode.z.toFixed(1)} />
          {selectedNode.gravitySimilarity != null && (
            <DetailRow
              label="Similarity"
              value={`${selectedNode.gravitySimilarity.toFixed(3)} (${selectedNode.gravityRing})`}
            />
          )}
          {selectedConnections.map(({ other, link }) => (
            <div key={`${other.id}-${link.source}`}>{other.title}</div>
          ))}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: selectedNode ? 360 : 12,
          background: "rgba(13,17,23,0.8)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 6,
          padding: "6px 12px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: "rgba(255,255,255,0.65)",
        }}
      >
        <div>
          {projectCount} projects · {liveCallCount} live calls ·{" "}
          {graphData.links.length} edges
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)" }}>
          X/Y = UMAP coordinates · Z mode = {gravityMode ? "gravity" : zMode}
        </div>
      </div>
    </div>
  );
}
