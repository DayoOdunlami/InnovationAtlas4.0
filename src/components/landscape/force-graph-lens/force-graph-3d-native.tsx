"use client";

// ---------------------------------------------------------------------------
// ForceGraph3DNative — Phase 3d near-verbatim port of the POC
// (`docs/force-graph-lens-poc.html`) into React + Three.js.
//
// Goals (Phase 3d execution prompt):
//   * Primary 3D renderer with real landscape data via `adaptLandscapeData`.
//   * Binary-star compare mode (violet/green interpolation + anchors).
//   * Theme variants (dark/light/print) consumed by THREE materials.
//   * Camera presets exposed via imperative `LensRenderHandle` (fit,
//     topdown, reset, flythrough, tweenTo) so wrappers can run
//     AI-authored fly-throughs.
//   * Clean mount/unmount with geometry/material/texture disposal so
//     React strict-mode double-mount doesn't leak WebGL contexts.
//
// The POC `<script>` was copied function-by-function; the seam changes
// are: (1) the data builder is replaced with a React prop, (2) the
// similarity map is supplied externally by `useGravitySearch`, (3) the
// compare similarity is built the same way (two hooks, merged here),
// (4) DOM event listeners attach to the canvas ref. The orbit math,
// tween curve, collide force, layout transforms, cluster volume /
// label fade thresholds, edge colour logic, and hover/click semantics
// are kept line-for-line with the POC.
// ---------------------------------------------------------------------------

import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CFG,
  type LensGraph,
  type LensNode,
  type LensZAxis,
  type SimilarityMap,
} from "./types";
import { computeClusterStats } from "./data-adapter";
import {
  getThemeTokens,
  hexToThreeColour,
  type LensTheme,
} from "./theme-tokens";

export type LensMode = "explore" | "gravity" | "compare";

export type LensToggles = {
  edges: boolean;
  rings: boolean;
  volumes: boolean;
  spread: boolean;
};

export type CameraPreset = "fit" | "topdown" | "reset";

export type FlythroughStopTarget =
  | { kind: "node"; nodeId: string; distance?: number }
  | { kind: "cluster"; clusterId: number; distance?: number }
  | { kind: "compare"; distance?: number }
  | {
      kind: "camera";
      target?: { x: number; y: number; z: number };
      theta?: number;
      phi?: number;
      distance?: number;
    };

export type LensRenderHandle = {
  captureViewport: () => string | null;
  cameraFit: (durationMs?: number) => void;
  cameraTopDown: (durationMs?: number) => void;
  cameraReset: (durationMs?: number) => void;
  tweenTo: (target: FlythroughStopTarget, durationMs?: number) => void;
  getNodePosition: (id: string) => { x: number; y: number; z: number } | null;
  getClusterCentroid: (
    clusterId: number,
  ) => { x: number; y: number; z: number } | null;
};

export type ForceGraph3DNativeProps = {
  graph: LensGraph;
  mode: LensMode;
  zAxis: LensZAxis;
  queryAText: string | null;
  queryBText: string | null;
  similarityA: SimilarityMap | null;
  similarityB: SimilarityMap | null;
  focusedId: string | null;
  hoveredId?: string | null;
  toggles: LensToggles;
  theme: LensTheme;
  cameraPreset?: "topdown" | "fit" | "explore";
  onHover?: (node: LensNode | null, clientX: number, clientY: number) => void;
  onSelect?: (node: LensNode | null) => void;
  handleRef?: React.MutableRefObject<LensRenderHandle | null>;
  className?: string;
};

// ---------------------------------------------------------------------------
// POC helpers — kept as pure functions so the React effect can call
// them after `state` is assembled.
// ---------------------------------------------------------------------------

function zValue(n: LensNode, axis: LensZAxis): number {
  switch (axis) {
    case "flat":
      return 0;
    case "score":
      return ((n.score ?? 0.5) - 0.5) * CFG.Z_SCALE;
    case "time": {
      if (!n.start_year) return 0;
      return ((n.start_year - 2006) / 20 - 0.5) * CFG.Z_SCALE;
    }
    case "funding": {
      if (!n.funding_amount) return 0;
      return (
        (Math.min(Math.log10(Math.max(n.funding_amount, 1)) / 8, 1) - 0.5) *
        CFG.Z_SCALE
      );
    }
  }
  return 0;
}

function nodeRadius(n: LensNode): number {
  if (n.type === "live_call") return 9;
  if (n.type === "query") return 10;
  return 4 + (n.score ?? 0.5) * 5;
}

function nodeBaseColour(
  n: LensNode,
  tokens: ReturnType<typeof getThemeTokens>,
): THREE.Color {
  if (n.type === "live_call")
    return new THREE.Color(hexToThreeColour(tokens.live));
  // POC-style score ramp but anchored on the theme's project hue.
  const base = new THREE.Color(hexToThreeColour(tokens.project));
  const strong = new THREE.Color(hexToThreeColour(tokens.projectStrong));
  const s = n.score ?? 0.5;
  return base.clone().lerp(strong, Math.max(0, Math.min(1, s)));
}

function nodeColourForMode(
  n: LensNode,
  mode: LensMode,
  similarityA: SimilarityMap | null,
  similarityB: SimilarityMap | null,
  tokens: ReturnType<typeof getThemeTokens>,
): THREE.Color {
  if (mode === "compare" && similarityA && similarityB) {
    const simA = similarityA.get(n.id) ?? 0;
    const simB = similarityB.get(n.id) ?? 0;
    const total = simA + simB;
    // POC line 1073: `total < 0.05` → slate.
    if (total < 0.05) return new THREE.Color(0.3, 0.35, 0.42);
    const aWeight = simA / total;
    const qa = new THREE.Color(hexToThreeColour(tokens.queryA));
    const qb = new THREE.Color(hexToThreeColour(tokens.queryB));
    const mix = qb.clone().lerp(qa, aWeight);
    const max = Math.max(simA, simB);
    const grey = new THREE.Color(0.3, 0.35, 0.42);
    return grey.clone().lerp(mix, Math.min(1, max * 1.3));
  }
  if (mode === "gravity" && similarityA) {
    const s = similarityA.get(n.id) ?? 0;
    const dim = new THREE.Color(0.51, 0.57, 0.65);
    const strong = new THREE.Color(hexToThreeColour(tokens.queryA));
    return dim.clone().lerp(strong, Math.min(1, s * 1.25));
  }
  return nodeBaseColour(n, tokens);
}

// POC `computeSimilarity` — fallback for nodes without a server-side
// embedding hit. We prefer the real similarity map; this only kicks in
// when the map is missing and we want ordering for the fly-through.
function similarityFallback(query: string, node: LensNode): number {
  const q = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const text = `${node.cluster_tag ?? ""} ${node.title}`.toLowerCase();
  let hits = 0;
  for (const w of q) if (text.includes(w)) hits += 1;
  const base = hits / Math.max(q.length, 1);
  const jitter = (node.id.charCodeAt(node.id.length - 1) % 20) / 100;
  return Math.min(1, Math.max(0, base * 0.85 + jitter * 0.15));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForceGraph3DNative(props: ForceGraph3DNativeProps) {
  const {
    graph,
    mode,
    zAxis,
    queryAText,
    queryBText,
    similarityA,
    similarityB,
    focusedId,
    toggles,
    theme,
    cameraPreset = "explore",
    onHover,
    onSelect,
    handleRef,
    className,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mutable refs so we can push updates into the scene without tearing
  // down the WebGL context on every React prop change. All three.js
  // meshes/materials are owned by the mount effect.
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: {
      target: THREE.Vector3;
      theta: number;
      phi: number;
      distance: number;
      minDistance: number;
      maxDistance: number;
      tweenStart: number | null;
      tweenFrom: {
        target: THREE.Vector3;
        theta: number;
        phi: number;
        distance: number;
      } | null;
      tweenEnd: {
        target?: THREE.Vector3;
        theta?: number;
        phi?: number;
        distance?: number;
      } | null;
      tweenDuration: number;
    };
    nodeGeom: THREE.SphereGeometry;
    nodeMeshes: Map<string, THREE.Mesh>;
    nodeLabelSprites: Map<string, THREE.Sprite>;
    clusterLabelSprites: Map<number, THREE.Sprite>;
    clusterVolumes: Map<number, THREE.Mesh>;
    clusterStats: Map<
      number,
      { cx: number; cy: number; cz: number; radius: number }
    >;
    ringMeshes: THREE.Object3D[];
    anchorMeshes: THREE.Object3D[];
    edgeGeom: THREE.BufferGeometry | null;
    edgeMesh: THREE.LineSegments | null;
    raf: number | null;
    dispose: () => void;
    tokens: ReturnType<typeof getThemeTokens>;
    mode: LensMode;
    zAxis: LensZAxis;
    toggles: LensToggles;
    focusedId: string | null;
    hoveredId: string | null;
    simA: SimilarityMap | null;
    simB: SimilarityMap | null;
    graph: LensGraph;
    queryAText: string | null;
    queryBText: string | null;
  } | null>(null);

  const internalHoverRef = useRef<string | null>(null);

  // Cluster stats reference — kept out of state so recompute can run
  // after every layout transition without rebuilding mesh maps.
  const clusterStatsMemo = useMemo(
    () => computeClusterStats({ nodes: graph.nodes, links: [] }),
    [graph.nodes],
  );

  // Mount — one-time build of scene, camera, meshes, and the animation
  // loop. All subsequent prop changes apply in-place to the existing
  // scene via the other effects further down.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const canvasEl = canvas;
    const wrapEl = wrap;

    const tokens = getThemeTokens(theme);

    const scene = new THREE.Scene();
    // Background colour from theme; keeps `toDataURL` usable for JARVIS.
    const bg = new THREE.Color(hexToThreeColour(tokens.bg0));
    scene.background = bg;
    // POC fog line 952, adjusted so light/print themes don't wash out.
    if (theme === "dark") {
      scene.fog = new THREE.Fog(hexToThreeColour(tokens.bg0), 900, 2600);
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
    scene.add(new THREE.AmbientLight(0xffffff, theme === "dark" ? 0.85 : 1.05));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
    dirLight.position.set(200, 400, 200);
    scene.add(dirLight);

    const orbit = {
      target: new THREE.Vector3(0, 0, 0),
      theta: Math.PI / 4,
      phi: Math.PI / 3.2,
      distance: 900,
      minDistance: 80,
      maxDistance: 2800,
      tweenStart: null as number | null,
      tweenFrom: null as null | {
        target: THREE.Vector3;
        theta: number;
        phi: number;
        distance: number;
      },
      tweenEnd: null as null | {
        target?: THREE.Vector3;
        theta?: number;
        phi?: number;
        distance?: number;
      },
      tweenDuration: 0,
    };

    function updateCameraFromOrbit() {
      const x =
        orbit.target.x +
        orbit.distance * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      const y = orbit.target.y + orbit.distance * Math.cos(orbit.phi);
      const z =
        orbit.target.z +
        orbit.distance * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.set(x, y, z);
      camera.lookAt(orbit.target);
    }
    updateCameraFromOrbit();

    // Node meshes / labels (built once per unique node set).
    const nodeGeom = new THREE.SphereGeometry(1, 16, 12);
    const nodeMeshes = new Map<string, THREE.Mesh>();
    const nodeLabelSprites = new Map<string, THREE.Sprite>();
    const clusterLabelSprites = new Map<number, THREE.Sprite>();
    const clusterVolumes = new Map<number, THREE.Mesh>();

    stateRef.current = {
      renderer,
      scene,
      camera,
      orbit,
      nodeGeom,
      nodeMeshes,
      nodeLabelSprites,
      clusterLabelSprites,
      clusterVolumes,
      clusterStats: new Map(),
      ringMeshes: [],
      anchorMeshes: [],
      edgeGeom: null,
      edgeMesh: null,
      raf: null,
      dispose: () => {},
      tokens,
      mode,
      zAxis,
      toggles,
      focusedId,
      hoveredId: null,
      simA: similarityA,
      simB: similarityB,
      graph,
      queryAText,
      queryBText,
    };

    function resize() {
      const w = wrapEl.clientWidth;
      const h = wrapEl.clientHeight;
      if (w < 2 || h < 2) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);

    // --- Pointer handling (POC lines 993–1028 + 1303–1313).
    let dragging = false;
    let dragBtn = 0;
    let dragMoved = 0;
    let lastMouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();

    function pickNode(clientX: number, clientY: number): LensNode | null {
      const rect = canvasEl.getBoundingClientRect();
      mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObjects(
        Array.from(nodeMeshes.values()),
        false,
      );
      return hits.length ? (hits[0].object.userData.node as LensNode) : null;
    }

    function onMouseDown(e: MouseEvent) {
      dragging = true;
      dragBtn = e.button;
      dragMoved = 0;
      lastMouse = { x: e.clientX, y: e.clientY };
      canvasEl.classList.add("dragging");
      cancelOrbitTween();
    }
    function onMouseUpGlobal() {
      dragging = false;
      canvasEl.classList.remove("dragging");
    }
    function onMouseMoveGlobal(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      lastMouse = { x: e.clientX, y: e.clientY };
      if (dragBtn === 0 && !e.shiftKey) {
        orbit.theta -= dx * 0.005;
        orbit.phi -= dy * 0.005;
        orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbit.phi));
      } else {
        const panScale = orbit.distance * 0.0012;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        right.setFromMatrixColumn(camera.matrix, 0);
        up.setFromMatrixColumn(camera.matrix, 1);
        orbit.target.addScaledVector(right, -dx * panScale);
        orbit.target.addScaledVector(up, dy * panScale);
      }
      updateCameraFromOrbit();
    }
    function onCanvasMouseMove(e: MouseEvent) {
      if (dragging) {
        onHover?.(null, 0, 0);
        return;
      }
      const node = pickNode(e.clientX, e.clientY);
      internalHoverRef.current = node?.id ?? null;
      if (stateRef.current) stateRef.current.hoveredId = node?.id ?? null;
      onHover?.(node, e.clientX, e.clientY);
    }
    function onCanvasMouseLeave() {
      internalHoverRef.current = null;
      if (stateRef.current) stateRef.current.hoveredId = null;
      onHover?.(null, 0, 0);
    }
    function onCanvasClick(e: MouseEvent) {
      if (dragMoved > 6) return;
      const node = pickNode(e.clientX, e.clientY);
      onSelect?.(node ?? null);
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      orbit.distance = Math.max(
        orbit.minDistance,
        Math.min(
          orbit.maxDistance,
          orbit.distance * Math.pow(1.0015, e.deltaY),
        ),
      );
      updateCameraFromOrbit();
    }
    function cancelOrbitTween() {
      orbit.tweenStart = null;
    }

    canvasEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUpGlobal);
    window.addEventListener("mousemove", onMouseMoveGlobal);
    canvasEl.addEventListener("mousemove", onCanvasMouseMove);
    canvasEl.addEventListener("mouseleave", onCanvasMouseLeave);
    canvasEl.addEventListener("click", onCanvasClick);
    canvasEl.addEventListener("wheel", onWheel, { passive: false });
    canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());

    // --- Render loop -------------------------------------------------
    function updateOrbitTween(now: number) {
      if (!orbit.tweenStart) return;
      const t = Math.min(1, (now - orbit.tweenStart) / orbit.tweenDuration);
      const ease = 1 - Math.pow(1 - t, 3);
      const f = orbit.tweenFrom;
      const e = orbit.tweenEnd;
      if (!f || !e) {
        orbit.tweenStart = null;
        return;
      }
      if (e.target) orbit.target.lerpVectors(f.target, e.target, ease);
      if (e.theta !== undefined)
        orbit.theta = f.theta + (e.theta - f.theta) * ease;
      if (e.phi !== undefined) orbit.phi = f.phi + (e.phi - f.phi) * ease;
      if (e.distance !== undefined)
        orbit.distance = f.distance + (e.distance - f.distance) * ease;
      updateCameraFromOrbit();
      if (t >= 1) orbit.tweenStart = null;
    }

    function animate(now: number) {
      updateOrbitTween(now);
      updateLabelsInScene();
      renderer.render(scene, camera);
      if (stateRef.current)
        stateRef.current.raf = requestAnimationFrame(animate);
    }
    if (stateRef.current) stateRef.current.raf = requestAnimationFrame(animate);

    function updateLabelsInScene() {
      const s = stateRef.current;
      if (!s) return;
      const cameraDist = camera.position.distanceTo(orbit.target);
      const clusterOpacity =
        s.mode === "explore"
          ? Math.min(
              1,
              Math.max(
                0,
                (cameraDist - CFG.CLUSTER_LABEL_FADE_END) /
                  (CFG.CLUSTER_LABEL_FADE_START - CFG.CLUSTER_LABEL_FADE_END),
              ),
            )
          : 0;

      for (const [cid, sprite] of s.clusterLabelSprites) {
        const stat = s.clusterStats.get(cid);
        const vol = s.clusterVolumes.get(cid);
        if (!stat) continue;
        sprite.position.set(stat.cx, stat.cy + stat.radius * 0.7 + 30, stat.cz);
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.opacity += (clusterOpacity * 0.92 - mat.opacity) * 0.15;
        if (vol) {
          vol.position.set(stat.cx, stat.cy, stat.cz);
          vol.scale.setScalar(stat.radius);
          const volTarget =
            s.toggles.volumes && s.mode === "explore"
              ? clusterOpacity * 0.08
              : 0;
          const vmat = vol.material as THREE.MeshBasicMaterial;
          vmat.opacity += (volTarget - vmat.opacity) * 0.15;
        }
      }

      for (const n of s.graph.nodes) {
        const sprite = s.nodeLabelSprites.get(n.id);
        if (!sprite || n.x === undefined) continue;
        const r = nodeRadius(n);
        sprite.position.set(n.x, (n.y ?? 0) + r + 8, n.z ?? 0);
        let target = 0;
        if (s.focusedId === n.id) target = 1.0;
        else if (s.hoveredId === n.id) target = 1.0;
        else if (s.mode === "explore") {
          if (cameraDist < CFG.NODE_LABEL_FADE_START) {
            target =
              Math.max(0, 1 - cameraDist / CFG.NODE_LABEL_FADE_START) * 0.9;
            target *= 1 - clusterOpacity * 0.7;
          }
          if (n.type === "live_call" && n.status === "open") {
            target = Math.max(target, 0.4 * (1 - clusterOpacity));
          }
        } else if (s.mode === "gravity" || s.mode === "compare") {
          const simA = s.simA?.get(n.id) ?? 0;
          const simB = s.simB?.get(n.id) ?? 0;
          const maxSim = Math.max(simA, simB);
          if (maxSim > 0.7) target = Math.min(1, maxSim);
          else if (cameraDist < 300) target = 0.4;
        }
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.opacity += (target - mat.opacity) * 0.12;
      }
    }

    stateRef.current!.dispose = () => {
      if (stateRef.current?.raf) cancelAnimationFrame(stateRef.current.raf);
      ro.disconnect();
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUpGlobal);
      window.removeEventListener("mousemove", onMouseMoveGlobal);
      canvasEl.removeEventListener("mousemove", onCanvasMouseMove);
      canvasEl.removeEventListener("mouseleave", onCanvasMouseLeave);
      canvasEl.removeEventListener("click", onCanvasClick);
      canvasEl.removeEventListener("wheel", onWheel);
      for (const mesh of nodeMeshes.values()) {
        mesh.material instanceof THREE.Material && mesh.material.dispose();
      }
      nodeGeom.dispose();
      for (const spr of nodeLabelSprites.values()) {
        const m = spr.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
      }
      for (const spr of clusterLabelSprites.values()) {
        const m = spr.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
      }
      for (const vol of clusterVolumes.values()) {
        vol.geometry.dispose();
        (vol.material as THREE.Material).dispose();
      }
      for (const m of stateRef.current?.ringMeshes ?? []) {
        if (m instanceof THREE.Mesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      }
      for (const m of stateRef.current?.anchorMeshes ?? []) {
        if (m instanceof THREE.Mesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        } else if (m instanceof THREE.Line) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        } else if (m instanceof THREE.Sprite) {
          const mt = m.material as THREE.SpriteMaterial;
          mt.map?.dispose();
          mt.dispose();
        }
      }
      stateRef.current?.edgeGeom?.dispose();
      (
        stateRef.current?.edgeMesh?.material as THREE.Material | undefined
      )?.dispose();
      renderer.dispose();
    };

    return () => {
      stateRef.current?.dispose();
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild node meshes when the graph changes (new node ids).
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.graph = graph;
    s.tokens = getThemeTokens(theme);
    const { scene, nodeMeshes, nodeLabelSprites, nodeGeom, tokens } = s;

    // Diff: remove meshes for nodes no longer in the graph.
    const wanted = new Set(graph.nodes.map((n) => n.id));
    for (const [id, mesh] of nodeMeshes) {
      if (!wanted.has(id)) {
        scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        nodeMeshes.delete(id);
      }
    }
    for (const [id, spr] of nodeLabelSprites) {
      if (!wanted.has(id)) {
        scene.remove(spr);
        const m = spr.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
        nodeLabelSprites.delete(id);
      }
    }
    // Add meshes + label sprites for new nodes.
    for (const n of graph.nodes) {
      if (!nodeMeshes.has(n.id)) {
        const col = nodeBaseColour(n, tokens);
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col.clone().multiplyScalar(0.3),
          roughness: 0.55,
          metalness: 0.1,
          transparent: true,
          opacity: 1,
        });
        const mesh = new THREE.Mesh(nodeGeom, mat);
        mesh.scale.setScalar(nodeRadius(n));
        mesh.userData.node = n;
        scene.add(mesh);
        nodeMeshes.set(n.id, mesh);
      } else {
        // Keep userData.node fresh so hover cards see the latest fields.
        nodeMeshes.get(n.id)!.userData.node = n;
      }
      if (!nodeLabelSprites.has(n.id)) {
        const colour = n.type === "live_call" ? tokens.live : tokens.project;
        const spr = makeTextSprite(n.title, colour);
        scene.add(spr);
        nodeLabelSprites.set(n.id, spr);
      }
    }

    // Cluster labels + volumes keyed by cluster id.
    const clusterIds = new Set<number>();
    for (const n of graph.nodes) {
      if (typeof n.cluster_id === "number") clusterIds.add(n.cluster_id);
    }
    for (const [cid, spr] of s.clusterLabelSprites) {
      if (!clusterIds.has(cid)) {
        scene.remove(spr);
        const m = spr.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
        s.clusterLabelSprites.delete(cid);
        const vol = s.clusterVolumes.get(cid);
        if (vol) {
          scene.remove(vol);
          vol.geometry.dispose();
          (vol.material as THREE.Material).dispose();
          s.clusterVolumes.delete(cid);
        }
      }
    }
    for (const cid of clusterIds) {
      if (!s.clusterLabelSprites.has(cid)) {
        const sample = graph.nodes.find((n) => n.cluster_id === cid);
        const label = sample?.cluster_label ?? `Cluster ${cid}`;
        const spr = makeClusterLabelSprite(label, tokens.ink);
        scene.add(spr);
        s.clusterLabelSprites.set(cid, spr);
      }
      if (!s.clusterVolumes.has(cid)) {
        const geom = new THREE.SphereGeometry(1, 24, 18);
        const vmat = new THREE.MeshBasicMaterial({
          color: hexToThreeColour(tokens.project),
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
        });
        const vol = new THREE.Mesh(geom, vmat);
        scene.add(vol);
        s.clusterVolumes.set(cid, vol);
      }
    }

    // Build edges — rebuild from scratch whenever the link set changes.
    if (s.edgeMesh) {
      scene.remove(s.edgeMesh);
      s.edgeMesh = null;
    }
    s.edgeGeom?.dispose();
    const linkCount = graph.links.length;
    const positions = new Float32Array(linkCount * 6);
    const colors = new Float32Array(linkCount * 6);
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    edgeGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: theme === "dark" ? 0.4 : 0.55,
    });
    const edgeMesh = new THREE.LineSegments(edgeGeom, edgeMat);
    scene.add(edgeMesh);
    s.edgeGeom = edgeGeom;
    s.edgeMesh = edgeMesh;
  }, [graph, theme]);

  // Apply layout / styling / ring guides whenever the inputs change.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.mode = mode;
    s.zAxis = zAxis;
    s.toggles = toggles;
    s.focusedId = focusedId;
    s.simA = similarityA;
    s.simB = similarityB;
    s.queryAText = queryAText;
    s.queryBText = queryBText;
    s.tokens = getThemeTokens(theme);

    applyMode(s, mode, zAxis, similarityA, similarityB, queryAText, queryBText);
    refreshNodeStyling(s);
    syncMeshes(s);
    updateEdges(s);
    s.clusterStats = recomputeClusterStatsFromGraph(s.graph);
    renderRingGuides(s, s.mode === "gravity" && s.toggles.rings);
    renderCompareAnchors(
      s,
      s.mode === "compare" && !!queryAText && !!queryBText,
    );
  }, [
    mode,
    zAxis,
    similarityA,
    similarityB,
    queryAText,
    queryBText,
    focusedId,
    toggles,
    theme,
    graph,
  ]);

  // Initial camera preset when a block first mounts (brief embeds).
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    // Only auto-run once per preset change — the user may still orbit.
    if (cameraPreset === "topdown") {
      cameraTopDown(s, 0);
    } else if (cameraPreset === "fit") {
      cameraFit(s, 0);
    }
  }, [cameraPreset]);

  // Expose imperative handle for fly-through / share snapshotting.
  useImperativeHandle(
    handleRef as unknown as React.Ref<LensRenderHandle>,
    () => ({
      captureViewport: () => {
        const s = stateRef.current;
        if (!s) return null;
        s.renderer.render(s.scene, s.camera);
        const canvas = canvasRef.current;
        return canvas ? canvas.toDataURL("image/png") : null;
      },
      cameraFit: (dur) => stateRef.current && cameraFit(stateRef.current, dur),
      cameraTopDown: (dur) =>
        stateRef.current && cameraTopDown(stateRef.current, dur),
      cameraReset: (dur) =>
        stateRef.current && cameraReset(stateRef.current, dur),
      tweenTo: (target, dur) => {
        const s = stateRef.current;
        if (!s) return;
        tweenToTarget(s, target, dur ?? 800);
      },
      getNodePosition: (id) => {
        const s = stateRef.current;
        const n = s?.graph.nodes.find((x) => x.id === id);
        if (!n || n.x === undefined) return null;
        return { x: n.x, y: n.y ?? 0, z: n.z ?? 0 };
      },
      getClusterCentroid: (clusterId) => {
        const s = stateRef.current;
        const stat = s?.clusterStats.get(clusterId);
        if (!stat) return null;
        return { x: stat.cx, y: stat.cy, z: stat.cz };
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const clusterStatsKey = useMemo(
    () => Array.from(clusterStatsMemo.keys()).sort().join(","),
    [clusterStatsMemo],
  );

  void clusterStatsKey; // observed only to keep memo warm

  return (
    <div
      ref={wrapRef}
      className={[
        "relative h-full w-full overflow-hidden select-none",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="force-graph-lens-3d"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab"
        aria-label="Atlas landscape 3D force graph"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// POC label sprites — verbatim ports.
// ---------------------------------------------------------------------------

function makeTextSprite(text: string, colour: string, scale = 1): THREE.Sprite {
  if (typeof document === "undefined") {
    // jsdom fallback — return a dummy sprite so tests can mount the
    // renderer without WebGL.
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return new THREE.Sprite(mat);
  }
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d");
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return new THREE.Sprite(mat);
  }
  ctx.font = `600 ${28 * scale}px "JetBrains Mono", monospace`;
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const shown = text.length > 36 ? text.slice(0, 34) + "…" : text;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.fillText(shown, 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(80 * scale, 15 * scale, 1);
  return sprite;
}

function makeClusterLabelSprite(label: string, ink: string): THREE.Sprite {
  if (typeof document === "undefined") {
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return new THREE.Sprite(mat);
  }
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 144;
  const ctx = c.getContext("2d");
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return new THREE.Sprite(mat);
  }
  ctx.font = 'italic 500 56px "Fraunces", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(143,228,177,0.6)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = ink;
  ctx.fillText(label, 384, 72);
  ctx.shadowBlur = 0;
  ctx.fillStyle = ink;
  ctx.fillText(label, 384, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(240, 45, 1);
  return sprite;
}

// ---------------------------------------------------------------------------
// POC layout functions (verbatim body, React-state-aware wrapper).
// ---------------------------------------------------------------------------

function applyMode(
  s: Record<string, unknown> & {
    graph: LensGraph;
    mode: LensMode;
    zAxis: LensZAxis;
    simA: SimilarityMap | null;
    simB: SimilarityMap | null;
    queryAText: string | null;
    queryBText: string | null;
  },
  mode: LensMode,
  zAxis: LensZAxis,
  simA: SimilarityMap | null,
  simB: SimilarityMap | null,
  queryAText: string | null,
  queryBText: string | null,
) {
  if (mode === "explore") {
    for (const n of s.graph.nodes) {
      n.x = ((n.viz_x ?? 50) - 50) * CFG.X_SCALE;
      n.y = zValue(n, zAxis);
      n.z = ((n.viz_y ?? 50) - 50) * CFG.X_SCALE;
    }
    return;
  }
  if (mode === "gravity" && queryAText) {
    for (const n of s.graph.nodes) {
      const sim = simA?.get(n.id) ?? similarityFallback(queryAText, n);
      const radius = (1 - sim) * CFG.MAX_R;
      const angle = Math.atan2((n.viz_y ?? 50) - 50, (n.viz_x ?? 50) - 50);
      n.x = Math.cos(angle) * radius;
      n.y = n.type === "live_call" ? 40 : 0;
      n.z = Math.sin(angle) * radius;
    }
    return;
  }
  if (mode === "compare" && queryAText && queryBText) {
    for (const n of s.graph.nodes) {
      const sa = simA?.get(n.id) ?? similarityFallback(queryAText, n);
      const sb = simB?.get(n.id) ?? similarityFallback(queryBText, n);
      const total = sa + sb;
      const xOnAxis =
        total > 0.02 ? ((sb - sa) / total) * CFG.COMPARE_ANCHOR_X * 1.3 : 0;
      const maxSim = Math.max(sa, sb);
      const perpDist = (1 - maxSim) * CFG.MAX_R * 0.85;
      const umapAngle = Math.atan2((n.viz_y ?? 50) - 50, (n.viz_x ?? 50) - 50);
      n.x = xOnAxis + Math.cos(umapAngle) * perpDist * 0.25;
      n.y = n.type === "live_call" ? 30 : 0;
      n.z = Math.sin(umapAngle) * perpDist;
    }
    return;
  }
  // Fall back to explore so we never leave nodes unpositioned.
  for (const n of s.graph.nodes) {
    n.x = ((n.viz_x ?? 50) - 50) * CFG.X_SCALE;
    n.y = zValue(n, zAxis);
    n.z = ((n.viz_y ?? 50) - 50) * CFG.X_SCALE;
  }
}

function refreshNodeStyling(s: {
  graph: LensGraph;
  nodeMeshes: Map<string, THREE.Mesh>;
  mode: LensMode;
  simA: SimilarityMap | null;
  simB: SimilarityMap | null;
  focusedId: string | null;
  hoveredId: string | null;
  tokens: ReturnType<typeof getThemeTokens>;
}) {
  const { graph, nodeMeshes, mode, simA, simB, focusedId, hoveredId, tokens } =
    s;
  const warm = new THREE.Color(hexToThreeColour(tokens.warm));
  // 1-hop neighbour set from links.
  const neighbours = new Map<string, Set<string>>();
  for (const n of graph.nodes) neighbours.set(n.id, new Set());
  for (const l of graph.links) {
    neighbours.get(l.source_id)?.add(l.target_id);
    neighbours.get(l.target_id)?.add(l.source_id);
  }
  for (const n of graph.nodes) {
    const mesh = nodeMeshes.get(n.id);
    if (!mesh) continue;
    let col = nodeColourForMode(n, mode, simA, simB, tokens);
    let opacity = 1;
    if (focusedId === n.id) col = warm;
    else if (hoveredId) {
      const nb = neighbours.get(hoveredId);
      if (hoveredId !== n.id && !nb?.has(n.id)) opacity = 0.18;
    }
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(col);
    mat.emissive.copy(col).multiplyScalar(focusedId === n.id ? 0.5 : 0.3);
    mat.opacity = opacity;
  }
}

function syncMeshes(s: {
  graph: LensGraph;
  nodeMeshes: Map<string, THREE.Mesh>;
}) {
  for (const n of s.graph.nodes) {
    const mesh = s.nodeMeshes.get(n.id);
    if (mesh) mesh.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
  }
}

function updateEdges(s: {
  graph: LensGraph;
  edgeGeom: THREE.BufferGeometry | null;
  edgeMesh: THREE.LineSegments | null;
  nodeMeshes: Map<string, THREE.Mesh>;
  toggles: LensToggles;
  hoveredId: string | null;
  tokens: ReturnType<typeof getThemeTokens>;
}) {
  const { graph, edgeGeom, edgeMesh, nodeMeshes, toggles, hoveredId, tokens } =
    s;
  if (!edgeGeom || !edgeMesh) return;
  const pos = edgeGeom.attributes.position.array as Float32Array;
  const col = edgeGeom.attributes.color.array as Float32Array;
  const liveRgb = hexToRgbNormalised(tokens.live);
  const baseRgb = hexToRgbNormalised(tokens.inkFaint);
  const hoverRgb = hexToRgbNormalised(tokens.queryA);
  graph.links.forEach((l, i) => {
    const a = nodeMeshes.get(l.source_id)?.userData.node as
      | LensNode
      | undefined;
    const b = nodeMeshes.get(l.target_id)?.userData.node as
      | LensNode
      | undefined;
    if (!a || !b) return;
    pos[i * 6 + 0] = a.x ?? 0;
    pos[i * 6 + 1] = a.y ?? 0;
    pos[i * 6 + 2] = a.z ?? 0;
    pos[i * 6 + 3] = b.x ?? 0;
    pos[i * 6 + 4] = b.y ?? 0;
    pos[i * 6 + 5] = b.z ?? 0;
    let r: number, g: number, bc: number;
    if (l.edge_type === "live_match") {
      r = liveRgb.r;
      g = liveRgb.g;
      bc = liveRgb.b;
    } else {
      r = baseRgb.r;
      g = baseRgb.g;
      bc = baseRgb.b;
    }
    if (hoveredId && l.source_id !== hoveredId && l.target_id !== hoveredId) {
      r *= 0.2;
      g *= 0.2;
      bc *= 0.2;
    } else if (hoveredId) {
      r = hoverRgb.r;
      g = hoverRgb.g;
      bc = hoverRgb.b;
    }
    col[i * 6 + 0] = r;
    col[i * 6 + 1] = g;
    col[i * 6 + 2] = bc;
    col[i * 6 + 3] = r;
    col[i * 6 + 4] = g;
    col[i * 6 + 5] = bc;
  });
  edgeGeom.attributes.position.needsUpdate = true;
  edgeGeom.attributes.color.needsUpdate = true;
  edgeMesh.visible = toggles.edges;
}

function hexToRgbNormalised(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex);
  if (!m) return { r: 0.56, g: 0.89, b: 0.69 };
  const v = parseInt(m[1], 16);
  return {
    r: ((v >> 16) & 0xff) / 255,
    g: ((v >> 8) & 0xff) / 255,
    b: (v & 0xff) / 255,
  };
}

function recomputeClusterStatsFromGraph(graph: LensGraph) {
  return computeClusterStats({ nodes: graph.nodes, links: [] });
}

function renderRingGuides(
  s: {
    scene: THREE.Scene;
    ringMeshes: THREE.Object3D[];
    tokens: ReturnType<typeof getThemeTokens>;
  },
  visible: boolean,
) {
  for (const m of s.ringMeshes) {
    s.scene.remove(m);
    if (m instanceof THREE.Mesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
  s.ringMeshes = [];
  if (!visible) return;
  [CFG.MAX_R * 0.33, CFG.MAX_R * 0.66, CFG.MAX_R].forEach((r, i) => {
    const geom = new THREE.RingGeometry(r - 1.5, r + 1.5, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: hexToThreeColour(s.tokens.warm),
      transparent: true,
      opacity: 0.2 - i * 0.05,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    s.scene.add(mesh);
    s.ringMeshes.push(mesh);
  });
}

function renderCompareAnchors(
  s: {
    scene: THREE.Scene;
    anchorMeshes: THREE.Object3D[];
    tokens: ReturnType<typeof getThemeTokens>;
    queryAText: string | null;
    queryBText: string | null;
  },
  visible: boolean,
) {
  for (const m of s.anchorMeshes) {
    s.scene.remove(m);
    if (m instanceof THREE.Mesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    } else if (m instanceof THREE.Line) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    } else if (m instanceof THREE.Sprite) {
      const mt = m.material as THREE.SpriteMaterial;
      mt.map?.dispose();
      mt.dispose();
    }
  }
  s.anchorMeshes = [];
  if (!visible) return;

  const geomA = new THREE.SphereGeometry(16, 24, 16);
  const matA = new THREE.MeshBasicMaterial({
    color: hexToThreeColour(s.tokens.queryA),
    transparent: true,
    opacity: 0.8,
  });
  const meshA = new THREE.Mesh(geomA, matA);
  meshA.position.set(-CFG.COMPARE_ANCHOR_X * 1.3, 0, 0);
  s.scene.add(meshA);
  s.anchorMeshes.push(meshA);

  const geomB = new THREE.SphereGeometry(16, 24, 16);
  const matB = new THREE.MeshBasicMaterial({
    color: hexToThreeColour(s.tokens.queryB),
    transparent: true,
    opacity: 0.8,
  });
  const meshB = new THREE.Mesh(geomB, matB);
  meshB.position.set(CFG.COMPARE_ANCHOR_X * 1.3, 0, 0);
  s.scene.add(meshB);
  s.anchorMeshes.push(meshB);

  const lineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-CFG.COMPARE_ANCHOR_X * 1.3, 0, 0),
    new THREE.Vector3(CFG.COMPARE_ANCHOR_X * 1.3, 0, 0),
  ]);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x9d8bf0,
    transparent: true,
    opacity: 0.35,
  });
  const line = new THREE.Line(lineGeom, lineMat);
  s.scene.add(line);
  s.anchorMeshes.push(line);

  const lblA = makeTextSprite(
    "QUERY A · " + (s.queryAText ?? ""),
    s.tokens.queryA,
    1.3,
  );
  lblA.position.set(-CFG.COMPARE_ANCHOR_X * 1.3, 50, 0);
  (lblA.material as THREE.SpriteMaterial).opacity = 1;
  s.scene.add(lblA);
  s.anchorMeshes.push(lblA);

  const lblB = makeTextSprite(
    "QUERY B · " + (s.queryBText ?? ""),
    s.tokens.queryB,
    1.3,
  );
  lblB.position.set(CFG.COMPARE_ANCHOR_X * 1.3, 50, 0);
  (lblB.material as THREE.SpriteMaterial).opacity = 1;
  s.scene.add(lblB);
  s.anchorMeshes.push(lblB);
}

// ---------------------------------------------------------------------------
// Camera helpers (POC §CAMERA PRESETS).
// ---------------------------------------------------------------------------

function computeSceneBounds(graph: LensGraph): THREE.Box3 {
  const box = new THREE.Box3();
  for (const n of graph.nodes) {
    if (n.x !== undefined)
      box.expandByPoint(new THREE.Vector3(n.x, n.y ?? 0, n.z ?? 0));
  }
  return box;
}

function tweenOrbit(
  s: {
    orbit: {
      target: THREE.Vector3;
      theta: number;
      phi: number;
      distance: number;
      tweenStart: number | null;
      tweenFrom: {
        target: THREE.Vector3;
        theta: number;
        phi: number;
        distance: number;
      } | null;
      tweenEnd: {
        target?: THREE.Vector3;
        theta?: number;
        phi?: number;
        distance?: number;
      } | null;
      tweenDuration: number;
    };
  },
  end: {
    target?: THREE.Vector3;
    theta?: number;
    phi?: number;
    distance?: number;
  },
  duration = 800,
) {
  const { orbit } = s;
  orbit.tweenFrom = {
    target: orbit.target.clone(),
    theta: orbit.theta,
    phi: orbit.phi,
    distance: orbit.distance,
  };
  orbit.tweenEnd = end;
  orbit.tweenStart = performance.now();
  orbit.tweenDuration = Math.max(0, duration);
}

type SState = {
  graph: LensGraph;
  orbit: Parameters<typeof tweenOrbit>[0]["orbit"];
  clusterStats: Map<
    number,
    { cx: number; cy: number; cz: number; radius: number }
  >;
};

function cameraFit(s: SState, durationMs = 800) {
  const box = computeSceneBounds(s.graph);
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 1.8 + 200;
  tweenOrbit(
    s,
    { target: centre, distance: dist, theta: Math.PI / 4, phi: Math.PI / 3.2 },
    durationMs,
  );
}

function cameraTopDown(s: SState, durationMs = 800) {
  const box = computeSceneBounds(s.graph);
  if (box.isEmpty()) {
    tweenOrbit(
      s,
      {
        target: new THREE.Vector3(0, 0, 0),
        distance: 900,
        theta: 0,
        phi: 0.05,
      },
      durationMs,
    );
    return;
  }
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.z) * 1.1 + 200;
  tweenOrbit(
    s,
    { target: centre, distance: dist, theta: 0, phi: 0.05 },
    durationMs,
  );
}

function cameraReset(s: SState, durationMs = 800) {
  tweenOrbit(
    s,
    {
      target: new THREE.Vector3(0, 0, 0),
      distance: 900,
      theta: Math.PI / 4,
      phi: Math.PI / 3.2,
    },
    durationMs,
  );
}

function tweenToTarget(
  s: SState,
  target: FlythroughStopTarget,
  durationMs = 800,
) {
  if (target.kind === "node") {
    const n = s.graph.nodes.find((x) => x.id === target.nodeId);
    if (!n || n.x === undefined) return;
    tweenOrbit(
      s,
      {
        target: new THREE.Vector3(n.x, n.y ?? 0, n.z ?? 0),
        distance: target.distance ?? 160,
      },
      durationMs,
    );
    return;
  }
  if (target.kind === "cluster") {
    const stat = s.clusterStats.get(target.clusterId);
    if (!stat) return;
    tweenOrbit(
      s,
      {
        target: new THREE.Vector3(stat.cx, stat.cy, stat.cz),
        distance: target.distance ?? stat.radius * 2.5 + 220,
      },
      durationMs,
    );
    return;
  }
  if (target.kind === "compare") {
    tweenOrbit(
      s,
      {
        target: new THREE.Vector3(0, 0, 0),
        distance: target.distance ?? 1500,
        theta: 0,
        phi: 0.3,
      },
      durationMs,
    );
    return;
  }
  // kind: "camera"
  const end: {
    target?: THREE.Vector3;
    theta?: number;
    phi?: number;
    distance?: number;
  } = {};
  if (target.target)
    end.target = new THREE.Vector3(
      target.target.x,
      target.target.y,
      target.target.z,
    );
  if (target.theta !== undefined) end.theta = target.theta;
  if (target.phi !== undefined) end.phi = target.phi;
  if (target.distance !== undefined) end.distance = target.distance;
  tweenOrbit(s, end, durationMs);
}
