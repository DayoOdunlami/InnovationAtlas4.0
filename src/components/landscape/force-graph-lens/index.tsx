"use client";

// ---------------------------------------------------------------------------
// <ForceGraphLens/> — canvas-native force-graph lens (Phase 3b, Part A).
//
// Public entry for both variants:
//   * variant="canvas"  — full POC-v2 UX in 2D. Used by:
//       - /canvas force-graph stage (via CanvasStageRouter)
//       - owner-scope landscape-embed blocks (editable mount)
//   * variant="detail"  — delegates to force-graph-3d for /landscape-3d
//       power-user view. Kept compatible with the existing page via a
//       `fallbackRenderer` slot so that page can hand-wire its own
//       UI if it chooses.
//
// Plan §2 constraints honoured:
//   * No sidebar, no control chrome inside the lens. A minimal top
//     bar hosts: query input(s) + layout pills + ring toggle + share
//     + Ask-JARVIS. Filter + layout switch are owned here; everything
//     else (lens rail, mic) is workbench-owned.
//   * Canvas state contract is READ ONLY from the lens. The lens
//     subscribes via `useCanvasSync` and writes back through
//     `appStore.setState({ canvas: ... lastAction })` on user actions.
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type { LandscapeData } from "@/lib/landscape/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ForceGraph2D } from "./force-graph-2d";
import { JarvisModal } from "./jarvis-modal";
import { adaptLandscapeData } from "./data-adapter";
import { useGravitySearch } from "./hooks/use-gravity-search";
import { useLandscapeData } from "./hooks/use-landscape-data";
import { useCanvasSync } from "./hooks/use-canvas-sync";
import { PRESET_QUERIES } from "./preset-queries";
import type { LensLayoutMode, LensNode } from "./types";
import { readUrlState, writeUrlState } from "./url-state";

const LAYOUT_MODES: Array<{ id: LensLayoutMode; label: string; desc: string }> =
  [
    { id: "umap", label: "UMAP", desc: "What exists" },
    { id: "web", label: "Web", desc: "Gravity · physics" },
    { id: "rings", label: "Rings", desc: "Top matches ranked" },
  ];

function QueryInputA({
  initialValue,
  onApply,
}: {
  initialValue: string;
  onApply: (q: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);
  const submit = () => {
    const q = value.trim();
    if (q) onApply(q);
  };
  return (
    <div
      className="flex flex-1 items-center border border-[#253040] border-l-[3px] border-l-[#8fe4b1] bg-[#0a0e13]"
      role="search"
    >
      <span className="px-2 pl-3 text-[11px] text-[#8fe4b1]">A</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="primary query — e.g. rail hydrogen decarbonisation"
        className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-[11px] text-[#e8ecf1] outline-none placeholder:text-[#4a5566]"
        aria-label="Gravity query A"
      />
      <button
        type="button"
        aria-label="Apply query"
        className="px-2.5 text-base text-[#8a96a8] hover:text-[#e8ecf1]"
        onClick={submit}
      >
        →
      </button>
    </div>
  );
}

export type ForceGraphLensProps = {
  variant?: "canvas" | "detail";
  initialQuery?: string | null;
  initialLayout?: LensLayoutMode;
  /** Fixed-width preview (used by block snapshot screenshots). */
  compact?: boolean;
  /** Override default landscape data — used for tests / preview. */
  landscapeOverride?: LandscapeData | null;
  /** Disable URL round-trip (e.g. when rendered inside a brief block). */
  disableUrlState?: boolean;
};

function computeSnapshotHash(data: LandscapeData | null): string {
  if (!data) return "empty";
  // Stable, cheap hash: `generatedAt` + node count; this is what the
  // snapshot loader already guarantees to be unique per rebaseline.
  return `${data.generatedAt ?? "runtime"}__${data.nodes.length}`;
}

export function ForceGraphLens(props: ForceGraphLensProps) {
  const {
    variant = "canvas",
    initialQuery = null,
    initialLayout,
    compact = false,
    landscapeOverride = null,
    disableUrlState = false,
  } = props;

  const canvasSync = useCanvasSync();
  const [layout, setLayout] = useState<LensLayoutMode>(
    () => initialLayout ?? "umap",
  );
  const [queryA, setQueryA] = useState<string | null>(
    () => initialQuery ?? canvasSync.filter.query ?? null,
  );
  const [queryB, setQueryB] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [showRings, setShowRings] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showVolumes, setShowVolumes] = useState(true);
  const [clusterLabels, setClusterLabels] = useState<Map<number, string>>(
    () => new Map(),
  );

  const hoverRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<(() => string | null) | null>(null);
  const [hoverNode, setHoverNode] = useState<LensNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisShot, setJarvisShot] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // On-boot URL round-trip — layout / queryA / queryB / focused.
  useEffect(() => {
    if (disableUrlState) return;
    const state = readUrlState();
    if (!state) return;
    if (state.qa) setQueryA(state.qa);
    if (state.qb) {
      setQueryB(state.qb);
      setCompareMode(true);
    }
    if (state.m === "compare") {
      setCompareMode(true);
    } else if (state.m === "gravity") {
      setLayout("web");
    }
    if (state.f) setFocusedId(state.f);
    if (state.t) {
      if (state.t.e !== undefined) setShowEdges(!!state.t.e);
      if (state.t.r !== undefined) setShowRings(!!state.t.r);
      if (state.t.v !== undefined) setShowVolumes(!!state.t.v);
    }
  }, [disableUrlState]);

  // Write URL on state change.
  useEffect(() => {
    if (disableUrlState) return;
    const id = setTimeout(() => {
      writeUrlState({
        m: compareMode ? "compare" : queryA ? "gravity" : "explore",
        qa: queryA,
        qb: queryB,
        f: focusedId,
        t: {
          e: showEdges ? 1 : 0,
          r: showRings ? 1 : 0,
          v: showVolumes ? 1 : 0,
          s: 0,
        },
      });
    }, 400);
    return () => clearTimeout(id);
  }, [
    disableUrlState,
    compareMode,
    queryA,
    queryB,
    focusedId,
    showEdges,
    showRings,
    showVolumes,
  ]);

  // Respond to chat-driven filter changes. The lens is a READER of
  // `appStore.canvas`; it never writes its own query back to the
  // store (that would loop), but when the agent flips the filter we
  // mirror it into the local input state.
  useEffect(() => {
    const q = canvasSync.filter.query;
    if (typeof q === "string" && q !== queryA) {
      setQueryA(q);
    }
  }, [canvasSync.filter.query, queryA]);

  const gravityA = useGravitySearch(queryA);
  // Query B is wired for future compare mode; the 2D canvas variant in
  // Phase 3b only renders gravity/explore. The hook is kept mounted so
  // flipping `compareMode` later doesn't pay the first-search cost.
  useGravitySearch(compareMode ? queryB : null);

  const { data: fetchedData } = useLandscapeData();
  const landscapeData = landscapeOverride ?? fetchedData;

  const snapshotHash = useMemo(
    () => computeSnapshotHash(landscapeData),
    [landscapeData],
  );

  const baseGraph = useMemo(() => {
    if (!landscapeData) {
      return { nodes: [], links: [] };
    }
    return adaptLandscapeData(landscapeData, {
      clusterLabels,
      seed: snapshotHash,
    });
  }, [landscapeData, clusterLabels, snapshotHash]);

  // Load cluster labels once per snapshot. If the LLM is unreachable
  // the server supplies deterministic sample-title fallbacks so labels
  // always render.
  useEffect(() => {
    if (!landscapeData || landscapeData.nodes.length === 0) return;
    let cancelled = false;
    (async () => {
      const tempGraph = adaptLandscapeData(landscapeData, {
        seed: snapshotHash,
      });
      const grouped = new Map<number, string[]>();
      for (const n of tempGraph.nodes) {
        if (n.cluster_id === undefined) continue;
        const list = grouped.get(n.cluster_id) ?? [];
        if (list.length < 8) list.push(n.title);
        grouped.set(n.cluster_id, list);
      }
      const payload = {
        snapshotHash,
        clusters: [...grouped.entries()].map(([id, sampleTitles]) => ({
          id,
          sampleTitles,
        })),
      };
      try {
        const res = await fetch("/api/landscape/cluster-labels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          labels: Record<string, string>;
        };
        if (cancelled) return;
        const map = new Map<number, string>();
        for (const [k, v] of Object.entries(body.labels)) {
          map.set(Number(k), v);
        }
        setClusterLabels(map);
      } catch {
        /* leave empty; renderer uses "Cluster N" fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [landscapeData, snapshotHash]);

  const effectiveSimilarity = gravityA.similarity;
  const effectiveLayout: LensLayoutMode = queryA ? layout : "umap";

  const handleSelect = useCallback((n: LensNode | null) => {
    setFocusedId(n?.id ?? null);
    if (!n || n.type === "query") return;
    appStore.setState((prev) => ({
      canvas: {
        ...prev.canvas,
        selectedNodeId: n.id,
        selectedNodeType: n.type === "project" ? "project" : null,
        lastAction: {
          type: "forceGraphLens/select",
          payload: { id: n.id, kind: n.type },
          result: { selectedNodeId: n.id },
          at: Date.now(),
          source: "user",
        },
      },
    }));
  }, []);

  const handleHover = useCallback(
    (n: LensNode | null, clientX: number, clientY: number) => {
      setHoverNode(n);
      if (n) setHoverPos({ x: clientX, y: clientY });
      else setHoverPos(null);
      appStore.setState((prev) => ({
        canvas: {
          ...prev.canvas,
          hoveredNodeId: n?.id ?? null,
        },
      }));
    },
    [],
  );

  const handleApplyQueryA = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setQueryA(trimmed);
      if (layout === "umap") setLayout("web");
      appStore.setState((prev) => ({
        canvas: {
          ...prev.canvas,
          filter: { ...prev.canvas.filter, query: trimmed },
          lastAction: {
            type: "forceGraphLens/setQuery",
            payload: { query: trimmed },
            result: { query: trimmed },
            at: Date.now(),
            source: "user",
          },
        },
      }));
    },
    [layout],
  );

  const handleAskJarvis = useCallback(() => {
    const shot = captureRef.current?.() ?? null;
    setJarvisShot(shot);
    setJarvisOpen(true);
  }, []);

  const handleShare = useCallback(() => {
    if (disableUrlState) return;
    writeUrlState({
      m: compareMode ? "compare" : queryA ? "gravity" : "explore",
      qa: queryA,
      qb: queryB,
      f: focusedId,
      t: {
        e: showEdges ? 1 : 0,
        r: showRings ? 1 : 0,
        v: showVolumes ? 1 : 0,
        s: 0,
      },
    });
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .catch(() => undefined);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1600);
  }, [
    compareMode,
    disableUrlState,
    focusedId,
    queryA,
    queryB,
    showEdges,
    showRings,
    showVolumes,
  ]);

  const lensVariantCls =
    variant === "detail" ? "h-[calc(100vh-3.5rem)]" : "h-full";

  return (
    <div
      className={`relative flex w-full flex-col bg-[#0a0e13] text-[#e8ecf1] ${lensVariantCls}`}
      data-testid="force-graph-lens"
      data-variant={variant}
    >
      {/* Header — query input + layout pills + share + JARVIS. The
          owner-visible controls; workbench rail remains outside. */}
      {!compact && (
        <header className="flex flex-none items-center gap-3 border-b border-[#253040] bg-[#101620] px-4 py-2 font-['JetBrains_Mono']">
          <div className="flex items-baseline gap-3">
            <span className="font-['Fraunces'] text-[15px]">
              Atlas <em className="not-italic text-[#8fe4b1]">Network</em>
            </span>
            <span className="border border-[#253040] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#8a96a8]">
              v2
            </span>
          </div>
          <QueryInputA
            initialValue={queryA ?? ""}
            onApply={handleApplyQueryA}
          />
          <div className="flex items-center gap-1">
            {LAYOUT_MODES.map((m) => {
              const active = effectiveLayout === m.id;
              const disabled = (m.id === "web" || m.id === "rings") && !queryA;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => setLayout(m.id)}
                  className={`border px-2 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                    active
                      ? "border-[#8fe4b1] bg-[#1a2230] text-[#8fe4b1]"
                      : disabled
                        ? "cursor-not-allowed border-[#253040] text-[#4a5566]"
                        : "border-[#253040] text-[#8a96a8] hover:border-[#8a96a8] hover:text-[#e8ecf1]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={showRings}
              onClick={() => setShowRings((v) => !v)}
              className={`border px-2 py-1 text-[10px] uppercase tracking-widest ${
                showRings
                  ? "border-[#8fe4b1] text-[#8fe4b1]"
                  : "border-[#253040] text-[#8a96a8] hover:text-[#e8ecf1]"
              }`}
              title="Toggle ring guides"
            >
              Rings
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShare}
              className={`border px-2 py-1.5 text-[10px] uppercase tracking-widest ${
                shareCopied
                  ? "border-[#8fe4b1] text-[#8fe4b1]"
                  : "border-[#253040] text-[#8a96a8] hover:border-[#8a96a8] hover:text-[#e8ecf1]"
              }`}
            >
              {shareCopied ? "Copied ✓" : "Share"}
            </button>
            <button
              type="button"
              onClick={handleAskJarvis}
              className="flex items-center gap-1.5 border border-[#ff6b4a] px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-[#ff6b4a] hover:bg-[#ff6b4a] hover:text-[#0a0e13]"
            >
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              Ask JARVIS
            </button>
          </div>
        </header>
      )}

      {/* Stage */}
      <div className="relative flex-1 overflow-hidden" ref={hoverRef}>
        <ForceGraph2D
          graph={baseGraph}
          layout={effectiveLayout}
          similarity={effectiveSimilarity}
          queryText={queryA}
          focusedId={focusedId}
          onHover={handleHover}
          onSelect={handleSelect}
          onViewportReady={(fn) => {
            captureRef.current = fn;
          }}
          showRings={showRings}
          showEdges={showEdges}
          showClusterVolumes={showVolumes}
        />
        {gravityA.loading && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-[11px] uppercase tracking-widest text-[#ff6b4a]">
            <div className="h-8 w-8 animate-ping rounded-full border border-[#ff6b4a]" />
            Computing relevance…
          </div>
        )}
        {hoverNode && hoverPos && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] border border-[#8fe4b1] bg-[rgba(16,22,32,0.96)] px-2.5 py-2 text-[11px] text-[#e8ecf1] backdrop-blur-sm"
            style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}
          >
            <div
              className={`mb-1 text-[9px] uppercase tracking-widest ${
                hoverNode.type === "live_call"
                  ? "text-[#f5b547]"
                  : "text-[#8a96a8]"
              }`}
            >
              {hoverNode.type === "live_call" ? "Live call" : "Project"}
              {hoverNode.cluster_label ? ` · ${hoverNode.cluster_label}` : ""}
            </div>
            <div className="mb-1 font-['Fraunces'] text-[13px] leading-snug">
              {hoverNode.title}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[10px] text-[#8a96a8]">
              <span className="text-[#4a5566]">funder</span>
              <span className="text-[#e8ecf1]">
                {hoverNode.lead_funder ?? hoverNode.funder ?? "—"}
              </span>
              {effectiveSimilarity && (
                <>
                  <span className="text-[#4a5566]">A sim</span>
                  <span className="text-[#8fe4b1]">
                    {Math.round(
                      (effectiveSimilarity.get(hoverNode.id) ?? 0) * 100,
                    )}
                    %
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preset pills — only in canvas variant. */}
      {!compact && variant === "canvas" && (
        <div className="flex flex-none items-center gap-1 overflow-x-auto border-t border-[#253040] bg-[#101620] px-4 py-1.5 font-['JetBrains_Mono']">
          <span className="mr-2 text-[9px] uppercase tracking-widest text-[#8a96a8]">
            Try a query
          </span>
          {PRESET_QUERIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="whitespace-nowrap border border-[#253040] px-2 py-1 text-[10px] text-[#e8ecf1] hover:border-[#8a96a8] hover:bg-[#1a2230]"
              onClick={() => handleApplyQueryA(p.query)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer / legend */}
      {!compact && (
        <footer className="flex flex-none items-center justify-between border-t border-[#253040] bg-[#101620] px-4 py-1.5 text-[10px] text-[#8a96a8]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#8fe4b1]" />{" "}
              Project
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#f5b547]" />{" "}
              Live call
            </span>
            {queryA && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-[#8fe4b1]" />{" "}
                Query A affinity
              </span>
            )}
          </div>
          <div className="uppercase tracking-widest">
            MODE · {queryA ? (compareMode ? "COMPARE" : "GRAVITY") : "EXPLORE"}{" "}
            · {queryA ? `A="${queryA.slice(0, 18)}"` : "UMAP"}
          </div>
        </footer>
      )}

      <JarvisModal
        open={jarvisOpen}
        screenshot={jarvisShot}
        context={{
          mode: queryA ? (compareMode ? "compare" : "gravity") : "explore",
          queryA,
          queryB,
          focused:
            focusedId && baseGraph.nodes.find((n) => n.id === focusedId)?.title,
          nodeCount: baseGraph.nodes.length,
        }}
        onClose={() => setJarvisOpen(false)}
      />
    </div>
  );
}
