// ---------------------------------------------------------------------------
// Behavioural unit tests for the canvas stage-mount dispatcher
//
// Covers the three stage-mount operations (mountChart, mountPassport,
// mountTable) in `applyWriteIntent` — the pure reducer extracted from the
// canvas-tool-dispatcher so it can be tested without React / Zustand.
//
// Test categories for each mount operation:
//   1. Valid payload → stage updated to { kind, payload } with no error
//   2. Invalid payload → error sentinel returned, prior mount NOT clobbered
//   3. Second dispatch with different payload → second payload wins
//   4. Clear/unmount action after successful mount → stage returns to empty
//      (force-graph). SEE NOTE BELOW — this case is xfail / skipped because
//      no dispatchable clear/unmount tool exists in the current dispatcher.
//
// Cross-cutting:
//   5. mountChart then mountTable → table overwrites chart cleanly (no leaked
//      chart fields)
//   6. null / undefined payload → defensive error, not a crash
//
// Bugs found during test writing
// ─────────────────────────────
// BUG-1 (closed in Phase 1, commit 1): `applyWriteIntent` now handles
//   `DefaultToolName.ClearStage`, and `handleReturnToForceGraph` in
//   `canvas-workbench.tsx` routes through the reducer so `lastAction`
//   captures every stage transition. The three `[BUG-1]` test cases below
//   have been un-skipped.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type { CanvasState } from "@/app/store";
import { DefaultToolName } from "@/lib/ai/tools";
import { applyWriteIntent } from "./apply-write-intent";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function baseState(): CanvasState {
  return {
    selectedNodeId: null,
    selectedNodeType: null,
    hoveredNodeId: null,
    filter: {},
    activeLens: "force-graph",
    cameraTarget: null,
    colorMode: "default",
    stage: { kind: "force-graph" },
    lastAction: null,
  };
}

const VALID_BAR_SPEC = {
  kind: "bar" as const,
  title: "Projects by funder",
  description: null,
  yAxisLabel: "Count",
  data: [
    {
      xAxisLabel: "Innovate UK",
      series: [{ seriesName: "Projects", value: 42 }],
    },
  ],
};

const VALID_PIE_SPEC = {
  kind: "pie" as const,
  title: "Funder split",
  description: null,
  unit: "projects",
  data: [
    { label: "IUK", value: 30 },
    { label: "EPSRC", value: 12 },
  ],
};

const VALID_LINE_SPEC = {
  kind: "line" as const,
  title: "Funding over time",
  description: null,
  yAxisLabel: "£M",
  data: [
    {
      xAxisLabel: "2022",
      series: [{ seriesName: "Total", value: 10 }],
    },
    {
      xAxisLabel: "2023",
      series: [{ seriesName: "Total", value: 14 }],
    },
  ],
};

const VALID_PASSPORT_ID = "b2f5f2d0-0000-0000-0000-000000000042";

const VALID_TABLE_SPEC = {
  title: "Top matching projects",
  description: null,
  columns: [
    { key: "title", label: "Title", type: "string" as const },
    { key: "score", label: "Score", type: "number" as const },
  ],
  data: [
    { title: "InDePTH Ports", score: 0.82 },
    { title: "Catapult Rail", score: 0.74 },
  ],
};

// ---------------------------------------------------------------------------
// mountChart
// ---------------------------------------------------------------------------

describe("canvas stage-mount dispatcher — mountChart", () => {
  it("dispatching mountChart with a valid bar payload updates stage state to { kind: 'chart' } with no error", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_BAR_SPEC },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("chart");
    if (result.stage.kind !== "chart") return;
    expect(result.stage.spec.kind).toBe("bar");
    expect(result.lastAction?.type).toBe("mountChartInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("dispatching mountChart with a valid pie payload updates stage state to { kind: 'chart' } with no error", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_PIE_SPEC },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("chart");
    if (result.stage.kind !== "chart") return;
    expect(result.stage.spec.kind).toBe("pie");
  });

  it("dispatching mountChart with a valid line payload updates stage state to { kind: 'chart' } with no error", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_LINE_SPEC },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("chart");
    if (result.stage.kind !== "chart") return;
    expect(result.stage.spec.kind).toBe("line");
  });

  it("dispatching mountChart with a payload missing spec results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "chart", spec: VALID_BAR_SPEC },
    };
    // Send an invalid dispatch (missing spec entirely)
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountChartInStage,
      {},
    );
    expect("__error" in result).toBe(true);
    // The prior state is returned unchanged — the successful mount survives
    expect(priorMount.stage.kind).toBe("chart");
  });

  it("dispatching mountChart with an unsupported chart kind results in an error and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "chart", spec: VALID_BAR_SPEC },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountChartInStage,
      { spec: { kind: "scatter", title: "oops" } },
    );
    expect("__error" in result).toBe(true);
    // Input state is unchanged (pure function — prior mount is untouched)
    expect(priorMount.stage.kind).toBe("chart");
  });

  it("dispatching mountChart twice in a row with different payloads results in the second payload being the final state", () => {
    const afterFirst = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_BAR_SPEC },
    );
    if ("__error" in afterFirst) throw new Error(afterFirst.__error);

    const afterSecond = applyWriteIntent(
      afterFirst,
      DefaultToolName.MountChartInStage,
      { spec: VALID_PIE_SPEC },
    );
    if ("__error" in afterSecond) throw new Error(afterSecond.__error);

    expect(afterSecond.stage.kind).toBe("chart");
    if (afterSecond.stage.kind !== "chart") return;
    // Second payload (pie) is the final state
    expect(afterSecond.stage.spec.kind).toBe("pie");
    expect(afterSecond.lastAction?.type).toBe("mountChartInStage");
  });

  // [BUG-1] Closed in Phase 1 commit 1: `DefaultToolName.ClearStage` is
  // now handled by the reducer and the "Return to force-graph" affordance
  // routes through it.
  it("[BUG-1] dispatching a clearStage action after a successful mountChart leaves the stage at { kind: 'force-graph' }", () => {
    const afterMount = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_BAR_SPEC },
    );
    if ("__error" in afterMount) throw new Error(afterMount.__error);
    expect(afterMount.stage.kind).toBe("chart");

    const afterClear = applyWriteIntent(
      afterMount,
      DefaultToolName.ClearStage,
      {},
    );
    expect("__error" in afterClear).toBe(false);
    if ("__error" in afterClear) return;
    expect(afterClear.stage.kind).toBe("force-graph");
    expect(afterClear.lastAction?.type).toBe("clearStage");
    expect(afterClear.lastAction?.source).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// mountPassport
// ---------------------------------------------------------------------------

describe("canvas stage-mount dispatcher — mountPassport", () => {
  it("dispatching mountPassport with a valid passportId updates stage state to { kind: 'passport', passportId } with no error", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: VALID_PASSPORT_ID },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("passport");
    if (result.stage.kind !== "passport") return;
    expect(result.stage.passportId).toBe(VALID_PASSPORT_ID);
    expect(result.lastAction?.type).toBe("mountPassportInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("dispatching mountPassport with a missing passportId results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "passport", passportId: VALID_PASSPORT_ID },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountPassportInStage,
      {}, // missing passportId
    );
    expect("__error" in result).toBe(true);
    // Prior state is unchanged
    expect(priorMount.stage.kind).toBe("passport");
    if (priorMount.stage.kind !== "passport") return;
    expect(priorMount.stage.passportId).toBe(VALID_PASSPORT_ID);
  });

  it("dispatching mountPassport with an empty-string passportId results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "passport", passportId: VALID_PASSPORT_ID },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountPassportInStage,
      { passportId: "" },
    );
    expect("__error" in result).toBe(true);
    expect(priorMount.stage.kind).toBe("passport");
  });

  it("dispatching mountPassport twice in a row with different passportIds results in the second passportId being the final state", () => {
    const firstId = "passport-first-000000000001";
    const secondId = "passport-second-00000000002";

    const afterFirst = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: firstId },
    );
    if ("__error" in afterFirst) throw new Error(afterFirst.__error);

    const afterSecond = applyWriteIntent(
      afterFirst,
      DefaultToolName.MountPassportInStage,
      { passportId: secondId },
    );
    if ("__error" in afterSecond) throw new Error(afterSecond.__error);

    expect(afterSecond.stage.kind).toBe("passport");
    if (afterSecond.stage.kind !== "passport") return;
    expect(afterSecond.stage.passportId).toBe(secondId);
  });

  // [BUG-1] Closed in Phase 1 commit 1: see mountChart block above.
  it("[BUG-1] dispatching a clearStage action after a successful mountPassport leaves the stage at { kind: 'force-graph' }", () => {
    const afterMount = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: VALID_PASSPORT_ID },
    );
    if ("__error" in afterMount) throw new Error(afterMount.__error);

    const afterClear = applyWriteIntent(
      afterMount,
      DefaultToolName.ClearStage,
      {},
    );
    expect("__error" in afterClear).toBe(false);
    if ("__error" in afterClear) return;
    expect(afterClear.stage.kind).toBe("force-graph");
    expect(afterClear.lastAction?.type).toBe("clearStage");
    expect(afterClear.lastAction?.source).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// mountTable
// ---------------------------------------------------------------------------

describe("canvas stage-mount dispatcher — mountTable", () => {
  it("dispatching mountTable with a valid spec updates stage state to { kind: 'table', spec } with no error", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: VALID_TABLE_SPEC },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("table");
    if (result.stage.kind !== "table") return;
    expect(result.stage.spec.title).toBe(VALID_TABLE_SPEC.title);
    expect(result.stage.spec.columns).toHaveLength(2);
    expect(result.stage.spec.data).toHaveLength(2);
    expect(result.lastAction?.type).toBe("mountTableInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("dispatching mountTable with a missing spec results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "table", spec: VALID_TABLE_SPEC },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountTableInStage,
      {}, // missing spec
    );
    expect("__error" in result).toBe(true);
    expect(priorMount.stage.kind).toBe("table");
  });

  it("dispatching mountTable with a spec missing title results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "table", spec: VALID_TABLE_SPEC },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountTableInStage,
      { spec: { ...VALID_TABLE_SPEC, title: undefined } },
    );
    expect("__error" in result).toBe(true);
    expect(priorMount.stage.kind).toBe("table");
  });

  it("dispatching mountTable with an empty columns array results in an error state and does NOT overwrite any prior successful mount", () => {
    const priorMount: CanvasState = {
      ...baseState(),
      stage: { kind: "table", spec: VALID_TABLE_SPEC },
    };
    const result = applyWriteIntent(
      priorMount,
      DefaultToolName.MountTableInStage,
      { spec: { ...VALID_TABLE_SPEC, columns: [] } },
    );
    expect("__error" in result).toBe(true);
    expect(priorMount.stage.kind).toBe("table");
  });

  it("dispatching mountTable twice in a row with different specs results in the second spec being the final state", () => {
    const secondSpec = {
      title: "Gap analysis results",
      description: "Gaps from the matching run",
      columns: [
        { key: "gap", label: "Gap", type: "string" as const },
        { key: "severity", label: "Severity", type: "string" as const },
        { key: "value", label: "Value £M", type: "number" as const },
      ],
      data: [{ gap: "Maritime cert", severity: "HIGH", value: 2.4 }],
    };

    const afterFirst = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: VALID_TABLE_SPEC },
    );
    if ("__error" in afterFirst) throw new Error(afterFirst.__error);

    const afterSecond = applyWriteIntent(
      afterFirst,
      DefaultToolName.MountTableInStage,
      { spec: secondSpec },
    );
    if ("__error" in afterSecond) throw new Error(afterSecond.__error);

    expect(afterSecond.stage.kind).toBe("table");
    if (afterSecond.stage.kind !== "table") return;
    expect(afterSecond.stage.spec.title).toBe("Gap analysis results");
    expect(afterSecond.stage.spec.columns).toHaveLength(3);
  });

  // [BUG-1] Closed in Phase 1 commit 1: see mountChart block above.
  it("[BUG-1] dispatching a clearStage action after a successful mountTable leaves the stage at { kind: 'force-graph' }", () => {
    const afterMount = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: VALID_TABLE_SPEC },
    );
    if ("__error" in afterMount) throw new Error(afterMount.__error);

    const afterClear = applyWriteIntent(
      afterMount,
      DefaultToolName.ClearStage,
      {},
    );
    expect("__error" in afterClear).toBe(false);
    if ("__error" in afterClear) return;
    expect(afterClear.stage.kind).toBe("force-graph");
    expect(afterClear.lastAction?.type).toBe("clearStage");
    expect(afterClear.lastAction?.source).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: cross-kind mount and null/undefined payload guards
// ---------------------------------------------------------------------------

describe("canvas stage-mount dispatcher — cross-cutting invariants", () => {
  it("dispatching mountChart then mountTable results in the table state overwriting the chart state cleanly — no leaked fields from the chart payload", () => {
    const afterChart = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: VALID_BAR_SPEC },
    );
    if ("__error" in afterChart) throw new Error(afterChart.__error);
    expect(afterChart.stage.kind).toBe("chart");

    const afterTable = applyWriteIntent(
      afterChart,
      DefaultToolName.MountTableInStage,
      { spec: VALID_TABLE_SPEC },
    );
    if ("__error" in afterTable) throw new Error(afterTable.__error);

    expect(afterTable.stage.kind).toBe("table");
    // The stage object must have ONLY the table variant's shape.
    // No chart-specific fields (`spec.kind === "bar"`, `spec.data[].series`,
    // etc.) should be present at the top-level of the stage object.
    expect(Object.keys(afterTable.stage)).toEqual(["kind", "spec"]);
    expect("passportId" in afterTable.stage).toBe(false);
    if (afterTable.stage.kind !== "table") return;
    expect(afterTable.stage.spec.title).toBe(VALID_TABLE_SPEC.title);
    // lastAction must reflect the table mount, not the prior chart
    expect(afterTable.lastAction?.type).toBe("mountTableInStage");
  });

  it("dispatching mountChart with a null payload results in a defensive error, not a crash", () => {
    // null coerces to an object-shaped absence in the dispatcher's guard
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: null },
    );
    expect("__error" in result).toBe(true);
    if (!("__error" in result)) return;
    expect(typeof result.__error).toBe("string");
    expect(result.__error.length).toBeGreaterThan(0);
  });

  it("dispatching mountPassport with a null passportId results in a defensive error, not a crash", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: null },
    );
    expect("__error" in result).toBe(true);
    if (!("__error" in result)) return;
    expect(typeof result.__error).toBe("string");
  });

  it("dispatching mountTable with a null spec results in a defensive error, not a crash", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: null },
    );
    expect("__error" in result).toBe(true);
    if (!("__error" in result)) return;
    expect(typeof result.__error).toBe("string");
  });

  it("dispatching mountChart with an undefined payload (empty input object) results in a defensive error, not a crash", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("dispatching mountPassport with an undefined passportId (empty input object) results in a defensive error, not a crash", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("dispatching mountTable with an undefined spec (empty input object) results in a defensive error, not a crash", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("dispatching mountPassport then mountChart (different kinds) results in the chart state overwriting the passport cleanly — no passportId in resulting state", () => {
    const afterPassport = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: VALID_PASSPORT_ID },
    );
    if ("__error" in afterPassport) throw new Error(afterPassport.__error);

    const afterChart = applyWriteIntent(
      afterPassport,
      DefaultToolName.MountChartInStage,
      { spec: VALID_PIE_SPEC },
    );
    if ("__error" in afterChart) throw new Error(afterChart.__error);

    expect(afterChart.stage.kind).toBe("chart");
    expect("passportId" in afterChart.stage).toBe(false);
    if (afterChart.stage.kind !== "chart") return;
    expect(afterChart.stage.spec.kind).toBe("pie");
    expect(afterChart.lastAction?.type).toBe("mountChartInStage");
  });

  it("unrelated canvas fields (selectedNodeId, filter, activeLens) are preserved across any stage-mount dispatch", () => {
    const richState: CanvasState = {
      ...baseState(),
      selectedNodeId: "project-xyz",
      selectedNodeType: "project",
      filter: { query: "GPS-denied", funder: "Innovate UK" },
      activeLens: "force-graph",
    };

    const afterChart = applyWriteIntent(
      richState,
      DefaultToolName.MountChartInStage,
      { spec: VALID_BAR_SPEC },
    );
    if ("__error" in afterChart) throw new Error(afterChart.__error);
    expect(afterChart.selectedNodeId).toBe("project-xyz");
    expect(afterChart.filter).toEqual({
      query: "GPS-denied",
      funder: "Innovate UK",
    });
    expect(afterChart.activeLens).toBe("force-graph");

    const afterPassport = applyWriteIntent(
      richState,
      DefaultToolName.MountPassportInStage,
      { passportId: VALID_PASSPORT_ID },
    );
    if ("__error" in afterPassport) throw new Error(afterPassport.__error);
    expect(afterPassport.selectedNodeId).toBe("project-xyz");
    expect(afterPassport.filter).toEqual({
      query: "GPS-denied",
      funder: "Innovate UK",
    });

    const afterTable = applyWriteIntent(
      richState,
      DefaultToolName.MountTableInStage,
      { spec: VALID_TABLE_SPEC },
    );
    if ("__error" in afterTable) throw new Error(afterTable.__error);
    expect(afterTable.selectedNodeId).toBe("project-xyz");
    expect(afterTable.filter).toEqual({
      query: "GPS-denied",
      funder: "Innovate UK",
    });
  });
});
