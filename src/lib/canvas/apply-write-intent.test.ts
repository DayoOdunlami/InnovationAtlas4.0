import { describe, expect, it } from "vitest";
import type { CanvasState } from "@/app/store";
import { DefaultToolName } from "@/lib/ai/tools";
import { applyWriteIntent } from "./apply-write-intent";

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

describe("applyWriteIntent — mountChartInStage", () => {
  it("mounts a bar chart spec in the stage slot", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      {
        spec: {
          kind: "bar",
          title: "Projects by funder",
          description: null,
          yAxisLabel: "Count",
          data: [
            {
              xAxisLabel: "Innovate UK",
              series: [{ seriesName: "Projects", value: 10 }],
            },
          ],
        },
      },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("chart");
    if (result.stage.kind !== "chart") return;
    expect(result.stage.spec.kind).toBe("bar");
    expect(result.lastAction?.type).toBe("mountChartInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("mounts a pie chart spec in the stage slot", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      {
        spec: {
          kind: "pie",
          title: "Funders",
          description: null,
          unit: "projects",
          data: [
            { label: "IUK", value: 1 },
            { label: "EPSRC", value: 2 },
          ],
        },
      },
    );
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.stage.kind).toBe("chart");
    if (result.stage.kind !== "chart") return;
    expect(result.stage.spec.kind).toBe("pie");
  });

  it("errors on unsupported chart kind", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      { spec: { kind: "scatter" } },
    );
    expect("__error" in result).toBe(true);
  });

  it("errors when spec is missing", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountChartInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("does not mutate unrelated slice fields", () => {
    const prev: CanvasState = {
      ...baseState(),
      selectedNodeId: "project-1",
      selectedNodeType: "project",
      filter: { query: "rail" },
    };
    const result = applyWriteIntent(prev, DefaultToolName.MountChartInStage, {
      spec: {
        kind: "pie",
        title: "t",
        description: null,
        unit: null,
        data: [{ label: "a", value: 1 }],
      },
    });
    expect("__error" in result).toBe(false);
    if ("__error" in result) return;
    expect(result.selectedNodeId).toBe("project-1");
    expect(result.selectedNodeType).toBe("project");
    expect(result.filter).toEqual({ query: "rail" });
    expect(result.activeLens).toBe("force-graph");
  });
});

describe("applyWriteIntent — mountPassportInStage", () => {
  it("mounts a passport stage with the given id", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: "b2f5f2d0-0000-0000-0000-000000000001" },
    );
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("passport");
    if (result.stage.kind !== "passport") return;
    expect(result.stage.passportId).toBe(
      "b2f5f2d0-0000-0000-0000-000000000001",
    );
    expect(result.lastAction?.type).toBe("mountPassportInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("errors when passportId is missing", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("errors when passportId is empty", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountPassportInStage,
      { passportId: "" },
    );
    expect("__error" in result).toBe(true);
  });

  it("replaces an existing chart stage", () => {
    const prev: CanvasState = {
      ...baseState(),
      stage: {
        kind: "chart",
        spec: {
          kind: "pie",
          title: "t",
          data: [{ label: "a", value: 1 }],
        },
      },
    };
    const result = applyWriteIntent(
      prev,
      DefaultToolName.MountPassportInStage,
      {
        passportId: "p-1",
      },
    );
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("passport");
  });
});

describe("applyWriteIntent — mountTableInStage", () => {
  const validSpec = {
    title: "Projects by funder",
    description: null,
    columns: [
      { key: "title", label: "Title", type: "string" },
      { key: "funding", label: "Funding", type: "number" },
    ],
    data: [
      { title: "Alpha", funding: 100 },
      { title: "Beta", funding: 250 },
    ],
  };

  it("mounts a table spec in the stage slot", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: validSpec },
    );
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("table");
    if (result.stage.kind !== "table") return;
    expect(result.stage.spec.title).toBe("Projects by funder");
    expect(result.stage.spec.columns).toHaveLength(2);
    expect(result.stage.spec.data).toHaveLength(2);
    expect(result.lastAction?.type).toBe("mountTableInStage");
    expect(result.lastAction?.source).toBe("agent");
  });

  it("errors when spec is missing", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      {},
    );
    expect("__error" in result).toBe(true);
  });

  it("errors when title is missing", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: { ...validSpec, title: undefined } },
    );
    expect("__error" in result).toBe(true);
  });

  it("errors when columns is empty", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: { ...validSpec, columns: [] } },
    );
    expect("__error" in result).toBe(true);
  });

  it("errors when data is not an array", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: { ...validSpec, data: "not-an-array" } },
    );
    expect("__error" in result).toBe(true);
  });

  it("accepts an empty data array (zero-row result)", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.MountTableInStage,
      { spec: { ...validSpec, data: [] } },
    );
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("table");
  });

  it("replaces an existing passport stage", () => {
    const prev: CanvasState = {
      ...baseState(),
      stage: { kind: "passport", passportId: "p-99" },
    };
    const result = applyWriteIntent(prev, DefaultToolName.MountTableInStage, {
      spec: validSpec,
    });
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("table");
  });
});

describe("applyWriteIntent — existing write tools (regression)", () => {
  it("focusOnProject still works", () => {
    const result = applyWriteIntent(
      baseState(),
      DefaultToolName.FocusOnProject,
      { projectId: "p-1" },
    );
    if ("__error" in result) throw new Error(result.__error);
    expect(result.selectedNodeId).toBe("p-1");
    expect(result.selectedNodeType).toBe("project");
    expect(result.stage.kind).toBe("force-graph");
  });

  it("resetCamera does not affect stage slot", () => {
    const prev: CanvasState = {
      ...baseState(),
      stage: {
        kind: "chart",
        spec: {
          kind: "pie",
          title: "t",
          data: [{ label: "a", value: 1 }],
        },
      },
    };
    const result = applyWriteIntent(prev, DefaultToolName.ResetCamera, {});
    if ("__error" in result) throw new Error(result.__error);
    expect(result.stage.kind).toBe("chart");
  });

  it("returns an error sentinel for an unknown tool", () => {
    const result = applyWriteIntent(baseState(), "notARealTool", {});
    expect("__error" in result).toBe(true);
  });
});
