// ---------------------------------------------------------------------------
// Canvas stage-mount tools (Sprint X Thread 2)
//
// These tools mount a specific artefact into the canvas main stage,
// replacing the force-graph lens until the user returns. They follow the
// Atlas Canvas State Contract exactly:
//
//   1. Schema is declared server-side so the model sees it in the request.
//   2. `execute` runs on the server and returns a validated "intent"
//      envelope — it has NO side effects.
//   3. The actual mutation of `appStore.canvas.stage` happens CLIENT-SIDE
//      in `canvas-tool-dispatcher.tsx`. The dispatcher overwrites this
//      envelope via `addToolResult` so the *final* tool output is
//      `{ status: "applied", newState }`.
//
// Commit 1 (this file, initial): mountChartInStage only.
// Commit 2 added mountPassportInStage.
// Commit 3 adds mountTableInStage.
//
// No "returnToForceGraph" tool exists by design — that affordance is
// user-driven via the top-bar button and the force-graph lens chip, per the
// Thread 2 spec.
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";

// Chart spec — mirrors the visualisation tool input shapes (see
// `src/lib/ai/tools/visualization/create-{bar,line,pie}-chart.ts`) so the
// model can reuse the same mental model when asked to mount a chart in the
// main stage rather than inline it in the chat transcript.
const barOrLineChartSchema = z.object({
  kind: z.enum(["bar", "line"]),
  title: z.string().min(1),
  description: z.string().nullable(),
  yAxisLabel: z.string().nullable(),
  data: z
    .array(
      z.object({
        xAxisLabel: z.string(),
        series: z
          .array(
            z.object({
              seriesName: z.string(),
              value: z.number(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const pieChartSchema = z.object({
  kind: z.literal("pie"),
  title: z.string().min(1),
  description: z.string().nullable(),
  unit: z.string().nullable(),
  data: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
      }),
    )
    .min(1),
});

export const mountChartInStageInputSchema = z.object({
  spec: z.union([barOrLineChartSchema, pieChartSchema]),
});

export type MountChartInStageInput = z.infer<
  typeof mountChartInStageInputSchema
>;

export const mountPassportInStageInputSchema = z.object({
  passportId: z
    .string()
    .min(1)
    .describe(
      "UUID of the passport to mount in the canvas main stage. Must be a passport the current user can view.",
    ),
});

export type MountPassportInStageInput = z.infer<
  typeof mountPassportInStageInputSchema
>;

// Table spec mirrors `createTable` (see `visualization/create-table.ts`) so a
// model can reuse the same column/row shape it already knows. `type` on a
// column is nullable because the existing inline tool lets the model omit it
// and default to "string" — we preserve that ergonomics here.
const mountTableColumnSchema = z.object({
  key: z
    .string()
    .min(1)
    .describe("Column key that matches the data row object keys."),
  label: z.string().min(1).describe("Display label for the column header."),
  type: z
    .enum(["string", "number", "date", "boolean"])
    .nullable()
    .default("string")
    .describe("Data type for sorting and formatting."),
});

export const mountTableInStageInputSchema = z.object({
  spec: z.object({
    title: z.string().min(1),
    description: z.string().nullable(),
    columns: z.array(mountTableColumnSchema).min(1),
    data: z
      .array(z.object({}).catchall(z.unknown()))
      .describe(
        "Array of row objects. Each row's keys should match the column keys.",
      ),
  }),
});

export type MountTableInStageInput = z.infer<
  typeof mountTableInStageInputSchema
>;

export type StageMountDispatchedIntent =
  | { tool: "mountChartInStage"; input: MountChartInStageInput }
  | { tool: "mountPassportInStage"; input: MountPassportInStageInput }
  | { tool: "mountTableInStage"; input: MountTableInStageInput };

export type StageMountDispatchedResult = {
  status: "dispatched";
  intent: StageMountDispatchedIntent;
  at: number;
};

export const mountChartInStageTool = createTool({
  description:
    "Mount a full-size chart (bar, line, or pie) in the canvas main stage, replacing the force-graph lens until the user returns. " +
    "Use this when the user asks for a chart of 'what's on the canvas' or wants a chart to dominate their attention rather than sit inline in the chat. " +
    "If the user just wants a chart inline with the conversation, prefer createBarChart / createLineChart / createPieChart instead. " +
    "No lens precondition — the chart replaces whatever is currently in the main stage. " +
    "Preconditions: must be on the /canvas surface (not /landscape-3d, which has no stage slot). " +
    "Returns { status, newState } per the Canvas State Contract.",
  inputSchema: mountChartInStageInputSchema,
  execute: async (input): Promise<StageMountDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "mountChartInStage", input },
    at: Date.now(),
  }),
});

export const mountPassportInStageTool = createTool({
  description:
    "Mount a capability passport in the canvas main stage so the user can see its header, evidence documents and extracted claims at full canvas width, replacing the force-graph lens until they return. " +
    "Use this when the user says 'open the passport', 'show me the passport for X', or when resolving a passport reference surfaced from a previous tool call (listPassports / findConsortiumPartners). " +
    "Prefer this over linking to /passport/[id] when the conversation is happening on /canvas. " +
    "Preconditions: must be on the /canvas surface. The passport id must be a UUID the current user can view (RLS will otherwise surface a visible 'not found' in the stage). " +
    "Returns { status, newState } per the Canvas State Contract.",
  inputSchema: mountPassportInStageInputSchema,
  execute: async (input): Promise<StageMountDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "mountPassportInStage", input },
    at: Date.now(),
  }),
});

export const mountTableInStageTool = createTool({
  description:
    "Mount an interactive table (search, sort, pagination, CSV/Excel export) in the canvas main stage, replacing the force-graph lens until the user returns. " +
    "Use this when the user asks for a table of 'what's on the canvas', a list of projects/organisations/claims at full width, or when a result set is too large to inline in the chat transcript. " +
    "If the user just wants a small table inline with the conversation, prefer the inline `createTable` tool instead. " +
    "Provide column configuration and row data in the same shape as `createTable` — each row object's keys must match the column keys. " +
    "Preconditions: must be on the /canvas surface. " +
    "Returns { status, newState } per the Canvas State Contract.",
  inputSchema: mountTableInStageInputSchema,
  execute: async (input): Promise<StageMountDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "mountTableInStage", input },
    at: Date.now(),
  }),
});
