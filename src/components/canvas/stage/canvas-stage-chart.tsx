"use client";

// ---------------------------------------------------------------------------
// Canvas stage — chart variant (Sprint X Thread 2, commit 1)
//
// Renders the currently mounted chart spec in the full canvas main area.
// The chart component itself is the same recharts wrapper used inline in
// the chat transcript — we just wrap it in a scroll container so a tall
// chart can't overflow the stage, and rely on recharts' ResponsiveContainer
// to fill the horizontal room.
//
// Return affordance is NOT rendered here — it lives in the canvas workbench
// top bar next to the Status chip (per spec, single-click return).
// ---------------------------------------------------------------------------

import type { CanvasStageChartSpec } from "@/app/store";
import { BarChart } from "@/components/tool-invocation/bar-chart";
import { LineChart } from "@/components/tool-invocation/line-chart";
import { PieChart } from "@/components/tool-invocation/pie-chart";

export function CanvasStageChart({ spec }: { spec: CanvasStageChartSpec }) {
  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        {spec.kind === "bar" && (
          <BarChart
            title={spec.title}
            description={spec.description ?? undefined}
            yAxisLabel={spec.yAxisLabel ?? undefined}
            data={spec.data}
          />
        )}
        {spec.kind === "line" && (
          <LineChart
            title={spec.title}
            description={spec.description ?? undefined}
            yAxisLabel={spec.yAxisLabel ?? undefined}
            data={spec.data}
          />
        )}
        {spec.kind === "pie" && (
          <PieChart
            title={spec.title}
            description={spec.description ?? undefined}
            unit={spec.unit ?? undefined}
            data={spec.data}
          />
        )}
      </div>
    </div>
  );
}
