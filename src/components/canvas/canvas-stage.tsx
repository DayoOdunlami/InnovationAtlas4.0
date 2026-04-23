"use client";

// ---------------------------------------------------------------------------
// Canvas stage router (Sprint X Thread 2, commit 1)
//
// Reads `appStore.canvas.stage` and renders the matching stage lens. The
// force-graph variant is the default and deliberately the only one heavy
// enough to warrant dynamic import — chart, passport, table (added in
// commits 2 and 3) are small synchronous components.
//
// Components rendered here never render the Return-to-force-graph
// affordance themselves — that lives in the workbench top bar so it stays
// visible regardless of the mounted stage's own scroll container.
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type { CanvasStage } from "@/app/store";
import { CanvasStageChart } from "@/components/canvas/stage/canvas-stage-chart";
import { CanvasStagePassport } from "@/components/canvas/stage/canvas-stage-passport";
import { CanvasStageTable } from "@/components/canvas/stage/canvas-stage-table";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// Phase 3b: the canvas force-graph stage now renders the shared
// <ForceGraphLens variant="canvas"/> component instead of dynamically
// importing the full /landscape-3d page. The dynamic import gate is
// kept because the lens pulls d3-force + canvas rendering that must
// never load on the share route — `next/dynamic({ ssr: false })` is
// the bundle-split boundary the share-bundle guard depends on.
const ForceGraphLens = dynamic(
  () =>
    import("@/components/landscape/force-graph-lens").then((m) => ({
      default: m.ForceGraphLens,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Loading force-graph lens…
      </div>
    ),
  },
);

function subscribeStage(listener: () => void) {
  return appStore.subscribe(listener);
}

function getStageSnapshot(): CanvasStage {
  return appStore.getState().canvas.stage;
}

function getStageServerSnapshot(): CanvasStage {
  return { kind: "force-graph" };
}

export function CanvasStage() {
  const stage = useSyncExternalStore(
    subscribeStage,
    getStageSnapshot,
    getStageServerSnapshot,
  );

  if (stage.kind === "chart") {
    return <CanvasStageChart spec={stage.spec} />;
  }

  if (stage.kind === "passport") {
    return <CanvasStagePassport passportId={stage.passportId} />;
  }

  if (stage.kind === "table") {
    return <CanvasStageTable spec={stage.spec} />;
  }

  return <ForceGraphLens variant="canvas" />;
}
