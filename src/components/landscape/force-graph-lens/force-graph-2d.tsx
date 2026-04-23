"use client";

// ---------------------------------------------------------------------------
// ForceGraph2D — canvas-native renderer for the variant="canvas" lens.
//
// Plan §3: "variant='canvas' → `force-graph-2d.tsx`. Two-dimensional.
// HTML5 canvas via `d3-force` + our own render loop. Cold paint
// <300 ms. Can unmount instantly."
//
// This file implements the POC's visual contract in 2D:
//   * dark slate background (`--bg-0`) with the grid overlay
//   * POC colour tokens — project greens, live-call ambers, query green /
//     violet anchors, warm focus highlight
//   * cluster volume translucency at 0.04 opacity (POC line 1207)
//   * semantic-zoom label fade (`CLUSTER_LABEL_FADE_*`,
//     `NODE_LABEL_FADE_START`) — driven by viewport zoom, not camera
//     distance, because 2D
//   * ring guides for gravity mode
//   * JARVIS viewport capture via `canvas.toDataURL()`
//   * URL-owned state round-trip
//
// The renderer is deliberately simple — no d3-force physics sim, just
// a direct target-position layout (pure functions in `./layouts/`) and a
// per-frame lerp toward the target. Plan §3: "Cold paint <300 ms."
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LensGraph,
  LensLayoutMode,
  LensNode,
  SimilarityMap,
} from "./types";
import { CFG } from "./types";
import { buildLayout } from "./layouts";
import { computeClusterStats } from "./data-adapter";

const PROJECT_COLOUR = "#8fe4b1";
const LIVE_COLOUR = "#f5b547";
const QUERY_A_COLOUR = "#8fe4b1";
const WARM_FOCUS = "#ff6b4a";
const BG_0 = "#0a0e13";
const GRID_COLOUR = "rgba(143, 228, 177, 0.04)";
const EDGE_COLOUR = "rgba(74, 85, 102, 0.6)";
const LIVE_EDGE_COLOUR = "rgba(245, 181, 71, 0.7)";
const QUERY_EDGE_COLOUR = "rgba(143, 228, 177, 0.35)";

export type ForceGraph2DProps = {
  graph: LensGraph;
  layout: LensLayoutMode;
  similarity: SimilarityMap | null;
  queryText: string | null;
  focusedId?: string | null;
  hoveredId?: string | null;
  onHover?: (node: LensNode | null, clientX: number, clientY: number) => void;
  onSelect?: (node: LensNode | null) => void;
  onViewportReady?: (capture: () => string | null) => void;
  showRings?: boolean;
  showClusterVolumes?: boolean;
  showEdges?: boolean;
  className?: string;
};

type Camera = {
  tx: number;
  tz: number;
  zoom: number;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

function nodeRadius(n: LensNode): number {
  if (n.type === "query") return 6;
  if (n.type === "live_call") return 7;
  return 3 + (n.score ?? 0.5) * 4;
}

function nodeBaseColour(n: LensNode, similarity: SimilarityMap | null): string {
  if (n.type === "query") return QUERY_A_COLOUR;
  if (n.type === "live_call") return LIVE_COLOUR;
  if (similarity) {
    const s = similarity.get(n.id);
    if (s === undefined) return "rgba(130, 145, 165, 0.55)"; // dimmed backdrop
    if (s > 0.65) return QUERY_A_COLOUR;
    if (s > 0.45) return "#a7d0a1";
    if (s > 0.25) return "#6c8c7c";
    return "rgba(130, 145, 165, 0.6)";
  }
  return PROJECT_COLOUR;
}

function toCanvasCoord(
  node: LensNode,
  cam: Camera,
  centre: { cx: number; cz: number },
): { x: number; y: number } {
  const x = (node.x ?? 0) - cam.tx;
  const z = (node.z ?? 0) - cam.tz;
  return {
    x: centre.cx + x * cam.zoom,
    y: centre.cz + z * cam.zoom,
  };
}

function findNearestNode(
  nodes: LensNode[],
  canvasX: number,
  canvasY: number,
  cam: Camera,
  centre: { cx: number; cz: number },
): LensNode | null {
  let best: LensNode | null = null;
  let bestDist = 14; // px hit-radius
  for (const n of nodes) {
    const p = toCanvasCoord(n, cam, centre);
    const d = Math.hypot(p.x - canvasX, p.y - canvasY);
    const r = Math.max(4, nodeRadius(n) * cam.zoom + 3);
    if (d < r && d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

export function ForceGraph2D(props: ForceGraph2DProps) {
  const {
    graph,
    layout,
    similarity,
    queryText,
    focusedId,
    hoveredId: externalHovered,
    onHover,
    onSelect,
    onViewportReady,
    showRings = true,
    showClusterVolumes = true,
    showEdges = true,
    className,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const camRef = useRef<Camera>({ tx: 0, tz: 0, zoom: 0.7 });
  const animRef = useRef<number | null>(null);
  const draggingRef = useRef<null | { x: number; y: number; moved: number }>(
    null,
  );
  const [localHovered, setLocalHovered] = useState<string | null>(null);
  const hoveredId = externalHovered ?? localHovered;

  const positioned = useMemo(() => {
    return buildLayout({
      mode: layout,
      nodes: graph.nodes,
      links: graph.links,
      similarity,
      queryText,
    });
  }, [graph, layout, similarity, queryText]);

  const clusterStats = useMemo(
    () => computeClusterStats({ nodes: positioned.nodes, links: [] }),
    [positioned.nodes],
  );

  // Resize observer — the canvas fits its parent.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(200, Math.round(r.width)),
        h: Math.max(200, Math.round(r.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-fit camera after a layout change.
  useEffect(() => {
    if (positioned.nodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const n of positioned.nodes) {
      const x = n.x ?? 0;
      const z = n.z ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const extentX = Math.max(20, maxX - minX);
    const extentZ = Math.max(20, maxZ - minZ);
    const centreX = (minX + maxX) / 2;
    const centreZ = (minZ + maxZ) / 2;
    const pad = 60;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        Math.min((size.w - pad * 2) / extentX, (size.h - pad * 2) / extentZ),
      ),
    );
    camRef.current = { tx: centreX, tz: centreZ, zoom };
  }, [positioned, size.w, size.h]);

  // Pointer events — drag to pan, click to select.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      draggingRef.current = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (draggingRef.current) {
        const dx = e.clientX - draggingRef.current.x;
        const dy = e.clientY - draggingRef.current.y;
        draggingRef.current.moved += Math.abs(dx) + Math.abs(dy);
        draggingRef.current.x = e.clientX;
        draggingRef.current.y = e.clientY;
        camRef.current = {
          ...camRef.current,
          tx: camRef.current.tx - dx / camRef.current.zoom,
          tz: camRef.current.tz - dy / camRef.current.zoom,
        };
        return;
      }
      const centre = { cx: size.w / 2, cz: size.h / 2 };
      const picked = findNearestNode(
        positioned.nodes,
        cx,
        cy,
        camRef.current,
        centre,
      );
      const nextId = picked?.id ?? null;
      if (nextId !== localHovered) setLocalHovered(nextId);
      onHover?.(picked, e.clientX, e.clientY);
    };
    const handlePointerUp = (e: PointerEvent) => {
      const moved = draggingRef.current?.moved ?? 0;
      draggingRef.current = null;
      canvas.releasePointerCapture?.(e.pointerId);
      if (moved > 6) return;
      const rect = canvas.getBoundingClientRect();
      const centre = { cx: size.w / 2, cz: size.h / 2 };
      const picked = findNearestNode(
        positioned.nodes,
        e.clientX - rect.left,
        e.clientY - rect.top,
        camRef.current,
        centre,
      );
      onSelect?.(picked ?? null);
    };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.pow(1.0015, e.deltaY);
      camRef.current = {
        ...camRef.current,
        zoom: Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, camRef.current.zoom / factor),
        ),
      };
    };
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", () => {
      draggingRef.current = null;
      setLocalHovered(null);
      onHover?.(null, 0, 0);
    });
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [positioned.nodes, size.w, size.h, onHover, onSelect, localHovered]);

  // Expose a viewport capture fn for the JARVIS modal. Matches the
  // POC's `captureViewport()` — we use `preserveDrawingBuffer` via the
  // 2D context implicitly (toDataURL works even after clears).
  useEffect(() => {
    if (!onViewportReady) return;
    onViewportReady(() => {
      const canvas = canvasRef.current;
      return canvas ? canvas.toDataURL("image/png") : null;
    });
  }, [onViewportReady]);

  // Render loop — single RAF, draws everything from scratch each frame.
  // The node set is small enough (<2k) that full redraw is cheaper than
  // any diffing scheme at this resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const draw = () => {
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.fillStyle = BG_0;
      ctx.fillRect(0, 0, size.w, size.h);

      // Grid
      ctx.strokeStyle = GRID_COLOUR;
      ctx.lineWidth = 1;
      const gridSpacingWorld = 60;
      const step = gridSpacingWorld * camRef.current.zoom;
      if (step > 8) {
        const offsetX =
          (size.w / 2 - camRef.current.tx * camRef.current.zoom) % step;
        const offsetY =
          (size.h / 2 - camRef.current.tz * camRef.current.zoom) % step;
        ctx.beginPath();
        for (let x = offsetX; x < size.w; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size.h);
        }
        for (let y = offsetY; y < size.h; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(size.w, y);
        }
        ctx.stroke();
      }

      const centre = { cx: size.w / 2, cz: size.h / 2 };

      // Ring guides — gravity mode only.
      if (
        showRings &&
        (layout === "web" || layout === "rings") &&
        queryText &&
        similarity
      ) {
        ctx.strokeStyle = "rgba(255, 107, 74, 0.22)";
        ctx.lineWidth = 1.5;
        const anchorP = {
          x: centre.cx - camRef.current.tx * camRef.current.zoom,
          y: centre.cz - camRef.current.tz * camRef.current.zoom,
        };
        [CFG.MAX_R * 0.33, CFG.MAX_R * 0.66, CFG.MAX_R].forEach((r, i) => {
          ctx.globalAlpha = 0.28 - i * 0.07;
          ctx.beginPath();
          ctx.arc(
            anchorP.x,
            anchorP.y,
            r * camRef.current.zoom,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }

      // Cluster volume translucencies (POC: 0.04 opacity).
      if (showClusterVolumes && layout === "umap") {
        ctx.globalAlpha = 1;
        for (const [, stat] of clusterStats) {
          const p = {
            x: centre.cx + (stat.cx - camRef.current.tx) * camRef.current.zoom,
            y: centre.cz + (stat.cz - camRef.current.tz) * camRef.current.zoom,
          };
          const r = stat.radius * camRef.current.zoom;
          if (r < 4) continue;
          const grad = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
          grad.addColorStop(0, "rgba(143, 228, 177, 0.04)");
          grad.addColorStop(1, "rgba(143, 228, 177, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Edges
      if (showEdges) {
        for (const l of positioned.links) {
          const a = positioned.nodes.find((n) => n.id === l.source_id);
          const b = positioned.nodes.find((n) => n.id === l.target_id);
          if (!a || !b) continue;
          const pa = toCanvasCoord(a, camRef.current, centre);
          const pb = toCanvasCoord(b, camRef.current, centre);
          if (l.edge_type === "query") {
            ctx.strokeStyle = QUERY_EDGE_COLOUR;
            ctx.lineWidth = 1 + (l.weight ?? 0.5) * 1.5;
          } else if (l.edge_type === "live_match") {
            ctx.strokeStyle = LIVE_EDGE_COLOUR;
            ctx.lineWidth = 1.2;
          } else {
            ctx.strokeStyle = EDGE_COLOUR;
            ctx.lineWidth = 0.7;
          }
          const dim =
            hoveredId && l.source_id !== hoveredId && l.target_id !== hoveredId
              ? 0.2
              : 1;
          ctx.globalAlpha = dim;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Cluster labels — semantic zoom.
      const labelOpacity = Math.max(
        0,
        Math.min(1, (0.7 - camRef.current.zoom) / 0.5),
      );
      if (labelOpacity > 0.02 && layout === "umap") {
        ctx.font = 'italic 500 16px "Fraunces", "Noto Serif", serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const [cid, stat] of clusterStats) {
          const node = positioned.nodes.find(
            (n) => n.cluster_id === cid && n.cluster_label,
          );
          const label = node?.cluster_label ?? `Cluster ${cid}`;
          const p = {
            x: centre.cx + (stat.cx - camRef.current.tx) * camRef.current.zoom,
            y:
              centre.cz +
              (stat.cz - camRef.current.tz) * camRef.current.zoom -
              stat.radius * camRef.current.zoom * 0.7 -
              14,
          };
          ctx.shadowColor = "rgba(143, 228, 177, 0.6)";
          ctx.shadowBlur = 18;
          ctx.fillStyle = `rgba(232, 236, 241, ${0.85 * labelOpacity})`;
          ctx.fillText(label, p.x, p.y);
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(232, 236, 241, ${0.95 * labelOpacity})`;
          ctx.fillText(label, p.x, p.y);
        }
      }

      // Nodes
      for (const n of positioned.nodes) {
        const p = toCanvasCoord(n, camRef.current, centre);
        if (p.x < -40 || p.x > size.w + 40 || p.y < -40 || p.y > size.h + 40)
          continue;
        let r = nodeRadius(n) * camRef.current.zoom;
        if (n.id === focusedId) r *= 1.4;
        if (n.id === hoveredId) r *= 1.2;
        let colour = nodeBaseColour(n, similarity);
        if (n.id === focusedId) colour = WARM_FOCUS;
        let opacity = 1;
        if (hoveredId && n.id !== hoveredId && similarity) {
          const s = similarity.get(n.id);
          if (s === undefined) opacity = 0.3;
        } else if (hoveredId && n.id !== hoveredId) {
          opacity = 0.6;
        }
        ctx.globalAlpha = opacity;
        // Glow halo for query anchor
        if (n.type === "query") {
          const halo = ctx.createRadialGradient(
            p.x,
            p.y,
            r * 0.4,
            p.x,
            p.y,
            r * 4,
          );
          halo.addColorStop(0, "rgba(143, 228, 177, 0.45)");
          halo.addColorStop(1, "rgba(143, 228, 177, 0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, r), 0, Math.PI * 2);
        ctx.fill();
        if (n.id === focusedId || n.id === hoveredId) {
          ctx.strokeStyle = "#e8ecf1";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Node labels — semantic-zoom: reveal on high zoom, or for
      // focused/hovered; in gravity mode reveal strong matches.
      const zoomLabelAlpha = Math.max(
        0,
        Math.min(1, (camRef.current.zoom - 0.7) / 0.7),
      );
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (const n of positioned.nodes) {
        if (n.type === "query") continue;
        const p = toCanvasCoord(n, camRef.current, centre);
        if (p.x < -200 || p.x > size.w + 200) continue;
        let alpha = 0;
        if (n.id === focusedId) alpha = 1;
        else if (n.id === hoveredId) alpha = 1;
        else if (similarity && (similarity.get(n.id) ?? 0) > 0.7) alpha = 0.85;
        else if (zoomLabelAlpha > 0) alpha = zoomLabelAlpha * 0.65;
        if (alpha < 0.05) continue;
        ctx.fillStyle = `rgba(232, 236, 241, ${alpha})`;
        const title =
          n.title.length > 36 ? n.title.slice(0, 34) + "…" : n.title;
        ctx.fillText(
          title,
          p.x + nodeRadius(n) * camRef.current.zoom + 4,
          p.y - 6,
        );
      }

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [
    positioned,
    clusterStats,
    similarity,
    queryText,
    layout,
    focusedId,
    hoveredId,
    size.w,
    size.h,
    showEdges,
    showRings,
    showClusterVolumes,
  ]);

  const containerClass = [
    "relative h-full w-full overflow-hidden bg-[#0a0e13] select-none",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={wrapRef}
      className={containerClass}
      data-testid="force-graph-lens-2d"
    >
      <canvas ref={canvasRef} className="absolute inset-0 cursor-grab" />
    </div>
  );
}
