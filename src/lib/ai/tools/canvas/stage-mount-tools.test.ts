import { describe, expect, it } from "vitest";
import {
  mountChartInStageInputSchema,
  mountChartInStageTool,
  mountPassportInStageInputSchema,
  mountPassportInStageTool,
  mountTableInStageInputSchema,
  mountTableInStageTool,
} from "./stage-mount-tools";

describe("mountChartInStageTool schema", () => {
  it("accepts a valid bar chart spec", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "bar",
        title: "Projects by funder",
        description: null,
        yAxisLabel: "Count",
        data: [
          {
            xAxisLabel: "Innovate UK",
            series: [{ seriesName: "Projects", value: 42 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid line chart spec", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "line",
        title: "Funding over time",
        description: "Quarterly",
        yAxisLabel: null,
        data: [
          {
            xAxisLabel: "Q1",
            series: [{ seriesName: "£m", value: 10 }],
          },
          {
            xAxisLabel: "Q2",
            series: [{ seriesName: "£m", value: 14 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid pie chart spec", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "pie",
        title: "Funders",
        description: null,
        unit: "projects",
        data: [
          { label: "Innovate UK", value: 30 },
          { label: "EPSRC", value: 12 },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unsupported chart kind", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "scatter",
        title: "x",
        description: null,
        data: [{ label: "a", value: 1 }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bar chart with an empty data array", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "bar",
        title: "empty",
        description: null,
        yAxisLabel: null,
        data: [],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bar chart with no series on a row", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        kind: "bar",
        title: "empty row",
        description: null,
        yAxisLabel: null,
        data: [{ xAxisLabel: "A", series: [] }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a chart spec missing the discriminator field", () => {
    const parsed = mountChartInStageInputSchema.safeParse({
      spec: {
        title: "no kind",
        description: null,
        data: [{ label: "a", value: 1 }],
      },
    });
    expect(parsed.success).toBe(false);
  });
});

import type { StageMountDispatchedResult } from "./stage-mount-tools";

describe("mountPassportInStageTool schema", () => {
  it("accepts a non-empty passport id", () => {
    const parsed = mountPassportInStageInputSchema.safeParse({
      passportId: "b2f5f2d0-0000-0000-0000-000000000001",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty passport id", () => {
    const parsed = mountPassportInStageInputSchema.safeParse({
      passportId: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing passport id", () => {
    const parsed = mountPassportInStageInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-string passport id", () => {
    const parsed = mountPassportInStageInputSchema.safeParse({
      passportId: 42,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("mountPassportInStageTool.execute", () => {
  it("returns a dispatched envelope naming the passport tool", async () => {
    const execute = mountPassportInStageTool.execute;
    if (!execute) throw new Error("tool execute not defined");
    const raw = await execute(
      { passportId: "abc-123" },
      { toolCallId: "pass-1", messages: [] },
    );
    const result = raw as StageMountDispatchedResult;
    expect(result.status).toBe("dispatched");
    expect(result.intent.tool).toBe("mountPassportInStage");
    if (result.intent.tool !== "mountPassportInStage") return;
    expect(result.intent.input.passportId).toBe("abc-123");
  });
});

describe("mountChartInStageTool.execute", () => {
  it("returns a dispatched envelope wrapping the input", async () => {
    const execute = mountChartInStageTool.execute;
    if (!execute) throw new Error("tool execute not defined");
    const spec = {
      kind: "pie" as const,
      title: "Funders",
      description: null,
      unit: null,
      data: [{ label: "IUK", value: 1 }],
    };
    const raw = await execute(
      { spec },
      {
        toolCallId: "test-1",
        messages: [],
      },
    );
    const result = raw as StageMountDispatchedResult;
    expect(result.status).toBe("dispatched");
    expect(result.intent.tool).toBe("mountChartInStage");
    if (result.intent.tool !== "mountChartInStage") {
      throw new Error("expected mountChartInStage intent");
    }
    expect(result.intent.input.spec).toEqual(spec);
    expect(typeof result.at).toBe("number");
  });
});

describe("mountTableInStageTool schema", () => {
  const validSpec = {
    title: "Projects",
    description: null,
    columns: [
      { key: "title", label: "Title", type: "string" },
      { key: "funding", label: "Funding", type: "number" },
    ],
    data: [{ title: "Alpha", funding: 100 }],
  };

  it("accepts a valid table spec", () => {
    const parsed = mountTableInStageInputSchema.safeParse({ spec: validSpec });
    expect(parsed.success).toBe(true);
  });

  it("accepts a spec with an empty data array", () => {
    const parsed = mountTableInStageInputSchema.safeParse({
      spec: { ...validSpec, data: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults omitted column type to 'string'", () => {
    const parsed = mountTableInStageInputSchema.safeParse({
      spec: {
        ...validSpec,
        columns: [{ key: "title", label: "Title" }],
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.spec.columns[0].type).toBe("string");
    }
  });

  it("rejects an empty columns array", () => {
    const parsed = mountTableInStageInputSchema.safeParse({
      spec: { ...validSpec, columns: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unsupported column type", () => {
    const parsed = mountTableInStageInputSchema.safeParse({
      spec: {
        ...validSpec,
        columns: [{ key: "x", label: "X", type: "enum" }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing title", () => {
    const parsed = mountTableInStageInputSchema.safeParse({
      spec: { ...validSpec, title: undefined },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("mountTableInStageTool.execute", () => {
  it("returns a dispatched envelope naming the table tool", async () => {
    const execute = mountTableInStageTool.execute;
    if (!execute) throw new Error("tool execute not defined");
    const spec = {
      title: "Projects",
      description: null,
      columns: [{ key: "title", label: "Title", type: "string" as const }],
      data: [{ title: "Alpha" }],
    };
    const raw = await execute({ spec }, { toolCallId: "tab-1", messages: [] });
    const result = raw as StageMountDispatchedResult;
    expect(result.status).toBe("dispatched");
    expect(result.intent.tool).toBe("mountTableInStage");
    if (result.intent.tool !== "mountTableInStage") {
      throw new Error("expected mountTableInStage intent");
    }
    expect(result.intent.input.spec.title).toBe("Projects");
    expect(result.intent.input.spec.data).toHaveLength(1);
  });
});
