"use client";

// ---------------------------------------------------------------------------
// useCanvasSync — single subscription to `appStore.canvas`.
//
// Plan §3: "One state subscription. Both renderers call it. No duplicate
// zustand subscriptions."
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type {
  CanvasCameraTarget,
  CanvasFilter,
  CanvasLastAction,
  CanvasLensId,
  CanvasNodeType,
} from "@/app/store";
import { useSyncExternalStore } from "react";

type Snapshot = {
  filter: CanvasFilter;
  selectedNodeId: string | null;
  selectedNodeType: CanvasNodeType | null;
  hoveredNodeId: string | null;
  cameraTarget: CanvasCameraTarget | null;
  activeLens: CanvasLensId;
  lastAction: CanvasLastAction | null;
};

const SERVER_SNAPSHOT: Snapshot = {
  filter: {},
  selectedNodeId: null,
  selectedNodeType: null,
  hoveredNodeId: null,
  cameraTarget: null,
  activeLens: "force-graph",
  lastAction: null,
};

// Stable reference comparator across re-renders — snapshot is a fresh
// object every call, so we cache by shallow-equal to avoid infinite
// render loops in React 19.
let cached: Snapshot | null = null;

function snapshot(): Snapshot {
  const c = appStore.getState().canvas;
  const next: Snapshot = {
    filter: c.filter,
    selectedNodeId: c.selectedNodeId,
    selectedNodeType: c.selectedNodeType,
    hoveredNodeId: c.hoveredNodeId,
    cameraTarget: c.cameraTarget,
    activeLens: c.activeLens,
    lastAction: c.lastAction,
  };
  if (
    cached &&
    cached.filter === next.filter &&
    cached.selectedNodeId === next.selectedNodeId &&
    cached.selectedNodeType === next.selectedNodeType &&
    cached.hoveredNodeId === next.hoveredNodeId &&
    cached.cameraTarget === next.cameraTarget &&
    cached.activeLens === next.activeLens &&
    cached.lastAction === next.lastAction
  ) {
    return cached;
  }
  cached = next;
  return next;
}

export function useCanvasSync(): Snapshot {
  return useSyncExternalStore(
    (cb) => appStore.subscribe(cb),
    snapshot,
    () => SERVER_SNAPSHOT,
  );
}
