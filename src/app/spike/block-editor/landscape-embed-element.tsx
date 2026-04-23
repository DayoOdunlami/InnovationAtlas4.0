"use client";

import * as THREE from "three";
import {
  type PlateElementProps,
  PlateElement,
  useEditorRef,
  usePath,
} from "platejs/react";
import { useEffect, useReducer, useRef, useState } from "react";

type NodeState = {
  hoveredNodeId: number | null;
  selectedNodeId: number | null;
  cameraDistance: number;
};

type Action =
  | { type: "HOVER_NODE"; id: number | null }
  | { type: "SELECT_NODE"; id: number | null }
  | { type: "ZOOM_IN" }
  | { type: "ZOOM_OUT" }
  | { type: "RESET" };

const INITIAL_DISTANCE = 6;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 20;
const NODE_COUNT = 8;

const initialState: NodeState = {
  hoveredNodeId: null,
  selectedNodeId: null,
  cameraDistance: INITIAL_DISTANCE,
};

function reducer(state: NodeState, action: Action): NodeState {
  switch (action.type) {
    case "HOVER_NODE":
      return { ...state, hoveredNodeId: action.id };
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.id };
    case "ZOOM_IN":
      return {
        ...state,
        cameraDistance: Math.max(MIN_DISTANCE, state.cameraDistance - 0.8),
      };
    case "ZOOM_OUT":
      return {
        ...state,
        cameraDistance: Math.min(MAX_DISTANCE, state.cameraDistance + 0.8),
      };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

export function LandscapeEmbedElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div contentEditable={false} className="my-4 select-none">
        <LandscapeCanvas />
      </div>
      {props.children}
    </PlateElement>
  );
}

function LandscapeCanvas() {
  const editor = useEditorRef();
  const path = usePath();
  const pathRef = useRef(path);
  pathRef.current = path;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const forceError =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("force") === "error";
    if (forceError) {
      setStatus("error");
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus("ready");
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const container = canvasWrapperRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = 480;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, stateRef.current.cameraDistance);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.outline = "none";
    renderer.domElement.dataset.testid = "landscape-canvas";
    container.appendChild(renderer.domElement);

    const coreGeometry = new THREE.IcosahedronGeometry(1.2, 0);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x58a6ff,
      wireframe: true,
      emissive: 0x1f3b66,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const light = new THREE.PointLight(0xffffff, 1.2);
    light.position.set(5, 5, 5);
    scene.add(light);

    const nodes: THREE.Mesh[] = [];
    const nodeGeometries: THREE.SphereGeometry[] = [];
    const nodeMaterials: THREE.MeshStandardMaterial[] = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.25, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff9d66,
        emissive: 0x331100,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { nodeId: i };
      scene.add(mesh);
      nodes.push(mesh);
      nodeGeometries.push(geo);
      nodeMaterials.push(mat);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredLocal: number | null = null;

    const computePointer = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onMouseMove = (event: MouseEvent) => {
      computePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(nodes, false);
      const newHover = hits.length > 0 ? (hits[0].object.userData.nodeId as number) : null;
      if (newHover !== hoveredLocal) {
        hoveredLocal = newHover;
        dispatch({ type: "HOVER_NODE", id: newHover });
      }
    };

    const insertSiblingParagraph = (nodeId: number) => {
      const currentPath = pathRef.current;
      if (!currentPath) return;
      const siblingPath = [...currentPath];
      siblingPath[siblingPath.length - 1] = siblingPath[siblingPath.length - 1] + 1;
      editor.tf.insertNodes(
        {
          type: "p",
          children: [{ text: `Selected node: ${nodeId}` }],
        },
        { at: siblingPath, select: false },
      );
    };

    const onClick = (event: MouseEvent) => {
      computePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(nodes, false);
      if (hits.length > 0) {
        const nodeId = hits[0].object.userData.nodeId as number;
        dispatch({ type: "SELECT_NODE", id: nodeId });
        insertSiblingParagraph(nodeId);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: "ZOOM_IN" });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: "ZOOM_OUT" });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: "RESET" });
      }
    };

    const onTestNodeClick = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: number }>).detail;
      if (!detail) return;
      dispatch({ type: "SELECT_NODE", id: detail.nodeId });
      insertSiblingParagraph(detail.nodeId);
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("keydown", onKeyDown);
    container.addEventListener(
      "spike-landscape-node-click",
      onTestNodeClick as EventListener,
    );

    let cancelled = false;
    let frame = 0;
    const animate = () => {
      if (cancelled) return;
      frame = requestAnimationFrame(animate);
      core.rotation.x += 0.004;
      core.rotation.y += 0.006;

      const time = performance.now() * 0.001;
      nodes.forEach((mesh, i) => {
        const angle = (i / NODE_COUNT) * Math.PI * 2 + time * 0.3;
        const radius = 2.5;
        mesh.position.x = Math.cos(angle) * radius;
        mesh.position.y = Math.sin(angle) * radius * 0.7;
        mesh.position.z = Math.sin(angle * 0.5) * 0.8;
        const isHover = stateRef.current.hoveredNodeId === i;
        const isSelected = stateRef.current.selectedNodeId === i;
        const scale = isSelected ? 1.6 : isHover ? 1.3 : 1;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.MeshStandardMaterial).color.set(
          isSelected ? 0x7cffa0 : isHover ? 0xffe066 : 0xff9d66,
        );
      });

      const targetDistance = stateRef.current.cameraDistance;
      camera.position.z += (targetDistance - camera.position.z) * 0.1;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          renderer.setSize(newWidth, height);
          camera.aspect = newWidth / height;
          camera.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("keydown", onKeyDown);
      container.removeEventListener(
        "spike-landscape-node-click",
        onTestNodeClick as EventListener,
      );
      renderer.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      nodeGeometries.forEach((g) => g.dispose());
      nodeMaterials.forEach((m) => m.dispose());
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [status, editor]);

  if (status === "error") {
    return (
      <div
        ref={containerRef}
        data-testid="landscape-embed-error"
        className="w-full h-[480px] flex items-center justify-center rounded border border-red-500/40 bg-red-950/20 text-red-300"
      >
        Failed to load landscape scene.
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div
        ref={containerRef}
        data-testid="landscape-embed-loading"
        className="w-full h-[480px] flex items-center justify-center rounded border border-white/10 bg-white/[0.03] text-white/70"
      >
        <div className="animate-pulse">Loading landscape…</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="landscape-embed"
      className="w-full rounded border border-white/10 overflow-hidden bg-[#0b1020]"
    >
      <div ref={canvasWrapperRef} className="w-full" />
      <div
        data-testid="landscape-embed-state"
        className="flex gap-4 px-3 py-2 text-xs font-mono text-white/70 bg-black/40 border-t border-white/10"
      >
        <span>hovered: {String(state.hoveredNodeId)}</span>
        <span>selected: {String(state.selectedNodeId)}</span>
        <span>distance: {state.cameraDistance.toFixed(2)}</span>
        <div className="ml-auto flex gap-1" aria-hidden>
          {Array.from({ length: NODE_COUNT }).map((_, i) => (
            <button
              key={i}
              type="button"
              data-testid={`landscape-node-${i}`}
              className="w-5 h-5 rounded-full bg-orange-400/60 hover:bg-yellow-300/80 text-[10px] text-black flex items-center justify-center"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = canvasWrapperRef.current;
                if (!container) return;
                container.dispatchEvent(
                  new CustomEvent("spike-landscape-node-click", {
                    detail: { nodeId: i },
                  }),
                );
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const LANDSCAPE_EMBED_TYPE = "landscape-embed";
