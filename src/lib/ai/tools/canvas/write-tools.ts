// ---------------------------------------------------------------------------
// Canvas write tools (Sprint X Commit 5 — Brief X §6)
//
// Each tool follows the Atlas Canvas State Contract (see Notion
// https://www.notion.so/348c9b382a748116b54bcb9755a32f6a):
//
//   1. Schema is declared server-side so the model sees it in the request.
//   2. `execute` runs on the server and returns ONLY a validated "intent"
//      envelope — it has NO side effects. It never touches a DB, never
//      mutates anything. It is a pure serialiser of the caller's input.
//   3. The actual mutation of `appStore.canvas` happens CLIENT-SIDE in the
//      dispatcher wired up in Commit 6 (`src/components/canvas/
//      canvas-tool-dispatcher.tsx`). The dispatcher applies the mutation
//      synchronously and overwrites this envelope via `addToolResult` so
//      the *final* tool output is `{ status: "applied", newState }`.
//   4. Descriptions below declare preconditions explicitly — the lens and
//      state the tool needs — so the model calls `setActiveLens` (future)
//      or `getCanvasState` (Commit 6) first rather than silently failing.
//
// Shape returned by `execute` (server):
//
//   { status: "dispatched", intent: <validated input> }
//
// Shape the client dispatcher writes back via `addToolResult`:
//
//   { status: "applied", newState: <CanvasState>, at: <epoch ms> }
//   | { status: "error",  reason: string,         at: <epoch ms> }
//
// The union of these two shapes is the Canvas contract as the model sees
// it. See `CanvasToolResult` below for the type.
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";
import type { CanvasState } from "@/app/store";

// Shared input schemas --------------------------------------------------------

export const focusOnProjectInputSchema = z.object({
  projectId: z
    .string()
    .describe(
      "UUID of the project node to focus. Must be a project present on the current force-graph lens.",
    ),
});

export const focusOnOrgInputSchema = z.object({
  orgId: z
    .string()
    .describe(
      "UUID of the organisation node to focus. Must be an org present on the current force-graph lens.",
    ),
});

export const highlightClusterInputSchema = z.object({
  nodeIds: z
    .array(z.string().min(1))
    .min(1)
    .max(200)
    .describe(
      "Ordered list of node ids to highlight together. Order is preserved; the first id is treated as the camera target. Non-existent ids are silently ignored by the client dispatcher.",
    ),
  label: z
    .string()
    .nullable()
    .describe(
      "Optional short label describing the cluster (e.g. 'Rail decarbonisation projects'). Shown in the canvas UI as a cluster title if provided.",
    ),
});

export const colorByLensCategoryInputSchema = z.object({
  categoryId: z
    .string()
    .nullable()
    .describe(
      "Category id to colour nodes by (lens-specific taxonomy). Pass null to revert to default colouring.",
    ),
});

export const filterByQueryInputSchema = z.object({
  query: z
    .string()
    .nullable()
    .describe(
      "Free-text query to push into canvas.filter.query. Pass null or empty string to clear the query.",
    ),
  funder: z
    .string()
    .nullable()
    .describe(
      "Optional funder to co-filter on (e.g. 'Innovate UK', 'EPSRC'). Pass null to leave the current funder filter unchanged.",
    ),
  mode: z
    .string()
    .nullable()
    .describe(
      "Optional transport mode hint (rail, aviation, maritime, highways). Pass null to leave the current mode filter unchanged.",
    ),
});

export const resetCameraInputSchema = z.object({});

// Dispatched envelope (server-side execute return) ---------------------------

export type DispatchedCanvasIntent =
  | {
      tool: "focusOnProject";
      input: z.infer<typeof focusOnProjectInputSchema>;
    }
  | { tool: "focusOnOrg"; input: z.infer<typeof focusOnOrgInputSchema> }
  | {
      tool: "highlightCluster";
      input: z.infer<typeof highlightClusterInputSchema>;
    }
  | {
      tool: "colorByLensCategory";
      input: z.infer<typeof colorByLensCategoryInputSchema>;
    }
  | { tool: "filterByQuery"; input: z.infer<typeof filterByQueryInputSchema> }
  | { tool: "resetCamera"; input: z.infer<typeof resetCameraInputSchema> };

export type CanvasDispatchedResult = {
  status: "dispatched";
  intent: DispatchedCanvasIntent;
  at: number;
};

export type CanvasAppliedResult = {
  status: "applied";
  newState: CanvasState;
  at: number;
};

export type CanvasErrorResult = {
  status: "error";
  reason: string;
  at: number;
};

export type CanvasToolResult =
  | CanvasDispatchedResult
  | CanvasAppliedResult
  | CanvasErrorResult;

// Tool definitions ------------------------------------------------------------

export const focusOnProjectTool = createTool({
  description:
    "Bring a single project to the centre of the 3D landscape and pan the camera onto it. " +
    "Preconditions: canvas.activeLens must be 'force-graph'. If a different lens is active, " +
    "call setActiveLens first (future tool) or tell the user the canvas is not on the right view. " +
    "Returns { status, newState } — the new state is proof the camera moved.",
  inputSchema: focusOnProjectInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "focusOnProject", input },
    at: Date.now(),
  }),
});

export const focusOnOrgTool = createTool({
  description:
    "Bring a single organisation node to the centre of the 3D landscape and pan the camera onto it. " +
    "Preconditions: canvas.activeLens must be 'force-graph'. Returns { status, newState }.",
  inputSchema: focusOnOrgInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "focusOnOrg", input },
    at: Date.now(),
  }),
});

export const highlightClusterTool = createTool({
  description:
    "Highlight a set of related nodes together (e.g. 'all rail decarbonisation projects', 'all suppliers of a named capability'). " +
    "The first id in the list is also used as the camera target. " +
    "Preconditions: canvas.activeLens must be 'force-graph'. Use this over multiple focusOnProject calls when the user's intent is exploratory rather than about one project. " +
    "Returns { status, newState }.",
  inputSchema: highlightClusterInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "highlightCluster", input },
    at: Date.now(),
  }),
});

export const colorByLensCategoryTool = createTool({
  description:
    "Recolour the nodes in the 3D landscape by a lens-specific category (e.g. TRL band, funder family, transport mode). " +
    "Preconditions: canvas.activeLens must be 'force-graph'. " +
    "Pass categoryId = null to revert to the default funder-based colouring. Returns { status, newState }.",
  inputSchema: colorByLensCategoryInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "colorByLensCategory", input },
    at: Date.now(),
  }),
});

export const filterByQueryTool = createTool({
  description:
    "Apply a text/funder/mode filter to the canvas data. This is the core 'narrow the view' tool — " +
    "call it when the user asks about a specific theme, mode or funder. " +
    "No lens precondition: the filter applies to whichever lens is active, and any lens that opens afterwards " +
    "will honour it until cleared. Pass query=null to clear the text query while keeping funder/mode filters. " +
    "Returns { status, newState }.",
  inputSchema: filterByQueryInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "filterByQuery", input },
    at: Date.now(),
  }),
});

export const resetCameraTool = createTool({
  description:
    "Reset the 3D landscape camera to its default overview position and clear any active highlight or selection. " +
    "Does NOT clear filters — use filterByQuery with all-null inputs to do that. " +
    "Preconditions: canvas.activeLens must be 'force-graph'. Returns { status, newState }.",
  inputSchema: resetCameraInputSchema,
  execute: async (input): Promise<CanvasDispatchedResult> => ({
    status: "dispatched",
    intent: { tool: "resetCamera", input },
    at: Date.now(),
  }),
});
