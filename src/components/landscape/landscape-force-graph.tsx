"use client";

import type {
  LandscapeData,
  LandscapeLiveCall,
  LandscapeProject,
} from "@/app/api/landscape/data/route";
import type { ProjectEdge } from "@/app/api/landscape/edges/route";
import { LandscapeGraphDevPanel } from "@/components/landscape/landscape-graph-dev-panel";
import {
  loadLandscapeGraphDevSettings,
  saveLandscapeGraphDevSettings,
  type LandscapeGraphDevSettings,
  type LandscapePhysicsMode,
} from "@/components/landscape/landscape-graph-dev-settings";
import {
  NodeDetailPanel,
  type SelectedNode,
} from "@/components/landscape/node-detail-panel";
import { Button } from "@/components/ui/button";
import { forceCollide } from "d3-force";
import {
  AlertCircle,
  Loader2,
  Maximize2,
  RefreshCw,
  Settings,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ForceGraph2D — no SSR (canvas API)
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => m.default),
  { ssr: false },
);

// ── Types ──────────────────────────────────────────────────────────────────

type FGNode = {
  id: string;
  _type: "project" | "live";
  label: string;
  /** Set when Group by ≠ Semantic — drives centroid cluster force */
  _clusterGroup?: string;
  // runtime positions mutated by d3 simulation
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
  radius: number;
  color: string;
  filtered: boolean; // true = faded (non-matching mode filter)
  data: LandscapeProject | LandscapeLiveCall;
};

type FGLink = {
  source: string | FGNode;
  target: string | FGNode;
  weight: number;
  edge_type: string;
};

type GraphMethods = {
  zoom: (k: number, duration?: number) => void;
  zoomToFit: (duration?: number, padding?: number) => void;
  centerAt: (x?: number, y?: number, duration?: number) => void;
  d3Force: (name: string, force?: unknown | null) => unknown;
  d3ReheatSimulation: () => void;
  refresh: () => void;
};

// ── Visual helpers ─────────────────────────────────────────────────────────

function nodeRadius(score: number | null | undefined): number {
  if (score == null) return 7;
  return 5 + Math.max(0, Math.min(1, score)) * 10; // [5, 15]
}

function edgeColor(edge_type: string): string {
  switch (edge_type) {
    case "shared_org":
      return "#6366f1"; // indigo
    case "semantic":
      return "#8b5cf6"; // violet
    case "live_call":
      return "#f59e0b"; // amber  (call → project)
    case "live_call_similarity":
      return "#ea580c"; // orange (call → call)
    default:
      return "#a78bfa"; // shared_topic
  }
}

function edgeBaseOpacity(edge_type: string): number {
  switch (edge_type) {
    case "shared_org":
      return 0.5;
    case "semantic":
      return 0.35;
    case "live_call":
      return 0.5;
    case "live_call_similarity":
      return 0.55;
    default:
      return 0.2; // shared_topic
  }
}

function edgeLineWidth(edge_type: string): number {
  switch (edge_type) {
    case "shared_org":
    case "live_call":
    case "live_call_similarity":
      return 1.5;
    default:
      return 1;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function nodeId(n: string | FGNode): string {
  return typeof n === "string" ? n : n.id;
}

/** Edge types that participate in the D3 link force (sparse layout layer). */
const LAYOUT_PHYSICS_TYPES = new Set(["shared_org", "semantic"]);

export type LandscapeGroupBy = "semantic" | "funder" | "theme";

export type { LandscapePhysicsMode } from "@/components/landscape/landscape-graph-dev-settings";

function gridCentroidPositions(
  count: number,
  width: number,
  height: number,
  padding = 72,
): { x: number; y: number }[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (width - 2 * padding) / cols;
  const cellH = (height - 2 * padding) / rows;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push({
      x: padding + col * cellW + cellW / 2,
      y: padding + row * cellH + cellH / 2,
    });
  }
  return out;
}

function inferThemeFromProject(p: LandscapeProject): string {
  const t = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
  if (t.includes("autonomy") || t.includes("autonomous")) return "autonomy";
  if (
    t.includes("decarbonisation") ||
    t.includes("decarbonization") ||
    t.includes("net-zero") ||
    t.includes("net zero") ||
    t.includes("decarbon")
  ) {
    return "decarbonisation";
  }
  if (t.includes("safety")) return "safety";
  if (
    t.includes("digital") ||
    t.includes("digitisation") ||
    t.includes("digitization")
  ) {
    return "digital";
  }
  if (t.includes("connectivity") || t.includes("connected"))
    return "connectivity";
  return "other";
}

function inferThemeFromLive(c: LandscapeLiveCall): string {
  const t = `${c.title ?? ""} ${c.description ?? ""}`.toLowerCase();
  if (t.includes("autonomy") || t.includes("autonomous")) return "autonomy";
  if (
    t.includes("decarbonisation") ||
    t.includes("decarbonization") ||
    t.includes("net-zero") ||
    t.includes("net zero") ||
    t.includes("decarbon")
  ) {
    return "decarbonisation";
  }
  if (t.includes("safety")) return "safety";
  if (
    t.includes("digital") ||
    t.includes("digitisation") ||
    t.includes("digitization")
  ) {
    return "digital";
  }
  if (t.includes("connectivity") || t.includes("connected"))
    return "connectivity";
  return "other";
}

type ClusterSpec = {
  centroids: Record<string, { x: number; y: number }>;
  keyForProject: (p: LandscapeProject) => string;
  keyForLive: (c: LandscapeLiveCall) => string;
};

function makeClusterForce(
  centroids: Record<string, { x: number; y: number }>,
  pull: number,
) {
  let simNodes: FGNode[] = [];
  const force = (alpha: number) => {
    for (const node of simNodes) {
      const g = node._clusterGroup;
      if (!g) continue;
      const centre = centroids[g];
      if (!centre || node.x == null || node.y == null) continue;
      node.vx = (node.vx ?? 0) + (centre.x - node.x) * alpha * pull;
      node.vy = (node.vy ?? 0) + (centre.y - node.y) * alpha * pull;
    }
  };
  force.initialize = (init: FGNode[]) => {
    simNodes = init;
  };
  return force;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface LandscapeForceGraphProps {
  modeFilter: string;
  showLiveCalls: boolean;
  searchTerm: string;
  searchTrigger: number; // increments when user presses Enter to zoom to first match
  groupBy: LandscapeGroupBy;
  /** Guided demo: zoom to this node when `demoZoomTrigger` changes. */
  demoZoomNodeId?: string | null;
  demoZoomTrigger?: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export const LandscapeForceGraph = memo(function LandscapeForceGraph({
  modeFilter,
  showLiveCalls,
  searchTerm,
  searchTrigger,
  groupBy,
  demoZoomNodeId,
  demoZoomTrigger = 0,
}: LandscapeForceGraphProps) {
  const [data, setData] = useState<LandscapeData | null>(null);
  const [edges, setEdges] = useState<ProjectEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  /** umap = pinned embedding; hybrid = short sim then pin; live = long-running sim */
  const [physicsMode, setPhysicsMode] = useState<LandscapePhysicsMode>("umap");
  const [hybridSettled, setHybridSettled] = useState(true);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devSettings, setDevSettings] = useState<LandscapeGraphDevSettings>(
    () => loadLandscapeGraphDevSettings(),
  );
  /** Pointer/hover/click — enabled after engine settles or first tick (perf). */
  const [pointerReady, setPointerReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphMethods | null>(null);
  const dashOffsetRef = useRef(0);
  const animFrameRef = useRef(0);
  const currentZoomRef = useRef(1);
  // Fires zoomToFit only once after the very first simulation — never on filter/nav changes
  const hasInitialFit = useRef(false);
  // Stores pinned positions so they survive filter-change re-renders
  const pinnedPositions = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  // Ref to current live nodes so onEngineStop can read mutated positions
  const nodesRef = useRef<FGNode[]>([]);
  const displayEdgesRef = useRef<ProjectEdge[]>([]);
  const prevGroupByRef = useRef<LandscapeGroupBy | undefined>(undefined);
  const livePointerPrimed = useRef(false);
  const physicsModeRef = useRef(physicsMode);
  physicsModeRef.current = physicsMode;
  const hybridSettledRef = useRef(hybridSettled);
  hybridSettledRef.current = hybridSettled;
  const devSettingsRef = useRef(devSettings);
  devSettingsRef.current = devSettings;

  const patchDevSettings = useCallback(
    (patch: Partial<LandscapeGraphDevSettings>) => {
      setDevSettings((prev) => {
        const next = { ...prev, ...patch };
        saveLandscapeGraphDevSettings(next);
        return next;
      });
    },
    [],
  );

  // ── Data loading ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEdges([]);
    setPointerReady(false);
    livePointerPrimed.current = false;
    hasInitialFit.current = false;
    try {
      const dataRes = await fetch("/api/landscape/data");
      if (!dataRes.ok) throw new Error(`Data HTTP ${dataRes.status}`);
      const d = await dataRes.json();
      setData(d);
      setLoading(false);

      await new Promise((r) =>
        setTimeout(r, devSettingsRef.current.progressiveEdgeDelayMs),
      );
      try {
        const edgesRes = await fetch("/api/landscape/edges");
        const e = edgesRes.ok
          ? await edgesRes.json()
          : { edges: [] as ProjectEdge[] };
        setEdges((e as { edges: ProjectEdge[] }).edges ?? []);
      } catch {
        setEdges([]);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Fallback: pinned / fast-stop modes can miss onEngineStop — unlock pointer
  useEffect(() => {
    if (!data || !dims || physicsMode === "live") return;
    const t = window.setTimeout(() => setPointerReady(true), 1200);
    return () => window.clearTimeout(t);
  }, [data, dims, physicsMode]);

  // ── Container size (RAF so h-full is resolved after paint) ────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e && e.contentRect.width > 0 && e.contentRect.height > 0) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    obs.observe(el);
    const rafId = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        setDims({ w: rect.width, h: rect.height });
    });
    return () => {
      cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, []);

  // ── Animated dash offset — only while live layout or node hover (saves GPU) ─

  const needsDashAnimation =
    physicsMode === "live" ||
    (physicsMode === "hybrid" && !hybridSettled) ||
    hoveredNodeId !== null;

  useEffect(() => {
    if (!needsDashAnimation) return;
    const tick = () => {
      dashOffsetRef.current -= 0.3;
      graphRef.current?.refresh();
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [needsDashAnimation]);

  // ── Adjacency map for hover highlight ─────────────────────────────────

  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    edges.forEach((e) => {
      if (!map.has(e.source_id)) map.set(e.source_id, new Set());
      if (!map.has(e.target_id)) map.set(e.target_id, new Set());
      map.get(e.source_id)!.add(e.target_id);
      map.get(e.target_id)!.add(e.source_id);
    });
    return map;
  }, [edges]);

  // ── Search match IDs ───────────────────────────────────────────────────

  const searchMatchIds = useMemo((): Set<string> | null => {
    if (!searchTerm.trim() || !data) return null;
    const term = searchTerm.toLowerCase();
    const ids = new Set<string>();
    data.projects.forEach((p) => {
      if (p.title.toLowerCase().includes(term)) ids.add(p.id);
    });
    data.liveCalls.forEach((c) => {
      if (c.title.toLowerCase().includes(term)) ids.add(c.id);
    });
    return ids;
  }, [searchTerm, data]);

  // ── Zoom to first search match when user presses Enter ─────────────────

  useEffect(() => {
    if (searchTrigger === 0 || !searchMatchIds?.size) return;
    const firstMatch = nodesRef.current.find((n) => searchMatchIds.has(n.id));
    if (firstMatch?.x !== undefined) {
      graphRef.current?.centerAt(firstMatch.x, firstMatch.y, 800);
      graphRef.current?.zoom(6, 800);
    }
  }, [searchTrigger, searchMatchIds]);

  useEffect(() => {
    if (!demoZoomTrigger || !demoZoomNodeId?.trim()) return;
    const node = nodesRef.current.find((n) => n.id === demoZoomNodeId);
    if (node?.x !== undefined && node.y !== undefined) {
      graphRef.current?.centerAt(node.x, node.y, 800);
      graphRef.current?.zoom(4, 800);
    }
  }, [demoZoomTrigger, demoZoomNodeId]);

  // ── Cluster centroids (Funder / Theme) — not used in Semantic mode ─────

  const clusterSpec = useMemo((): ClusterSpec | null => {
    if (!data || !dims || groupBy === "semantic") return null;
    if (groupBy === "theme") {
      const keys = [
        "autonomy",
        "decarbonisation",
        "safety",
        "digital",
        "connectivity",
        "other",
      ];
      const pts = gridCentroidPositions(keys.length, dims.w, dims.h);
      const centroids: Record<string, { x: number; y: number }> = {};
      keys.forEach((k, i) => {
        centroids[k] = pts[i]!;
      });
      return {
        centroids,
        keyForProject: inferThemeFromProject,
        keyForLive: inferThemeFromLive,
      };
    }
    // Funder — top 11 funders by node count + Other
    const counts = new Map<string, number>();
    for (const p of data.projects) {
      const k = (p.lead_funder ?? "").trim() || "Unknown";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (showLiveCalls) {
      for (const c of data.liveCalls) {
        const k = (c.funder ?? "").trim() || "Unknown";
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const TOP = 11;
    const topKeys = sorted.slice(0, TOP).map(([k]) => k);
    const topSet = new Set(topKeys);
    const keys = [...topKeys, "Other"];
    const pts = gridCentroidPositions(keys.length, dims.w, dims.h);
    const centroids: Record<string, { x: number; y: number }> = {};
    keys.forEach((k, i) => {
      centroids[k] = pts[i]!;
    });
    return {
      centroids,
      keyForProject: (p) => {
        const g = (p.lead_funder ?? "").trim() || "Unknown";
        return topSet.has(g) ? g : "Other";
      },
      keyForLive: (c) => {
        const g = (c.funder ?? "").trim() || "Unknown";
        return topSet.has(g) ? g : "Other";
      },
    };
  }, [data, dims, groupBy, showLiveCalls]);

  // ── Build nodes, physics links, and display-only edges ─────────────────

  const { nodes, layoutLinks, displayEdges } = useMemo(() => {
    if (!data) {
      return {
        nodes: [] as FGNode[],
        layoutLinks: [] as FGLink[],
        displayEdges: [] as ProjectEdge[],
      };
    }

    const isFiltered = (p: LandscapeProject) =>
      modeFilter === "All" ||
      (p.cpc_modes ?? "").toLowerCase().includes(modeFilter.toLowerCase());

    const makeNode = (
      id: string,
      type: "project" | "live",
      label: string,
      vizX: number,
      vizY: number,
      radius: number,
      color: string,
      filtered: boolean,
      nodeData: LandscapeProject | LandscapeLiveCall,
      clusterKey?: string,
    ): FGNode => {
      const pinned = pinnedPositions.current.get(id);
      const scale = devSettings.umapScale;
      const ux = vizX * scale;
      const uy = vizY * scale;
      const bx = pinned?.x ?? ux;
      const by = pinned?.y ?? uy;

      const pinUmapStatic = physicsMode === "umap" && !clusterSpec;

      if (pinUmapStatic) {
        // Default: instant UMAP — pin embedding (or saved drag position)
        return {
          id,
          _type: type,
          label,
          _clusterGroup: clusterKey,
          x: bx,
          y: by,
          fx: bx,
          fy: by,
          radius,
          color,
          filtered,
          data: nodeData,
        };
      }

      // Live layout OR funder/theme cluster: free unless individually pinned (drag)
      return {
        id,
        _type: type,
        label,
        _clusterGroup: clusterKey,
        x: bx,
        y: by,
        fx: pinned !== undefined ? pinned.x : undefined,
        fy: pinned !== undefined ? pinned.y : undefined,
        radius,
        color,
        filtered,
        data: nodeData,
      };
    };

    const nodes: FGNode[] = [
      ...data.projects.map((p) =>
        makeNode(
          p.id,
          "project",
          p.title,
          Number(p.viz_x),
          Number(p.viz_y),
          nodeRadius(p.transport_relevance_score),
          "#3b82f6",
          !isFiltered(p),
          p,
          clusterSpec ? clusterSpec.keyForProject(p) : undefined,
        ),
      ),
      ...(showLiveCalls
        ? data.liveCalls.map((c) =>
            makeNode(
              c.id,
              "live",
              c.title || c.funder || "Live call",
              Number(c.viz_x),
              Number(c.viz_y),
              8,
              "#f59e0b",
              false,
              c,
              clusterSpec ? clusterSpec.keyForLive(c) : undefined,
            ),
          )
        : []),
    ];

    const nodeIds = new Set(nodes.map((n) => n.id));

    const passesNodes = (e: ProjectEdge) =>
      nodeIds.has(e.source_id) && nodeIds.has(e.target_id);

    const layoutLinks: FGLink[] = edges
      .filter((e) => passesNodes(e) && LAYOUT_PHYSICS_TYPES.has(e.edge_type))
      .map((e) => ({
        source: e.source_id,
        target: e.target_id,
        weight: e.weight,
        edge_type: e.edge_type,
      }));

    const displayEdges: ProjectEdge[] = edges.filter((e) => {
      if (!passesNodes(e)) return false;
      if (LAYOUT_PHYSICS_TYPES.has(e.edge_type)) return false;
      return true;
    });

    return { nodes, layoutLinks, displayEdges };
  }, [
    data,
    edges,
    modeFilter,
    showLiveCalls,
    clusterSpec,
    physicsMode,
    devSettings.umapScale,
    groupBy,
  ]);

  useEffect(() => {
    displayEdgesRef.current = displayEdges;
  }, [displayEdges]);

  // Keep nodesRef in sync so onEngineStop can read mutated positions
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // ── Configure d3 forces + optional cluster centroid pull ───────────────

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !data) return;
    const groupByChanged =
      prevGroupByRef.current !== undefined &&
      prevGroupByRef.current !== groupBy;
    prevGroupByRef.current = groupBy;
    if (groupByChanged) {
      nodesRef.current.forEach((n) => {
        n.fx = undefined;
        n.fy = undefined;
      });
    }
    const ds = devSettings;
    try {
      (
        fg.d3Force("charge") as { strength: (v: number) => unknown } | null
      )?.strength(ds.chargeStrength);
      (
        fg.d3Force("link") as {
          distance: (fn: (l: unknown) => number) => unknown;
        } | null
      )?.distance((l: unknown) => {
        const link = l as FGLink;
        return (
          ds.linkDistanceBase *
          (1 - Math.min((link.weight as number) || 0.5, 1))
        );
      });
      fg.d3Force(
        "collision",
        forceCollide((n: unknown) => (n as FGNode).radius + ds.collisionExtra),
      );

      if (groupBy === "semantic" || !clusterSpec) {
        fg.d3Force("cluster", null);
      } else {
        fg.d3Force(
          "cluster",
          makeClusterForce(clusterSpec.centroids, ds.clusterPull),
        );
      }

      fg.d3ReheatSimulation();
    } catch {
      // Ignore — forces may not be ready yet on first mount
    }
  }, [data, groupBy, clusterSpec, layoutLinks, devSettings]);

  // ── onEngineStop: save positions so subsequent renders preserve layout ─

  const handleEngineStop = useCallback(() => {
    if (physicsModeRef.current !== "live") {
      nodesRef.current.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          pinnedPositions.current.set(n.id, { x: n.x, y: n.y });
          n.fx = n.x;
          n.fy = n.y;
        }
      });
    }
    if (physicsModeRef.current === "hybrid") {
      hybridSettledRef.current = true;
      setHybridSettled(true);
    }
    setPointerReady(true);
    if (!hasInitialFit.current) {
      const ds = devSettingsRef.current;
      graphRef.current?.zoomToFit(ds.zoomFitDurationMs, ds.zoomFitPaddingPx);
      hasInitialFit.current = true;
    }
  }, []);

  const applyPhysicsMode = useCallback((next: LandscapePhysicsMode) => {
    const prev = physicsModeRef.current;
    if (next === "live" || next === "hybrid") {
      pinnedPositions.current.clear();
    } else if (next === "umap" && prev !== "umap") {
      nodesRef.current.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          pinnedPositions.current.set(n.id, { x: n.x, y: n.y });
        }
      });
    }
    livePointerPrimed.current = false;
    setPointerReady(false);
    if (next === "hybrid") {
      hybridSettledRef.current = false;
      setHybridSettled(false);
    }
    setPhysicsMode(next);
  }, []);

  const handleEngineTick = useCallback(() => {
    const mode = physicsModeRef.current;
    const hybridSim = mode === "hybrid" && !hybridSettledRef.current;
    if ((mode === "live" || hybridSim) && !livePointerPrimed.current) {
      livePointerPrimed.current = true;
      setPointerReady(true);
    }
  }, []);

  // ── Canvas: node drawing ───────────────────────────────────────────────

  const paintNode = useCallback(
    (node: unknown, ctx: CanvasRenderingContext2D, globalScale?: number) => {
      const n = node as FGNode;
      const gs =
        typeof globalScale === "number" && globalScale > 0 ? globalScale : 1;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const r = n.radius;
      const isHovered = n.id === hoveredNodeId;
      const isNeighbour = hoveredNodeId
        ? (adjacencyMap.get(hoveredNodeId)?.has(n.id) ?? false)
        : false;
      const isSearchMatch = searchMatchIds !== null && searchMatchIds.has(n.id);

      let alpha: number;
      if (searchMatchIds !== null) {
        alpha = isSearchMatch ? 1 : 0.05;
      } else if (hoveredNodeId !== null) {
        alpha = isHovered || isNeighbour ? 1 : 0.1;
      } else {
        alpha = n.filtered ? 0.1 : 1;
      }

      const drawRadius = isHovered ? r + 2 : r;
      const lod = devSettings;
      const dotLod =
        lod.lodEnabled && lod.lodNodeDotBelow > 0 && gs < lod.lodNodeDotBelow;

      ctx.save();
      ctx.globalAlpha = alpha;

      // LOD — zoomed out: tiny dot (cheap)
      if (dotLod) {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        return;
      }

      if (n._type === "live") {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.moveTo(x, y - drawRadius);
        ctx.lineTo(x + drawRadius, y);
        ctx.lineTo(x, y + drawRadius);
        ctx.lineTo(x - drawRadius, y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(x, y, drawRadius, 0, 2 * Math.PI);
        ctx.fill();
      }

      if (isHovered) {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2 / gs;
        ctx.globalAlpha = 1;
        if (n._type === "live") {
          const rr = drawRadius + 2;
          ctx.beginPath();
          ctx.moveTo(x, y - rr);
          ctx.lineTo(x + rr, y);
          ctx.lineTo(x, y + rr);
          ctx.lineTo(x - rr, y);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, drawRadius + 2, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }

      if (isSearchMatch) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2 / gs;
        ctx.globalAlpha = 1;
        if (n._type === "live") {
          const rr = drawRadius + 2;
          ctx.beginPath();
          ctx.moveTo(x, y - rr);
          ctx.lineTo(x + rr, y);
          ctx.lineTo(x, y + rr);
          ctx.lineTo(x - rr, y);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, drawRadius + 2, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }

      const showLabel = !lod.lodEnabled
        ? gs > 2.2
        : lod.lodLabelAbove <= 0
          ? true
          : gs > lod.lodLabelAbove;
      if (showLabel) {
        const raw =
          n._type === "project" ? (n.data as LandscapeProject).title : n.label;
        const label = (raw ?? "").slice(0, 24);
        if (label) {
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.font = `${Math.max(7, 10 / gs)}px system-ui, sans-serif`;
          ctx.fillStyle = "#334155";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + drawRadius + 4 / gs, y);
        }
      }

      ctx.restore();
    },
    [hoveredNodeId, adjacencyMap, searchMatchIds, devSettings],
  );

  // ── Canvas: link drawing ───────────────────────────────────────────────

  const paintLink = useCallback(
    (link: unknown, ctx: CanvasRenderingContext2D, globalScale?: number) => {
      const gs =
        typeof globalScale === "number" && globalScale > 0 ? globalScale : 1;
      const lod = devSettings;
      if (
        lod.lodEnabled &&
        lod.lodHideLinksBelow > 0 &&
        gs < lod.lodHideLinksBelow
      ) {
        return;
      }

      const l = link as FGLink;
      const src = l.source as FGNode;
      const tgt = l.target as FGNode;
      if (src.x == null || tgt.x == null) return;

      const srcId = nodeId(l.source);
      const tgtId = nodeId(l.target);

      let opacity = edgeBaseOpacity(l.edge_type);
      if (hoveredNodeId !== null) {
        if (srcId === hoveredNodeId || tgtId === hoveredNodeId) {
          opacity = Math.min(1, opacity * 2.5);
        } else {
          opacity = 0.03;
        }
      }

      ctx.save();
      ctx.strokeStyle = hexToRgba(edgeColor(l.edge_type), opacity);
      ctx.lineWidth = Math.max(0.35, edgeLineWidth(l.edge_type) / gs);

      const animated =
        l.edge_type === "semantic" ||
        l.edge_type === "live_call" ||
        l.edge_type === "live_call_similarity";

      switch (l.edge_type) {
        case "shared_org":
          ctx.setLineDash([]);
          break;
        case "semantic":
          ctx.setLineDash([4, 4]);
          break;
        case "live_call":
          ctx.setLineDash([6, 3]);
          break;
        case "live_call_similarity":
          ctx.setLineDash([8, 4]);
          break;
        default:
          ctx.setLineDash([1, 3]);
      }
      if (animated) ctx.lineDashOffset = dashOffsetRef.current;

      ctx.beginPath();
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.stroke();
      ctx.restore();
    },
    [hoveredNodeId, devSettings],
  );

  /** Display-only edges (no link force) — drawn beneath layout links + nodes */
  const paintDisplayEdgesPre = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      const lod = devSettings;
      if (
        lod.lodEnabled &&
        lod.lodHideDisplayBelow > 0 &&
        globalScale < lod.lodHideDisplayBelow
      ) {
        return;
      }

      const pos = new Map<string, { x: number; y: number }>();
      for (const n of nodesRef.current) {
        if (n.x != null && n.y != null) pos.set(n.id, { x: n.x, y: n.y });
      }
      const edgesLocal = displayEdgesRef.current;
      if (!edgesLocal.length) return;

      for (const e of edgesLocal) {
        const p0 = pos.get(e.source_id);
        const p1 = pos.get(e.target_id);
        if (!p0 || !p1) continue;

        let opacity = edgeBaseOpacity(e.edge_type);
        if (hoveredNodeId !== null) {
          if (e.source_id === hoveredNodeId || e.target_id === hoveredNodeId) {
            opacity = Math.min(1, opacity * 2.5);
          } else {
            opacity = 0.03;
          }
        }

        ctx.save();
        ctx.strokeStyle = hexToRgba(edgeColor(e.edge_type), opacity);
        ctx.lineWidth = Math.max(
          0.35,
          edgeLineWidth(e.edge_type) / globalScale,
        );

        const animated =
          e.edge_type === "live_call" || e.edge_type === "live_call_similarity";
        switch (e.edge_type) {
          case "live_call":
            ctx.setLineDash([6, 3]);
            break;
          case "live_call_similarity":
            ctx.setLineDash([8, 4]);
            break;
          default:
            ctx.setLineDash([1, 3]);
        }
        if (animated) ctx.lineDashOffset = dashOffsetRef.current;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
      }
    },
    [hoveredNodeId, devSettings],
  );

  // ── Zoom helpers ───────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    graphRef.current?.zoom(
      currentZoomRef.current * 1.5,
      devSettingsRef.current.zoomFitDurationMs,
    );
  }, []);

  const zoomOut = useCallback(() => {
    graphRef.current?.zoom(
      currentZoomRef.current * 0.67,
      devSettingsRef.current.zoomFitDurationMs,
    );
  }, []);

  const zoomFit = useCallback(() => {
    const ds = devSettingsRef.current;
    graphRef.current?.zoomToFit(
      ds.zoomFitDurationMs,
      ds.manualZoomFitPaddingPx,
    );
  }, []);

  const engineTicks = useMemo(() => {
    const ds = devSettings;
    if (physicsMode === "umap") {
      return {
        warmupTicks: ds.warmupTicksUmap,
        cooldownTicks: ds.cooldownTicksUmap,
        cooldownTime: ds.cooldownTimeUmap,
      };
    }
    if (physicsMode === "hybrid") {
      return {
        warmupTicks: ds.warmupTicksHybrid,
        cooldownTicks: ds.cooldownTicksHybrid,
        cooldownTime: ds.cooldownTimeHybrid,
      };
    }
    return {
      warmupTicks: ds.warmupTicksLive,
      cooldownTicks:
        ds.cooldownTicksLive >= 1e6
          ? Number.POSITIVE_INFINITY
          : ds.cooldownTicksLive,
      cooldownTime: ds.cooldownTimeLive,
    };
  }, [physicsMode, devSettings]);

  // ── Render ─────────────────────────────────────────────────────────────

  const showOverlay = !!error || !dims || (loading && !data);

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      {/* ── Overlay: loading / error ── */}
      {showOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground z-20">
          {loading || !dims ? (
            <>
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">Loading force graph…</p>
            </>
          ) : (
            <>
              <AlertCircle className="size-8 text-destructive" />
              <p className="text-sm">{error ?? "No data"}</p>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="size-3 mr-2" /> Retry
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      {!showOverlay && data && (
        <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground bg-card/80 backdrop-blur-sm rounded-md px-2 py-1.5 pointer-events-none max-w-[420px]">
          {/* Node types */}
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5" fill="#3b82f6" fillOpacity={0.75} />
            </svg>
            Projects ({data.projects.length})
          </span>
          {showLiveCalls && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 16 16">
                <polygon
                  points="8,2 14,8 8,14 2,8"
                  fill="#f59e0b"
                  fillOpacity={0.9}
                />
              </svg>
              Live calls ({data.liveCalls.length})
            </span>
          )}
          {/* Edge types */}
          <span
            className="flex items-center gap-1"
            title="Projects from the same lead organisation"
          >
            <svg width="20" height="6" viewBox="0 0 20 6">
              <line
                x1="0"
                y1="3"
                x2="20"
                y2="3"
                stroke="#6366f1"
                strokeWidth="2"
              />
            </svg>
            Shared org
          </span>
          <span
            className="flex items-center gap-1"
            title="Semantically similar projects (cosine > 0.85)"
          >
            <svg width="20" height="6" viewBox="0 0 20 6">
              <line
                x1="0"
                y1="3"
                x2="20"
                y2="3"
                stroke="#8b5cf6"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </svg>
            Semantic
          </span>
          {showLiveCalls && (
            <>
              <span
                className="flex items-center gap-1"
                title="Live call linked to a similar project"
              >
                <svg width="20" height="6" viewBox="0 0 20 6">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                  />
                </svg>
                Call→Project
              </span>
              <span
                className="flex items-center gap-1"
                title="Similar live calls (cosine > 0.75)"
              >
                <svg width="20" height="6" viewBox="0 0 20 6">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    stroke="#ea580c"
                    strokeWidth="1.5"
                    strokeDasharray="8 4"
                  />
                </svg>
                Call→Call
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Physics mode + dev tuning ── */}
      {!showOverlay && data && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-md border border-border/60 bg-card/90 backdrop-blur-sm px-2 py-1 shadow-sm">
          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            Layout
          </span>
          {(
            [
              ["umap", "UMAP"],
              ["hybrid", "Hybrid"],
              ["live", "Live"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPhysicsMode(id)}
              className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                physicsMode === id
                  ? id === "live"
                    ? "bg-violet-600 text-white"
                    : "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            title="Dev tuning (session)"
            aria-label="Open force graph dev settings"
            onClick={() => setDevPanelOpen(true)}
            className="ml-0.5 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      )}

      <LandscapeGraphDevPanel
        open={devPanelOpen}
        onOpenChange={setDevPanelOpen}
        physicsMode={physicsMode}
        onPhysicsModeChange={applyPhysicsMode}
        settings={devSettings}
        onSettingsChange={patchDevSettings}
      />

      {/* ── Zoom controls + refresh ── */}
      <div className="absolute top-1 right-1 z-10 flex flex-col gap-1">
        <Button variant="ghost" size="icon" onClick={load} title="Refresh data">
          <RefreshCw className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={zoomIn} title="Zoom in">
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={zoomOut} title="Zoom out">
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={zoomFit}
          title="Fit all nodes"
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>

      {/* ── Force graph canvas ── */}
      {dims && data && (
        <ForceGraph2D
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={graphRef as any}
          width={dims.w}
          height={dims.h}
          graphData={{ nodes, links: layoutLinks }}
          nodeId="id"
          nodeVal={(node) => (node as FGNode).radius ** 2}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          linkCanvasObject={paintLink}
          linkCanvasObjectMode={() => "replace"}
          onRenderFramePre={paintDisplayEdgesPre}
          onNodeClick={(node) => {
            const n = node as FGNode;
            // Pan + zoom to clicked node (Improvement 4)
            if (n.x !== undefined) {
              graphRef.current?.centerAt(n.x, n.y, 800);
              graphRef.current?.zoom(4, 800);
            }
            if (n._type === "project") {
              setSelectedNode({
                _type: "project",
                ...(n.data as LandscapeProject),
              });
            } else {
              setSelectedNode({
                _type: "live",
                ...(n.data as LandscapeLiveCall),
              });
            }
          }}
          onNodeHover={(node) => {
            setHoveredNodeId(node ? (node as FGNode).id : null);
            if (containerRef.current) {
              containerRef.current.style.cursor = node ? "pointer" : "default";
            }
          }}
          onNodeDragEnd={(node) => {
            const n = node as FGNode;
            n.fx = n.x;
            n.fy = n.y;
            if (n.x !== undefined && n.y !== undefined) {
              pinnedPositions.current.set(n.id, { x: n.x, y: n.y });
            }
          }}
          onZoom={(transform) => {
            currentZoomRef.current = (transform as { k: number }).k;
          }}
          onEngineTick={handleEngineTick}
          onEngineStop={handleEngineStop}
          warmupTicks={engineTicks.warmupTicks}
          cooldownTicks={engineTicks.cooldownTicks}
          cooldownTime={engineTicks.cooldownTime}
          autoPauseRedraw={!needsDashAnimation}
          enablePointerInteraction={pointerReady}
          nodeLabel={(node) => {
            const n = node as FGNode;
            if (n._type === "live") {
              const c = n.data as LandscapeLiveCall;
              const parts = [n.label];
              if (c.funder) parts.push(c.funder);
              if (c.deadline) parts.push(`Closes ${c.deadline}`);
              return parts.join(" · ");
            }
            const p = n.data as LandscapeProject;
            const funder = p.lead_funder ?? "";
            const amount = p.funding_amount;
            const amountStr =
              amount != null
                ? ` · ${Number(amount) >= 1e6 ? `£${(Number(amount) / 1e6).toFixed(1)}M` : `£${amount}`}`
                : "";
            return `${n.label}${funder ? ` · ${funder}` : ""}${amountStr}`;
          }}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.4}
        />
      )}

      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
});
