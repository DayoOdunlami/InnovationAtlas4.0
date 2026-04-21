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
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const Landscape3DPage = dynamic(
  () => import("@/app/(chat)/landscape-3d/page"),
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

  return <Landscape3DPage />;
}
