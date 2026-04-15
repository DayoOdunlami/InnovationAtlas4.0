import type {
  EdgeType,
  LandscapeData,
  LandscapeLink,
  LandscapeNode,
} from "@/lib/landscape/types";
import { forceCollide, forceSimulation } from "d3-force";
import type { Simulation, SimulationLinkDatum } from "d3-force";

const PADDING = 60;
/** Extra space around each node for collision (smaller = closer to raw UMAP). */
const COLLIDE_PADDING = 5;
/** After pins release, use a low alpha so separation is gentle, not a burst. */
const LAYOUT_RELEASE_ALPHA = 0.22;

export type LandscapeEdgeVisibility = Record<EdgeType, boolean>;

export type SimNode = LandscapeNode & {
  index?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  umapX?: number;
  umapY?: number;
};

export type SimLink = SimulationLinkDatum<SimNode> & {
  edge_type: EdgeType;
  weight?: number;
};

export type CanvasOptions = {
  onNodeClick?: (node: SimNode | null) => void;
  getSelectedNodeId?: () => string | null;
  onFitReady?: (fn: () => void) => void;
  onReheatReady?: (fn: () => void) => void;
  /** Slider 0–100; default 20 */
  initialParticleSlider?: number;
  /** If set, called each frame to decide which edge types to draw and animate. */
  getEdgeVisibility?: () => LandscapeEdgeVisibility;
  /**
   * When true (default if unset), pins release and collision separates overlaps.
   * When false, nodes stay pinned at UMAP canvas positions; drag still works.
   */
  getLayoutSpread?: () => boolean;
};

type Particle = { link: SimLink; progress: number };

type CanvasWithApi = HTMLCanvasElement & {
  __allNodes?: SimNode[];
  __allLinks?: LandscapeLink[];
  __rebuildSim?: (nodes: SimNode[], links: LandscapeLink[]) => void;
  __setParticleSpeed?: (v: number) => void;
  __respawnParticlesForEdges?: () => void;
  __setLayoutSpreadMode?: (spread: boolean) => void;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hashUmapComponent(id: string, axis: "x" | "y"): number {
  const seed = `${id}:${axis}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10001) / 100;
}

function nodeRadius(n: SimNode): number {
  if (n.type === "live_call") return 10;
  const score = n.score ?? 0.72;
  return Math.max(3, 2 + (score - 0.72) * 38);
}

function projectFill(n: SimNode): string {
  if (n.type !== "project") return "#6e7681";
  const f = n.lead_funder ?? "";
  if (f === "Innovate UK") return "#3fb950";
  if (f === "EPSRC") return "#a371f7";
  if (f === "ISCF") return "#388bfd";
  if (f === "ESRC" || f === "AHRC" || f === "MRC" || f === "NERC") {
    return "#f0883e";
  }
  if (f === "Horizon Europe Guarantee") return "#58a6ff";
  return "#6e7681";
}

function liveFill(n: SimNode): string {
  if (n.type !== "live_call") return "#e3b341";
  const s = n.source ?? "horizon_europe";
  if (s === "horizon_europe") return "#58a6ff";
  if (s === "innovate_uk") return "#3fb950";
  if (s === "find_a_tender") return "#e3b341";
  return "#e3b341";
}

function toSimNodes(data: LandscapeData, cw: number, ch: number): SimNode[] {
  return data.nodes.map((n) => {
    const umapX = n.x != null ? n.x : hashUmapComponent(n.id, "x");
    const umapY = n.y != null ? n.y : hashUmapComponent(n.id, "y");
    const px = PADDING + (umapX / 100) * (cw - PADDING * 2);
    const py = PADDING + (umapY / 100) * (ch - PADDING * 2);
    const sn: SimNode = {
      ...n,
      umapX,
      umapY,
      x: px,
      y: py,
      fx: px,
      fy: py,
      vx: 0,
      vy: 0,
    };
    return sn;
  });
}

function toSimLinks(links: LandscapeLink[]): SimLink[] {
  return links.map((l) => ({
    source: l.source_id,
    target: l.target_id,
    edge_type: l.edge_type,
    weight: l.weight,
  }));
}

/** Drop edges whose endpoints are not both in the node set (avoids D3 "node not found"). */
function filterLinksForNodeIds(
  links: LandscapeLink[],
  nodeIds: Set<string>,
): LandscapeLink[] {
  return links.filter(
    (l) => nodeIds.has(l.source_id) && nodeIds.has(l.target_id),
  );
}

function sliderToParticleSpeed(v: number): number {
  if (v <= 0) return 0;
  return 0.0001 + (v / 100) * (0.008 - 0.0001);
}

/**
 * D3 force + canvas renderer for Landscape v2.
 */
export function initCanvas(
  canvas: HTMLCanvasElement,
  data: LandscapeData,
  options?: CanvasOptions,
): () => void {
  const parent = canvas.parentElement;
  if (!parent) return () => {};

  const root: HTMLElement = parent;
  const c = canvas as CanvasWithApi;

  let W = 0;
  let H = 0;
  let tx = 0;
  let ty = 0;
  let scale = 1;

  let sim: Simulation<SimNode, SimLink> | null = null;
  let simNodes: SimNode[] = [];
  let simLinks: SimLink[] = [];
  let particles: Particle[] = [];

  let particleSlider = options?.initialParticleSlider ?? 20;
  let particleSpeed = sliderToParticleSpeed(particleSlider);

  function isEdgeTypeVisible(et: EdgeType): boolean {
    const get = options?.getEdgeVisibility;
    if (!get) return true;
    return get()[et] !== false;
  }

  function layoutSpreadEnabled(): boolean {
    return options?.getLayoutSpread?.() !== false;
  }

  function umapToCanvas(umapX: number, umapY: number) {
    return {
      x: PADDING + (umapX / 100) * (W - PADDING * 2),
      y: PADDING + (umapY / 100) * (H - PADDING * 2),
    };
  }

  function effectiveUmap(n: SimNode): { ux: number; uy: number } {
    const ux = n.umapX ?? n.x ?? hashUmapComponent(n.id, "x");
    const uy = n.umapY ?? n.y ?? hashUmapComponent(n.id, "y");
    return { ux, uy };
  }

  /**
   * Place every node at its UMAP screen position and pin there.
   * @param freezeSim when true, collision loop stays off (strict UMAP mode).
   */
  function pinAllNodesAtUmap(freezeSim: boolean) {
    for (const n of simNodes) {
      const { ux, uy } = effectiveUmap(n);
      n.umapX = ux;
      n.umapY = uy;
      const { x, y } = umapToCanvas(ux, uy);
      n.x = x;
      n.y = y;
      n.fx = x;
      n.fy = y;
      n.vx = 0;
      n.vy = 0;
    }
    layoutPinsReleased = false;
    simSettledFrozen = freezeSim;
  }

  function scheduleSpreadPinRelease() {
    if (pinReleaseTimer) {
      clearTimeout(pinReleaseTimer);
      pinReleaseTimer = null;
    }
    pinReleaseTimer = setTimeout(() => {
      if (isDestroyed || !layoutSpreadEnabled()) return;
      for (const n of simNodes) {
        n.fx = null;
        n.fy = null;
        n.vx = 0;
        n.vy = 0;
      }
      layoutPinsReleased = true;
      simSettledFrozen = false;
      sim?.alpha(LAYOUT_RELEASE_ALPHA);
    }, 800);
  }

  function applyLayoutSpreadMode(spread: boolean) {
    if (!sim || simNodes.length === 0) return;
    if (spread) {
      pinAllNodesAtUmap(false);
      scheduleSpreadPinRelease();
    } else {
      if (pinReleaseTimer) {
        clearTimeout(pinReleaseTimer);
        pinReleaseTimer = null;
      }
      pinAllNodesAtUmap(true);
      layoutPinsReleased = false;
    }
  }

  let rafId = 0;
  let isDestroyed = false;
  let pulsePhase = 0;

  const tooltipEl = document.createElement("div");
  Object.assign(tooltipEl.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "9999",
    background: "rgba(13,17,23,0.95)",
    border: "0.5px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    padding: "6px 10px",
    color: "#e6edf3",
    fontSize: "12px",
    fontFamily: "ui-monospace, monospace",
    maxWidth: "280px",
    display: "none",
    lineHeight: "1.5",
  });
  document.body.appendChild(tooltipEl);

  type DragState =
    | {
        kind: "node";
        node: SimNode;
        downX: number;
        downY: number;
      }
    | {
        kind: "pan";
        hasMoved: boolean;
        downX: number;
        downY: number;
        startTx: number;
        startTy: number;
      };

  let dragState: DragState | null = null;

  let pinReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let particleSpawnTimer: ReturnType<typeof setTimeout> | null = null;
  /** After 800ms UMAP pins release, collision ticks until settled. */
  let layoutPinsReleased = false;
  let simSettledFrozen = false;

  function screenToWorld(sx: number, sy: number) {
    return {
      wx: (sx - tx) / scale,
      wy: (sy - ty) / scale,
    };
  }

  function hitTest(wx: number, wy: number): SimNode | null {
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of simNodes) {
      if (n.x == null || n.y == null) continue;
      const r = nodeRadius(n) + 6;
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function fitAll() {
    const placed = simNodes.filter((n) => n.x != null && n.y != null);
    if (placed.length === 0) return;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const n of placed) {
      const r = nodeRadius(n);
      x0 = Math.min(x0, n.x! - r);
      x1 = Math.max(x1, n.x! + r);
      y0 = Math.min(y0, n.y! - r);
      y1 = Math.max(y1, n.y! + r);
    }
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    const k = Math.min(W / bw, H / bh, 2) * 0.88;
    scale = k;
    tx = W / 2 - (k * (x0 + x1)) / 2;
    ty = H / 2 - (k * (y0 + y1)) / 2;
  }

  function respawnParticlesForEdges() {
    particles = [];
    if (!isEdgeTypeVisible("live_match")) return;
    for (const l of simLinks) {
      if (l.edge_type !== "live_match") continue;
      particles.push({ link: l, progress: 0 });
      particles.push({ link: l, progress: 0.5 });
    }
  }

  function spawnParticles() {
    respawnParticlesForEdges();
  }

  function stopSim() {
    if (sim) {
      sim.stop();
      sim = null;
    }
  }

  function freezeNodesAtSettledPositions() {
    if (isDestroyed) return;
    for (const n of simNodes) {
      if (n.x != null && n.y != null) {
        n.fx = n.x;
        n.fy = n.y;
      }
    }
  }

  function clearTimers() {
    if (pinReleaseTimer) {
      clearTimeout(pinReleaseTimer);
      pinReleaseTimer = null;
    }
    if (particleSpawnTimer) {
      clearTimeout(particleSpawnTimer);
      particleSpawnTimer = null;
    }
  }

  function buildSimulation(nodes: SimNode[], links: SimLink[]) {
    stopSim();
    clearTimers();

    simNodes = nodes;
    simLinks = links;
    particles = [];
    layoutPinsReleased = false;
    simSettledFrozen = false;

    sim = forceSimulation<SimNode>(simNodes)
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((d) => nodeRadius(d) + COLLIDE_PADDING)
          .strength(0.9)
          .iterations(3),
      )
      .alphaDecay(0.04)
      .velocityDecay(0.6);

    if (layoutSpreadEnabled()) {
      scheduleSpreadPinRelease();
    } else {
      layoutPinsReleased = false;
      simSettledFrozen = true;
    }

    /** D3 starts an internal timer by default; we drive ticks from RAF only. */
    sim.stop();

    particleSpawnTimer = setTimeout(() => {
      if (isDestroyed) return;
      spawnParticles();
      fitAll();
    }, 2500);
  }

  function rebuildFromFiltered(nodes: SimNode[], rawLinks: LandscapeLink[]) {
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredRaw = rawLinks.filter(
      (l) => idSet.has(l.source_id) && idSet.has(l.target_id),
    );
    const freshNodes = nodes.map((n) => {
      const cw = W || canvas.clientWidth;
      const ch = H || canvas.clientHeight;
      const umapX = n.umapX ?? n.x ?? hashUmapComponent(n.id, "x");
      const umapY = n.umapY ?? n.y ?? hashUmapComponent(n.id, "y");
      const px = PADDING + (umapX / 100) * (cw - PADDING * 2);
      const py = PADDING + (umapY / 100) * (ch - PADDING * 2);
      const copy: SimNode = {
        ...n,
        umapX,
        umapY,
        x: px,
        y: py,
        fx: px,
        fy: py,
        vx: 0,
        vy: 0,
      };
      return copy;
    });
    const freshLinks = toSimLinks(filteredRaw);
    buildSimulation(freshNodes, freshLinks);
  }

  function draw() {
    if (isDestroyed) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    for (const link of simLinks) {
      if (!isEdgeTypeVisible(link.edge_type)) continue;
      const s =
        typeof link.source === "string"
          ? nodeById.get(link.source)
          : link.source;
      const t =
        typeof link.target === "string"
          ? nodeById.get(link.target)
          : link.target;
      if (
        !s ||
        !t ||
        s.x == null ||
        t.x == null ||
        s.y == null ||
        t.y == null
      ) {
        continue;
      }

      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]);

      if (link.edge_type === "shared_org") {
        ctx.strokeStyle = "rgba(63,185,80,0.45)";
        ctx.lineWidth = 1.5;
      } else if (link.edge_type === "semantic_similarity") {
        ctx.strokeStyle = "rgba(139,148,158,0.18)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 3]);
      } else {
        ctx.strokeStyle = "rgba(88,166,255,0.35)";
        ctx.lineWidth = 0.8;
      }

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (particleSpeed > 0) {
      for (const p of particles) {
        const l = p.link;
        if (!isEdgeTypeVisible(l.edge_type)) continue;
        const sa =
          typeof l.source === "string" ? nodeById.get(l.source) : l.source;
        const ta =
          typeof l.target === "string" ? nodeById.get(l.target) : l.target;
        if (
          !sa ||
          !ta ||
          sa.x == null ||
          ta.x == null ||
          sa.y == null ||
          ta.y == null
        ) {
          continue;
        }
        const x = sa.x + (ta.x - sa.x) * p.progress;
        const y = sa.y + (ta.y - sa.y) * p.progress;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#79c0ff";
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    pulsePhase += 0.04;
    const glowAlpha = 0.12 + 0.08 * Math.sin(pulsePhase);

    for (const n of simNodes) {
      if (n.x == null || n.y == null) continue;
      if (n.type === "project") {
        const r = nodeRadius(n);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = projectFill(n);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const colour = liveFill(n);
        const size = 8;
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 18);
        const alphaHex = Math.round(glowAlpha * 255)
          .toString(16)
          .padStart(2, "0");
        glow.addColorStop(0, `${colour}${alphaHex}`);
        glow.addColorStop(1, `${colour}00`);
        ctx.fillStyle = glow;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = colour;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8 / scale;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y - size);
        ctx.lineTo(n.x + size, n.y);
        ctx.lineTo(n.x, n.y + size);
        ctx.lineTo(n.x - size, n.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const selectedId = options?.getSelectedNodeId?.();
    if (selectedId) {
      const sel = nodeById.get(selectedId);
      if (sel?.x != null && sel.y != null) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, 14 / scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (scale > 3) {
      ctx.globalAlpha = Math.min(1, (scale - 3) * 0.6);
      const fontPx = Math.max(8, (9 / scale) * 3);
      ctx.font = `${fontPx}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue;
        const r = nodeRadius(n);
        const label =
          n.title.length > 42 ? `${n.title.slice(0, 42)}…` : n.title;
        ctx.fillText(label, n.x + r + 3, n.y + 4);
      }
    }

    ctx.restore();
  }

  function updateTooltip(node: SimNode | null, cx: number, cy: number) {
    if (!node) {
      tooltipEl.style.display = "none";
      return;
    }
    const lines: string[] = [escapeHtml(node.title)];
    if (node.type === "project") {
      if (node.lead_funder) lines.push(escapeHtml(node.lead_funder));
      if (node.score != null) lines.push(`Score: ${node.score.toFixed(3)}`);
    } else {
      if (node.funder) lines.push(escapeHtml(node.funder));
      if (node.status) lines.push(`Status: ${escapeHtml(node.status)}`);
      if (node.deadline) lines.push(`Deadline: ${escapeHtml(node.deadline)}`);
    }
    tooltipEl.innerHTML = lines
      .map((l, i) =>
        i === 0
          ? `<strong>${l}</strong>`
          : `<span style="color:#8b949e">${l}</span>`,
      )
      .join("<br>");
    tooltipEl.style.display = "block";
    const tw = 290;
    const th = 80;
    const left = cx + 14 + tw > window.innerWidth ? cx - tw - 8 : cx + 14;
    const top = cy + th > window.innerHeight ? cy - th : cy + 4;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function frame() {
    if (isDestroyed) return;
    if (sim && layoutPinsReleased && !simSettledFrozen) {
      if ((sim.alpha() ?? 0) > sim.alphaMin()) {
        sim.tick();
      } else {
        freezeNodesAtSettledPositions();
        simSettledFrozen = true;
      }
    }
    if (particleSpeed > 0) {
      for (const p of particles) {
        if (!isEdgeTypeVisible(p.link.edge_type)) continue;
        p.progress = (p.progress + particleSpeed) % 1;
      }
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function syncSize() {
    W = root.clientWidth;
    H = root.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
  }

  function onResize() {
    syncSize();
    if (simNodes.length > 0) {
      fitAll();
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.88 : 1.14;
    const newScale = Math.max(0.15, Math.min(8, scale * delta));
    tx = sx - (sx - tx) * (newScale / scale);
    ty = sy - (sy - ty) * (newScale / scale);
    scale = newScale;
  }

  function onMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);
    const hit = hitTest(wx, wy);
    if (hit) {
      dragState = {
        kind: "node",
        node: hit,
        downX: e.clientX,
        downY: e.clientY,
      };
      hit.fx = hit.x;
      hit.fy = hit.y;
    } else {
      dragState = {
        kind: "pan",
        hasMoved: false,
        downX: e.clientX,
        downY: e.clientY,
        startTx: tx,
        startTy: ty,
      };
    }
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);

    if (dragState?.kind === "node") {
      const node = dragState.node;
      node.fx = wx;
      node.fy = wy;
      node.x = wx;
      node.y = wy;
      canvas.style.cursor = "grabbing";
      updateTooltip(null, 0, 0);
      return;
    }

    if (dragState?.kind === "pan") {
      const moved = Math.hypot(
        e.clientX - dragState.downX,
        e.clientY - dragState.downY,
      );
      if (moved > 1) dragState.hasMoved = true;
      tx = dragState.startTx + (e.clientX - dragState.downX);
      ty = dragState.startTy + (e.clientY - dragState.downY);
      canvas.style.cursor = "grabbing";
      updateTooltip(null, 0, 0);
      return;
    }

    const hover = hitTest(wx, wy);
    canvas.style.cursor = hover ? "pointer" : "grab";
    updateTooltip(hover, e.clientX, e.clientY);
  }

  function onMouseUp(e: MouseEvent) {
    if (dragState?.kind === "node") {
      if (sim) sim.alphaTarget(0);
      const n = dragState.node;
      if (n.x != null && n.y != null) {
        n.fx = n.x;
        n.fy = n.y;
        simSettledFrozen = true;
      } else {
        n.fx = null;
        n.fy = null;
      }
      const moved = Math.hypot(
        e.clientX - dragState.downX,
        e.clientY - dragState.downY,
      );
      if (moved <= 4) {
        options?.onNodeClick?.(dragState.node);
      }
    } else if (dragState?.kind === "pan") {
      const moved = Math.hypot(
        e.clientX - dragState.downX,
        e.clientY - dragState.downY,
      );
      if (!dragState.hasMoved && moved <= 4) {
        options?.onNodeClick?.(null);
      }
    }
    dragState = null;
    canvas.style.cursor = "grab";
  }

  function onMouseLeave() {
    if (dragState?.kind === "node") {
      sim?.alphaTarget(0);
      const n = dragState.node;
      if (n.x != null && n.y != null) {
        n.fx = n.x;
        n.fy = n.y;
        simSettledFrozen = true;
      } else {
        n.fx = null;
        n.fy = null;
      }
    }
    dragState = null;
    canvas.style.cursor = "grab";
    updateTooltip(null, 0, 0);
  }

  function onDoubleClick() {
    fitAll();
  }

  function reheat() {
    if (!sim || !layoutPinsReleased || !layoutSpreadEnabled()) return;
    simSettledFrozen = false;
    for (const n of simNodes) {
      n.fx = null;
      n.fy = null;
      n.vx = 0;
      n.vy = 0;
    }
    sim.alpha(0.18);
  }

  function setParticleSpeed(v: number) {
    particleSlider = v;
    particleSpeed = sliderToParticleSpeed(v);
  }

  syncSize();
  const fullNodes = toSimNodes(data, W, H);
  const fullNodeIds = new Set(fullNodes.map((n) => n.id));
  const linksForSim = filterLinksForNodeIds(data.links, fullNodeIds);
  const fullLinks = toSimLinks(linksForSim);
  c.__allNodes = fullNodes;
  c.__allLinks = data.links;
  c.__rebuildSim = (nodes, links) => {
    rebuildFromFiltered(nodes, links);
  };
  c.__setParticleSpeed = (v: number) => {
    setParticleSpeed(v);
  };

  buildSimulation(fullNodes, fullLinks);
  c.__respawnParticlesForEdges = () => {
    respawnParticlesForEdges();
  };
  c.__setLayoutSpreadMode = (spread: boolean) => {
    applyLayoutSpreadMode(spread);
  };
  setParticleSpeed(particleSlider);
  fitAll();
  draw();

  options?.onFitReady?.(fitAll);
  options?.onReheatReady?.(reheat);

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("mouseup", onMouseUp);

  const ro = new ResizeObserver(onResize);
  ro.observe(root);

  rafId = requestAnimationFrame(frame);

  return () => {
    isDestroyed = true;
    cancelAnimationFrame(rafId);
    clearTimers();
    stopSim();
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("mouseleave", onMouseLeave);
    canvas.removeEventListener("dblclick", onDoubleClick);
    window.removeEventListener("mouseup", onMouseUp);
    ro.disconnect();
    tooltipEl.remove();
    delete c.__allNodes;
    delete c.__allLinks;
    delete c.__rebuildSim;
    delete c.__setParticleSpeed;
    delete c.__respawnParticlesForEdges;
    delete c.__setLayoutSpreadMode;
  };
}
