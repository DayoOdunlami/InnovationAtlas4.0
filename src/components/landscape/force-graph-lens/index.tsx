"use client";

// ---------------------------------------------------------------------------
// <ForceGraphLens/> — Phase 3d shell.
//
// Primary renderer is now `ForceGraph3DNative` (POC-faithful Three.js).
// The 2D renderer is kept as an **automatic fallback** when WebGL2 is
// unavailable — detection is implicit (no feature flag) per §1 of the
// Phase 3d execution prompt.
//
// The shell:
//   * wires real landscape data + similarity maps to the renderer
//   * owns left/right chrome (layout modes, toggles, z-axis, presets,
//     focused detail, session log) — the full POC surface
//   * exposes a theme (dark | light | print) via `ThemeCssVars` on
//     the wrapper so descendants + THREE materials stay in lockstep
//   * drives the `useFlythrough` hook for brief-embedded tours
//   * keeps Phase 3b variants (`variant="canvas" | "detail"`) and
//     compact brief-embed props working (`compact`, `disableUrlState`,
//     `landscapeOverride`, legacy `initialLayout`).
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type { LandscapeData } from "@/lib/landscape/types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ForceGraph2D } from "./force-graph-2d";
import { ForceGraph3DNative } from "./force-graph-3d-native";
import type {
  LensMode,
  LensRenderHandle,
  LensToggles,
} from "./force-graph-3d-native";
import { JarvisModal } from "./jarvis-modal";
import { adaptLandscapeData } from "./data-adapter";
import { useGravitySearch } from "./hooks/use-gravity-search";
import { useLandscapeData } from "./hooks/use-landscape-data";
import { useCanvasSync } from "./hooks/use-canvas-sync";
import { useFlythrough, type FlythroughConfig } from "./hooks/use-flythrough";
import { PRESET_QUERIES, POC_PRESETS } from "./preset-queries";
import { type LensLayoutMode, type LensNode, type LensZAxis } from "./types";
import { readUrlState, writeUrlState } from "./url-state";
import { themeCssVars, type LensTheme } from "./theme-tokens";

const MODE_BUTTONS: Array<{
  id: LensMode;
  label: string;
  desc: string;
}> = [
  {
    id: "explore",
    label: "Explore",
    desc: "UMAP-pinned landscape. What exists.",
  },
  { id: "gravity", label: "Gravity", desc: "Enter query A. Relevance rings." },
  { id: "compare", label: "Compare", desc: "Enter A + B. Binary-star layout." },
];

const Z_AXES: Array<{ id: LensZAxis; label: string }> = [
  { id: "score", label: "Score" },
  { id: "time", label: "Time" },
  { id: "funding", label: "£" },
  { id: "flat", label: "Flat" },
];

export type ForceGraphLensProps = {
  variant?: "canvas" | "detail";
  initialQuery?: string | null;
  initialQueryB?: string | null;
  initialMode?: LensMode;
  initialLayout?: LensLayoutMode;
  initialFocusedId?: string | null;
  initialZAxis?: LensZAxis;
  initialCameraPreset?: "topdown" | "fit" | "explore";
  theme?: LensTheme;
  compact?: boolean;
  landscapeOverride?: LandscapeData | null;
  disableUrlState?: boolean;
  flythrough?: FlythroughConfig | null;
  /** Hide left/right chrome (used by compact brief embeds). */
  hideChrome?: boolean;
  /** Caption shown under the stage (brief embeds). */
  caption?: string | null;
  /** Force a specific renderer. Default: auto-detect WebGL2. */
  rendererOverride?: "3d" | "2d" | null;
};

function detectWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

function computeSnapshotHash(data: LandscapeData | null): string {
  if (!data) return "empty";
  return `${data.generatedAt ?? "runtime"}__${data.nodes.length}`;
}

function legacyLayoutToMode(
  layout: LensLayoutMode | undefined,
  hasQuery: boolean,
): { mode: LensMode; cameraPreset: "topdown" | "fit" | "explore" } {
  if (!layout) return { mode: "explore", cameraPreset: "topdown" };
  if (layout === "umap") return { mode: "explore", cameraPreset: "topdown" };
  if (layout === "rings")
    return { mode: hasQuery ? "gravity" : "explore", cameraPreset: "fit" };
  return { mode: hasQuery ? "gravity" : "explore", cameraPreset: "topdown" };
}

export function ForceGraphLens(props: ForceGraphLensProps) {
  const {
    variant = "canvas",
    initialQuery = null,
    initialQueryB = null,
    initialMode,
    initialLayout,
    initialFocusedId = null,
    initialZAxis = "score",
    initialCameraPreset,
    theme = "dark",
    compact = false,
    landscapeOverride = null,
    disableUrlState = false,
    flythrough = null,
    hideChrome = false,
    caption = null,
    rendererOverride = null,
  } = props;

  // Client-only WebGL2 detection — default to `true` on first render so
  // SSR/hydration renders the 3D container, then flip to 2D on mount
  // if the browser can't do WebGL2.
  const [rendererKind, setRendererKind] = useState<"3d" | "2d">(
    rendererOverride ?? "3d",
  );
  useLayoutEffect(() => {
    if (rendererOverride) {
      setRendererKind(rendererOverride);
      return;
    }
    setRendererKind(detectWebGL2() ? "3d" : "2d");
  }, [rendererOverride]);

  const canvasSync = useCanvasSync();
  const legacyMapped = useMemo(
    () => legacyLayoutToMode(initialLayout, !!initialQuery),
    [initialLayout, initialQuery],
  );
  const [mode, setMode] = useState<LensMode>(
    () => initialMode ?? legacyMapped.mode,
  );
  const [zAxis, setZAxis] = useState<LensZAxis>(initialZAxis);
  const [cameraPresetProp] = useState<"topdown" | "fit" | "explore">(
    () => initialCameraPreset ?? legacyMapped.cameraPreset,
  );
  const [queryA, setQueryA] = useState<string | null>(
    () => initialQuery ?? canvasSync.filter.query ?? null,
  );
  const [queryB, setQueryB] = useState<string | null>(initialQueryB);
  const [toggles, setToggles] = useState<LensToggles>({
    edges: true,
    rings: true,
    volumes: true,
    spread: false,
  });
  const [clusterLabels, setClusterLabels] = useState<Map<number, string>>(
    () => new Map(),
  );
  const [focusedId, setFocusedId] = useState<string | null>(initialFocusedId);
  const [hoverNode, setHoverNode] = useState<LensNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisShot, setJarvisShot] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sessionLog, setSessionLog] = useState<
    Array<{ at: number; msg: string; nodeId?: string }>
  >([]);
  const [ariaMessage, setAriaMessage] = useState<string>("");

  const hoverRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const capture2DRef = useRef<(() => string | null) | null>(null);
  const handle3DRef = useRef<LensRenderHandle | null>(null);

  const logSession = useCallback((msg: string, nodeId?: string) => {
    setSessionLog((xs) => {
      const next = [...xs, { at: Date.now(), msg, nodeId }];
      return next.slice(-40);
    });
  }, []);

  // URL round-trip — on boot (seed) + on change (debounced).
  useEffect(() => {
    if (disableUrlState) return;
    const state = readUrlState();
    if (!state) return;
    if (state.qa) setQueryA(state.qa);
    if (state.qb) {
      setQueryB(state.qb);
      setMode("compare");
    } else if (state.m === "gravity") {
      setMode("gravity");
    } else if (state.m === "explore") {
      setMode("explore");
    }
    if (state.f) setFocusedId(state.f);
    if (state.z) setZAxis(state.z);
    if (state.t) {
      setToggles((t) => ({
        edges: state.t?.e === undefined ? t.edges : !!state.t.e,
        rings: state.t?.r === undefined ? t.rings : !!state.t.r,
        volumes: state.t?.v === undefined ? t.volumes : !!state.t.v,
        spread: state.t?.s === undefined ? t.spread : !!state.t.s,
      }));
    }
  }, [disableUrlState]);

  useEffect(() => {
    if (disableUrlState) return;
    const id = setTimeout(() => {
      writeUrlState({
        m: mode,
        z: zAxis,
        qa: queryA,
        qb: queryB,
        f: focusedId,
        t: {
          e: toggles.edges ? 1 : 0,
          r: toggles.rings ? 1 : 0,
          v: toggles.volumes ? 1 : 0,
          s: toggles.spread ? 1 : 0,
        },
      });
    }, 400);
    return () => clearTimeout(id);
  }, [disableUrlState, mode, zAxis, queryA, queryB, focusedId, toggles]);

  // Mirror chat-driven filter changes into local state.
  useEffect(() => {
    const q = canvasSync.filter.query;
    if (typeof q === "string" && q !== queryA) {
      setQueryA(q);
    }
  }, [canvasSync.filter.query, queryA]);

  const gravityA = useGravitySearch(queryA);
  const gravityB = useGravitySearch(mode === "compare" ? queryB : null);

  const { data: fetchedData } = useLandscapeData();
  const landscapeData = landscapeOverride ?? fetchedData;
  const snapshotHash = useMemo(
    () => computeSnapshotHash(landscapeData),
    [landscapeData],
  );

  const baseGraph = useMemo(() => {
    if (!landscapeData) return { nodes: [], links: [] };
    return adaptLandscapeData(landscapeData, {
      clusterLabels,
      seed: snapshotHash,
    });
  }, [landscapeData, clusterLabels, snapshotHash]);

  // Fetch cluster labels (same behaviour as Phase 3b).
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
        const body = (await res.json()) as { labels: Record<string, string> };
        if (cancelled) return;
        const map = new Map<number, string>();
        for (const [k, v] of Object.entries(body.labels)) map.set(Number(k), v);
        setClusterLabels(map);
      } catch {
        /* leave empty; renderer uses "Cluster N" fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [landscapeData, snapshotHash]);

  // Keyboard shortcuts — Space toggles fly-through, Escape exits focus.
  const handleSelect = useCallback(
    (n: LensNode | null) => {
      setFocusedId(n?.id ?? null);
      if (n) {
        logSession(`focus → ${n.title.slice(0, 40)}`, n.id);
      }
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
    },
    [logSession],
  );

  const handleHover = useCallback(
    (n: LensNode | null, clientX: number, clientY: number) => {
      setHoverNode(n);
      if (n) setHoverPos({ x: clientX, y: clientY });
      else setHoverPos(null);
      appStore.setState((prev) => ({
        canvas: { ...prev.canvas, hoveredNodeId: n?.id ?? null },
      }));
    },
    [],
  );

  const applyQueryA = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setQueryA(trimmed);
      if (mode === "explore") setMode("gravity");
      logSession(`query A → "${trimmed}"`);
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
    [mode, logSession],
  );

  const applyQueryB = useCallback(
    (qa: string, qb: string) => {
      const qaTrim = qa.trim();
      const qbTrim = qb.trim();
      if (!qaTrim || !qbTrim) return;
      setQueryA(qaTrim);
      setQueryB(qbTrim);
      setMode("compare");
      logSession(`compare → A: "${qaTrim}" vs B: "${qbTrim}"`);
    },
    [logSession],
  );

  const handleAskJarvis = useCallback(() => {
    const shot =
      rendererKind === "3d"
        ? (handle3DRef.current?.captureViewport() ?? null)
        : (capture2DRef.current?.() ?? null);
    setJarvisShot(shot);
    setJarvisOpen(true);
  }, [rendererKind]);

  const handleShare = useCallback(() => {
    if (disableUrlState) return;
    writeUrlState({
      m: mode,
      z: zAxis,
      qa: queryA,
      qb: queryB,
      f: focusedId,
      t: {
        e: toggles.edges ? 1 : 0,
        r: toggles.rings ? 1 : 0,
        v: toggles.volumes ? 1 : 0,
        s: toggles.spread ? 1 : 0,
      },
    });
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .catch(() => undefined);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1600);
  }, [disableUrlState, mode, zAxis, queryA, queryB, focusedId, toggles]);

  // Compare-mode aria-live summary once similarity maps settle.
  useEffect(() => {
    if (mode !== "compare" || !queryA || !queryB) return;
    if (!gravityA.similarity || !gravityB.similarity) return;
    let bothStrong = 0;
    let aOnly = 0;
    let bOnly = 0;
    for (const n of baseGraph.nodes) {
      const sa = gravityA.similarity.get(n.id) ?? 0;
      const sb = gravityB.similarity.get(n.id) ?? 0;
      if (sa > 0.4 && sb > 0.4) bothStrong += 1;
      else if (sa > 0.5 && sb < 0.3) aOnly += 1;
      else if (sb > 0.5 && sa < 0.3) bOnly += 1;
    }
    setAriaMessage(
      `Comparing ${queryA} vs ${queryB} — ${bothStrong} overlap, ${aOnly} A-only, ${bOnly} B-only`,
    );
  }, [
    mode,
    queryA,
    queryB,
    gravityA.similarity,
    gravityB.similarity,
    baseGraph,
  ]);

  // Fly-through runner (brief embeds).
  const [flyState, flyControls] = useFlythrough({
    config: flythrough,
    handle: handle3DRef,
    containerRef: stageRef,
    ttsEndpoint: "/api/landscape/tts",
  });

  // Keyboard — Space/Escape (respects input focus).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      if (e.key === "Escape") {
        if (focusedId) {
          setFocusedId(null);
          e.preventDefault();
        }
      } else if (e.key === " " && flythrough?.stops.length) {
        if (flyState.playing) flyControls.pause();
        else flyControls.play();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, flyState.playing, flyControls, flythrough]);

  const similarityA = gravityA.similarity;
  const similarityB = mode === "compare" ? gravityB.similarity : null;
  // Legacy 2D layout selection.
  const legacy2DLayout: LensLayoutMode = !queryA
    ? "umap"
    : mode === "gravity"
      ? "web"
      : mode === "compare"
        ? "rings"
        : "umap";

  const lensHeight = variant === "detail" ? "h-[calc(100vh-3.5rem)]" : "h-full";

  const themeVars = themeCssVars(theme);

  return (
    <div
      className={`relative flex w-full flex-col ${lensHeight}`}
      data-testid="force-graph-lens"
      data-variant={variant}
      data-theme={theme}
      data-renderer={rendererKind}
      style={{
        ...themeVars,
        background: "var(--lens-bg-0)",
        color: "var(--lens-ink)",
      }}
    >
      {/* aria-live region for compare-mode announcements. */}
      <div aria-live="polite" role="status" className="sr-only">
        {ariaMessage}
      </div>

      {/* Header */}
      {!compact && (
        <header
          className="flex flex-none items-center gap-3 border-b px-4 py-2 font-['JetBrains_Mono']"
          style={{
            borderColor: "var(--lens-rule)",
            background: "var(--lens-bg-1)",
          }}
        >
          <div className="flex items-baseline gap-3">
            <span className="font-['Fraunces'] text-[15px]">
              Atlas{" "}
              <em
                className="not-italic"
                style={{ color: "var(--lens-query-a)" }}
              >
                Network
              </em>
            </span>
            <span
              className="border px-2 py-0.5 text-[9px] uppercase tracking-widest"
              style={{
                borderColor: "var(--lens-rule)",
                color: "var(--lens-ink-dim)",
              }}
            >
              v3
            </span>
          </div>
          <QueryInput
            prompt="A"
            initialValue={queryA ?? ""}
            accent="var(--lens-query-a)"
            onApply={applyQueryA}
          />
          <QueryInput
            prompt="B"
            initialValue={queryB ?? ""}
            accent="var(--lens-query-b)"
            onApply={(q) => applyQueryB(queryA ?? "", q)}
            disabled={!queryA}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShare}
              className="border px-2 py-1.5 text-[10px] uppercase tracking-widest transition-colors"
              style={{
                borderColor: shareCopied
                  ? "var(--lens-query-a)"
                  : "var(--lens-rule)",
                color: shareCopied
                  ? "var(--lens-query-a)"
                  : "var(--lens-ink-dim)",
              }}
            >
              {shareCopied ? "Copied ✓" : "Share"}
            </button>
            <button
              type="button"
              onClick={handleAskJarvis}
              className="flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] uppercase tracking-widest"
              style={{
                borderColor: "var(--lens-warm)",
                color: "var(--lens-warm)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "currentColor" }}
              />
              Ask JARVIS
            </button>
          </div>
        </header>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        {/* Left panel */}
        {!compact && !hideChrome && (
          <aside
            className="flex w-[240px] flex-none flex-col gap-4 border-r p-4 text-[11px]"
            style={{
              borderColor: "var(--lens-rule)",
              background: "var(--lens-bg-1)",
            }}
          >
            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Layout mode
              </div>
              <div className="flex flex-col gap-1.5">
                {MODE_BUTTONS.map((b) => {
                  const disabled =
                    (b.id === "gravity" && !queryA) ||
                    (b.id === "compare" && !(queryA && queryB));
                  const active = mode === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => {
                        setMode(b.id);
                        logSession(`mode → ${b.id}`);
                      }}
                      className="flex flex-col items-start border px-2.5 py-1.5 text-left transition-colors"
                      style={{
                        borderColor: active
                          ? "var(--lens-query-a)"
                          : "var(--lens-rule)",
                        color: active
                          ? "var(--lens-query-a)"
                          : disabled
                            ? "var(--lens-ink-faint)"
                            : "var(--lens-ink-dim)",
                        opacity: disabled ? 0.6 : 1,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      <span className="text-[11px] uppercase tracking-widest">
                        {b.label}
                      </span>
                      <span className="mt-0.5 text-[10px] font-normal normal-case">
                        {b.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Visual
              </div>
              <TogglesGroup toggles={toggles} setToggles={setToggles} />
            </section>

            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Camera
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handle3DRef.current?.cameraFit()}
                  className="border px-2 py-1 text-[10px]"
                  style={{
                    borderColor: "var(--lens-rule)",
                    color: "var(--lens-ink-dim)",
                  }}
                >
                  Fit all
                </button>
                <button
                  type="button"
                  onClick={() => handle3DRef.current?.cameraTopDown()}
                  className="border px-2 py-1 text-[10px]"
                  style={{
                    borderColor: "var(--lens-rule)",
                    color: "var(--lens-ink-dim)",
                  }}
                >
                  Top-down
                </button>
                <button
                  type="button"
                  onClick={() => handle3DRef.current?.cameraReset()}
                  className="border px-2 py-1 text-[10px]"
                  style={{
                    borderColor: "var(--lens-rule)",
                    color: "var(--lens-ink-dim)",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (flythrough?.stops.length) flyControls.restart();
                    else runBuiltinFlythrough(handle3DRef, baseGraph.nodes);
                  }}
                  className="border px-2 py-1 text-[10px]"
                  style={{
                    borderColor: "var(--lens-rule)",
                    color: "var(--lens-ink-dim)",
                  }}
                >
                  Fly-through
                </button>
              </div>
            </section>

            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Try a query <span className="opacity-70">· seed A</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {POC_PRESETS.concat(PRESET_QUERIES.slice(0, 2)).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyQueryA(p.query)}
                    className="text-left border px-2 py-1 text-[10px] hover:underline"
                    style={{
                      borderColor: "var(--lens-rule)",
                      color: "var(--lens-ink)",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => setAdvancedOpen((x) => !x)}
              className="flex items-center justify-between border px-2 py-1 text-[10px] uppercase tracking-widest"
              style={{
                borderColor: "var(--lens-rule)",
                color: "var(--lens-ink-dim)",
              }}
              aria-expanded={advancedOpen}
            >
              <span>⚙ Advanced</span>
              <span
                style={{
                  transform: advancedOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 160ms",
                }}
              >
                ›
              </span>
            </button>
            {advancedOpen && (
              <section
                className="flex flex-col gap-3 border p-2"
                style={{ borderColor: "var(--lens-rule)" }}
              >
                <div>
                  <div
                    className="mb-1 text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--lens-ink-dim)" }}
                  >
                    Z axis
                  </div>
                  <div className="flex gap-1">
                    {Z_AXES.map((z) => {
                      const active = zAxis === z.id;
                      return (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => setZAxis(z.id)}
                          className="border px-1.5 py-1 text-[10px]"
                          style={{
                            borderColor: active
                              ? "var(--lens-query-a)"
                              : "var(--lens-rule)",
                            color: active
                              ? "var(--lens-query-a)"
                              : "var(--lens-ink-dim)",
                          }}
                        >
                          {z.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </aside>
        )}

        {/* Stage */}
        <div
          className="relative flex-1 overflow-hidden"
          ref={stageRef}
          data-renderer-kind={rendererKind}
        >
          {rendererKind === "3d" ? (
            <ForceGraph3DNative
              graph={baseGraph}
              mode={mode}
              zAxis={zAxis}
              queryAText={queryA}
              queryBText={queryB}
              similarityA={similarityA ?? null}
              similarityB={similarityB ?? null}
              focusedId={focusedId}
              toggles={toggles}
              theme={theme}
              cameraPreset={cameraPresetProp}
              onHover={(n, cx, cy) => {
                handleHover(n, cx, cy);
                const r = hoverRef.current?.getBoundingClientRect();
                if (r && n) setHoverPos({ x: cx - r.left, y: cy - r.top });
              }}
              onSelect={handleSelect}
              handleRef={handle3DRef}
            />
          ) : (
            <ForceGraph2D
              graph={baseGraph}
              layout={legacy2DLayout}
              similarity={similarityA ?? null}
              queryText={queryA}
              focusedId={focusedId}
              onHover={(n, cx, cy) => {
                handleHover(n, cx, cy);
                const r = hoverRef.current?.getBoundingClientRect();
                if (r && n) setHoverPos({ x: cx - r.left, y: cy - r.top });
              }}
              onSelect={handleSelect}
              onViewportReady={(fn) => {
                capture2DRef.current = fn;
              }}
              showRings={toggles.rings}
              showEdges={toggles.edges}
              showClusterVolumes={toggles.volumes}
            />
          )}
          {/* Hover card */}
          <div ref={hoverRef} className="pointer-events-none absolute inset-0">
            {hoverNode && hoverPos && (
              <div
                className="pointer-events-none absolute z-10 max-w-[260px] border px-2.5 py-2 text-[11px] backdrop-blur-sm"
                style={{
                  left: hoverPos.x + 14,
                  top: hoverPos.y + 14,
                  background: "var(--lens-bg-1)",
                  borderColor: "var(--lens-query-a)",
                  color: "var(--lens-ink)",
                }}
              >
                <div
                  className="mb-1 text-[9px] uppercase tracking-widest"
                  style={{
                    color:
                      hoverNode.type === "live_call"
                        ? "var(--lens-live)"
                        : "var(--lens-ink-dim)",
                  }}
                >
                  {hoverNode.type === "live_call" ? "Live call" : "Project"}
                  {hoverNode.cluster_label
                    ? ` · ${hoverNode.cluster_label}`
                    : ""}
                </div>
                <div className="mb-1 font-['Fraunces'] text-[13px] leading-snug">
                  {hoverNode.title}
                </div>
                <div
                  className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[10px]"
                  style={{ color: "var(--lens-ink-dim)" }}
                >
                  <span style={{ color: "var(--lens-ink-faint)" }}>funder</span>
                  <span style={{ color: "var(--lens-ink)" }}>
                    {hoverNode.lead_funder ?? hoverNode.funder ?? "—"}
                  </span>
                  {similarityA && (
                    <>
                      <span style={{ color: "var(--lens-ink-faint)" }}>
                        A sim
                      </span>
                      <span style={{ color: "var(--lens-query-a)" }}>
                        {Math.round((similarityA.get(hoverNode.id) ?? 0) * 100)}
                        %
                      </span>
                    </>
                  )}
                  {similarityB && (
                    <>
                      <span style={{ color: "var(--lens-ink-faint)" }}>
                        B sim
                      </span>
                      <span style={{ color: "var(--lens-query-b)" }}>
                        {Math.round((similarityB.get(hoverNode.id) ?? 0) * 100)}
                        %
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Fly-through caption + controls */}
          {flythrough && flythrough.stops.length > 0 && (
            <FlythroughOverlay
              state={flyState}
              controls={flyControls}
              total={flythrough.stops.length}
            />
          )}
          {/* Computing indicator */}
          {(gravityA.loading || (mode === "compare" && gravityB.loading)) && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-[11px] uppercase tracking-widest"
              style={{ color: "var(--lens-warm)" }}
            >
              <div
                className="h-8 w-8 animate-ping rounded-full border"
                style={{ borderColor: "var(--lens-warm)" }}
              />
              Computing relevance…
            </div>
          )}
        </div>

        {/* Right panel: focused + session log */}
        {!compact && !hideChrome && (
          <aside
            className="flex w-[240px] flex-none flex-col gap-4 border-l p-4 text-[11px]"
            style={{
              borderColor: "var(--lens-rule)",
              background: "var(--lens-bg-1)",
            }}
          >
            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Focused
              </div>
              <FocusedCard
                node={
                  focusedId
                    ? (baseGraph.nodes.find((n) => n.id === focusedId) ?? null)
                    : null
                }
                similarityA={similarityA}
                similarityB={similarityB}
                onPickNeighbour={(id) => {
                  setFocusedId(id);
                  logSession("refocus via neighbour", id);
                }}
                graph={baseGraph}
              />
            </section>
            <section>
              <div
                className="mb-2 text-[10px] uppercase tracking-widest"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                Session log
              </div>
              <ol
                className="flex max-h-[180px] flex-col gap-0.5 overflow-y-auto text-[10px] leading-snug"
                style={{ color: "var(--lens-ink-faint)" }}
              >
                {sessionLog.length === 0 ? (
                  <li style={{ color: "var(--lens-ink-faint)" }}>—</li>
                ) : (
                  sessionLog.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      {e.nodeId ? (
                        <button
                          type="button"
                          onClick={() => setFocusedId(e.nodeId!)}
                          className="hover:underline"
                        >
                          {e.msg}
                        </button>
                      ) : (
                        e.msg
                      )}
                    </li>
                  ))
                )}
              </ol>
            </section>
          </aside>
        )}
      </div>

      {!compact && variant === "canvas" && !hideChrome && (
        <div
          className="flex flex-none items-center gap-1 overflow-x-auto border-t px-4 py-1.5 font-['JetBrains_Mono']"
          style={{
            borderColor: "var(--lens-rule)",
            background: "var(--lens-bg-1)",
          }}
        >
          <span
            className="mr-2 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--lens-ink-dim)" }}
          >
            Try a query
          </span>
          {PRESET_QUERIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="whitespace-nowrap border px-2 py-1 text-[10px]"
              style={{
                borderColor: "var(--lens-rule)",
                color: "var(--lens-ink)",
              }}
              onClick={() => applyQueryA(p.query)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <footer
          className="flex flex-none items-center justify-between border-t px-4 py-1.5 text-[10px]"
          style={{
            borderColor: "var(--lens-rule)",
            background: "var(--lens-bg-1)",
            color: "var(--lens-ink-dim)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "var(--lens-project)" }}
              />{" "}
              Project
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "var(--lens-live)" }}
              />{" "}
              Live call
            </span>
            {queryA && (
              <span
                id="legend-a"
                className="flex items-center gap-1.5"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "var(--lens-query-a)" }}
                />{" "}
                Query A affinity
              </span>
            )}
            {mode === "compare" && queryB && (
              <span
                id="legend-b"
                className="flex items-center gap-1.5"
                style={{ color: "var(--lens-ink-dim)" }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "var(--lens-query-b)" }}
                />{" "}
                Query B affinity
              </span>
            )}
          </div>
          <div className="uppercase tracking-widest">
            MODE · {mode} ·{" "}
            {mode === "explore"
              ? "UMAP"
              : mode === "gravity"
                ? `A="${(queryA ?? "").slice(0, 18)}"`
                : `A vs B`}
            {mode === "explore" ? ` · Z=${zAxis.toUpperCase()}` : ""}
          </div>
        </footer>
      )}

      {caption && (
        <div
          className="flex-none px-4 py-2 text-[11px] leading-relaxed"
          style={{
            color: "var(--lens-ink-dim)",
            background: "var(--lens-bg-1)",
          }}
        >
          {caption}
        </div>
      )}

      <JarvisModal
        open={jarvisOpen}
        screenshot={jarvisShot}
        context={{
          mode,
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QueryInput({
  prompt,
  initialValue,
  accent,
  onApply,
  disabled = false,
}: {
  prompt: string;
  initialValue: string;
  accent: string;
  onApply: (q: string) => void;
  disabled?: boolean;
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
      className="flex flex-1 items-center border border-l-[3px]"
      role="search"
      style={{
        borderColor: "var(--lens-rule)",
        borderLeftColor: accent,
        background: "var(--lens-bg-0)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span className="px-2 pl-3 text-[11px]" style={{ color: accent }}>
        {prompt}
      </span>
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
        disabled={disabled}
        placeholder={
          prompt === "A"
            ? "primary query — e.g. rail hydrogen decarbonisation"
            : "second query — enables compare mode"
        }
        className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-[11px] outline-none"
        style={{ color: "var(--lens-ink)" }}
        aria-label={`Gravity query ${prompt}`}
      />
      <button
        type="button"
        aria-label="Apply query"
        className="px-2.5 text-base"
        style={{ color: "var(--lens-ink-dim)" }}
        onClick={submit}
        disabled={disabled}
      >
        →
      </button>
    </div>
  );
}

function TogglesGroup({
  toggles,
  setToggles,
}: {
  toggles: LensToggles;
  setToggles: React.Dispatch<React.SetStateAction<LensToggles>>;
}) {
  const rows: Array<{ key: keyof LensToggles; label: string; hint: string }> = [
    { key: "edges", label: "Edges", hint: "Show link geometry" },
    { key: "rings", label: "Ring guides", hint: "In gravity mode" },
    { key: "volumes", label: "Cluster volumes", hint: "Translucent blobs" },
    {
      key: "spread",
      label: "Spread overlaps",
      hint: "Collide-only relaxation",
    },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const on = toggles[r.key];
        return (
          <button
            key={r.key}
            type="button"
            aria-pressed={on}
            onClick={() => setToggles((t) => ({ ...t, [r.key]: !t[r.key] }))}
            className="flex items-center justify-between border px-2 py-1 text-left"
            style={{
              borderColor: on ? "var(--lens-query-a)" : "var(--lens-rule)",
              color: on ? "var(--lens-query-a)" : "var(--lens-ink-dim)",
            }}
          >
            <span>
              <div className="text-[10px] uppercase tracking-widest">
                {r.label}
              </div>
              <div
                className="text-[9px]"
                style={{ color: "var(--lens-ink-faint)" }}
              >
                {r.hint}
              </div>
            </span>
            <span
              className="inline-block h-3 w-6 rounded-sm"
              style={{
                background: on ? "var(--lens-query-a)" : "var(--lens-rule)",
              }}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

function FocusedCard({
  node,
  similarityA,
  similarityB,
  onPickNeighbour,
  graph,
}: {
  node: LensNode | null;
  similarityA: Map<string, number> | null | undefined;
  similarityB: Map<string, number> | null | undefined;
  onPickNeighbour: (id: string) => void;
  graph: {
    nodes: LensNode[];
    links: { source_id: string; target_id: string }[];
  };
}) {
  if (!node) {
    return (
      <div
        className="border p-2 text-[11px] leading-relaxed"
        style={{
          borderColor: "var(--lens-rule)",
          color: "var(--lens-ink-faint)",
        }}
      >
        <strong className="block text-[11px] uppercase tracking-widest">
          Nothing focused yet
        </strong>
        Hover to inspect. Click to focus. Enter a query in A to anchor the view.
        Enter B for compare mode.
      </div>
    );
  }
  const isLive = node.type === "live_call";
  const scorePct = Math.round((node.score ?? 0) * 100);
  const simA = similarityA?.get(node.id);
  const simB = similarityB?.get(node.id);
  const neighbours = graph.links
    .filter((l) => l.source_id === node.id || l.target_id === node.id)
    .map((l) => (l.source_id === node.id ? l.target_id : l.source_id))
    .slice(0, 5)
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n): n is LensNode => !!n);

  return (
    <article
      className="border p-2"
      style={{
        borderColor: "var(--lens-rule)",
        background: "var(--lens-bg-2)",
      }}
    >
      <div
        className="mb-1 text-[9px] uppercase tracking-widest"
        style={{
          color: isLive ? "var(--lens-live)" : "var(--lens-ink-dim)",
        }}
      >
        {isLive ? "Live funding call" : "Project"}
        {node.cluster_label ? ` · ${node.cluster_label}` : ""}
      </div>
      <div
        className="mb-1 font-['Fraunces'] text-[14px] leading-snug"
        style={{ color: "var(--lens-ink)" }}
      >
        {node.title}
      </div>
      <dl
        className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[10px]"
        style={{ color: "var(--lens-ink-dim)" }}
      >
        <dt>Funder</dt>
        <dd style={{ color: "var(--lens-ink)" }}>
          {node.lead_funder ?? node.funder ?? "—"}
        </dd>
        <dt>Year</dt>
        <dd style={{ color: "var(--lens-ink)" }}>
          {node.start_year ?? node.deadline ?? "—"}
        </dd>
        <dt>Funding</dt>
        <dd style={{ color: "var(--lens-ink)" }}>
          {node.funding_amount
            ? `£${Math.round(node.funding_amount / 1000)}k`
            : "—"}
        </dd>
        {simA !== undefined ? (
          <>
            <dt style={{ color: "var(--lens-query-a)" }}>Query A</dt>
            <dd style={{ color: "var(--lens-query-a)" }}>
              {Math.round(simA * 100)}%
            </dd>
          </>
        ) : null}
        {simB !== undefined ? (
          <>
            <dt style={{ color: "var(--lens-query-b)" }}>Query B</dt>
            <dd style={{ color: "var(--lens-query-b)" }}>
              {Math.round(simB * 100)}%
            </dd>
          </>
        ) : null}
      </dl>
      <div className="mt-2">
        <div
          className="mb-1 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--lens-ink-dim)" }}
        >
          Score
        </div>
        <div
          aria-hidden
          className="h-1.5 w-full overflow-hidden rounded-sm"
          style={{ background: "var(--lens-rule)" }}
        >
          <div
            style={{
              width: `${scorePct}%`,
              background: "var(--lens-project)",
              height: "100%",
            }}
          />
        </div>
      </div>
      {neighbours.length > 0 && (
        <div className="mt-2">
          <div
            className="mb-1 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--lens-ink-dim)" }}
          >
            1-hop neighbours
          </div>
          <ul className="flex flex-col gap-0.5 text-[10px]">
            {neighbours.map((nn) => (
              <li key={nn.id}>
                <button
                  type="button"
                  onClick={() => onPickNeighbour(nn.id)}
                  className="hover:underline"
                  style={{ color: "var(--lens-ink)" }}
                >
                  ↳{" "}
                  {nn.title.length > 32
                    ? nn.title.slice(0, 30) + "…"
                    : nn.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function FlythroughOverlay({
  state,
  controls,
  total,
}: {
  state: ReturnType<typeof useFlythrough>[0];
  controls: ReturnType<typeof useFlythrough>[1];
  total: number;
}) {
  return (
    <>
      {state.caption && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-14 z-20 mx-auto max-w-[80%] rounded border px-3 py-2 text-center text-[13px] leading-snug"
          style={{
            background: "rgba(16,22,32,0.85)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "#fff",
            transition: "opacity 300ms",
          }}
        >
          {state.caption}
        </div>
      )}
      <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={controls.prev}
          className="border px-2 py-1 text-[10px]"
          style={{
            borderColor: "var(--lens-rule)",
            color: "var(--lens-ink)",
            background: "var(--lens-bg-1)",
          }}
          aria-label="Previous stop"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={state.playing ? controls.pause : controls.play}
          className="border px-2 py-1 text-[10px]"
          style={{
            borderColor: "var(--lens-query-a)",
            color: "var(--lens-query-a)",
            background: "var(--lens-bg-1)",
          }}
          aria-label={state.playing ? "Pause tour" : "Play tour"}
        >
          {state.playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={controls.next}
          className="border px-2 py-1 text-[10px]"
          style={{
            borderColor: "var(--lens-rule)",
            color: "var(--lens-ink)",
            background: "var(--lens-bg-1)",
          }}
          aria-label="Next stop"
        >
          ›
        </button>
        <div
          className="ml-2 flex gap-1"
          aria-label={`Tour progress: stop ${state.stopIndex + 1} of ${total}`}
        >
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className="inline-block h-1.5 w-3 rounded-sm"
              style={{
                background:
                  i <= state.stopIndex
                    ? "var(--lens-query-a)"
                    : "var(--lens-rule)",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// Built-in fly-through (POC): picks 4 strong-cluster-seed projects and
// eases between them. Runs when the user clicks the Fly-through camera
// button without an authored tour.
async function runBuiltinFlythrough(
  handle: React.MutableRefObject<LensRenderHandle | null>,
  nodes: LensNode[],
) {
  const picks: LensNode[] = [];
  const seen = new Set<number>();
  for (const n of nodes) {
    if (n.type !== "project") continue;
    if (typeof n.cluster_id !== "number") continue;
    if (!seen.has(n.cluster_id) && (n.score ?? 0) > 0.7) {
      picks.push(n);
      seen.add(n.cluster_id);
      if (picks.length === 4) break;
    }
  }
  for (const n of picks) {
    handle.current?.tweenTo(
      { kind: "node", nodeId: n.id, distance: 160 },
      1400,
    );
    await new Promise((r) => setTimeout(r, 1800));
  }
}
