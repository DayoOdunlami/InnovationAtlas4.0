// ---------------------------------------------------------------------------
// Canvas read tool (Sprint X Commit 6 — Brief X §6)
//
// `getCanvasState` is the agent's official way to inspect what's currently
// on the canvas: which lens, which filter, what's selected, what's hovered.
// It is a READ (no mutation, no side effect).
//
// The server-side `execute` cannot actually access the user's browser state,
// so it returns a stub. The client dispatcher (src/components/canvas/
// canvas-tool-dispatcher.tsx) detects the tool call, snapshots
// `appStore.getState().canvas`, and calls `addToolResult` to OVERWRITE the
// stub with the real state. The model therefore sees
//
//   { status: "read", state: CanvasState, at }
//
// as the tool's final output. Until the dispatcher overwrites it, the
// transient stub carries `status: "request-issued"` so any intermediate
// consumer can tell it is not the final answer.
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";
import type { CanvasState } from "@/app/store";

export const getCanvasStateInputSchema = z.object({});

export type GetCanvasStateStubResult = {
  status: "request-issued";
  at: number;
};

export type GetCanvasStateResult = {
  status: "read";
  state: CanvasState;
  at: number;
};

export type GetCanvasStateErrorResult = {
  status: "error";
  reason: string;
  at: number;
};

export type CanvasReadToolResult =
  | GetCanvasStateStubResult
  | GetCanvasStateResult
  | GetCanvasStateErrorResult;

export const getCanvasStateTool = createTool({
  description:
    "Return the current state of the canvas: activeLens, filter, selectedNodeId, " +
    "selectedNodeType, hoveredNodeId, cameraTarget, colorMode, and lastAction. " +
    "Use this when the user says 'this project', 'what's on screen', 'that cluster' " +
    "or before calling a write tool whose preconditions depend on the active lens. " +
    "No side effects. Returns { status: 'read', state, at }.",
  inputSchema: getCanvasStateInputSchema,
  execute: async (): Promise<GetCanvasStateStubResult> => ({
    status: "request-issued",
    at: Date.now(),
  }),
});
