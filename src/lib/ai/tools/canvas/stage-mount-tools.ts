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
// Commit 2 will add mountPassportInStage.
// Commit 3 will add mountTableInStage.
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

export type StageMountDispatchedIntent = {
  tool: "mountChartInStage";
  input: MountChartInStageInput;
};

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
