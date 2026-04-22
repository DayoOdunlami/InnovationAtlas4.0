"use client";

// ---------------------------------------------------------------------------
// Canvas stage — table variant (Sprint X Thread 2, commit 3)
//
// Renders the currently mounted table spec in the full canvas main area,
// reusing the existing `InteractiveTable` component that powers inline
// `createTable` results so the model's mental model of "a table" is
// identical in both surfaces. We only wrap it in a scroll container and
// coerce column `type` from our nullable schema back to the undefined shape
// that component expects.
//
// Return affordance is NOT rendered here — it lives in the canvas workbench
// top bar next to the Status chip.
// ---------------------------------------------------------------------------

import type { CanvasStageTableSpec } from "@/app/store";
import { InteractiveTable } from "@/components/tool-invocation/interactive-table";

export function CanvasStageTable({ spec }: { spec: CanvasStageTableSpec }) {
  const columns = spec.columns.map((col) => ({
    key: col.key,
    label: col.label,
    type: col.type ?? "string",
  }));

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-6xl py-6">
        <InteractiveTable
          title={spec.title}
          description={spec.description ?? undefined}
          columns={columns}
          data={spec.data as Array<Record<string, unknown>>}
        />
      </div>
    </div>
  );
}
