"use client";

// ---------------------------------------------------------------------------
// Canvas tool dispatcher (Sprint X Commit 6 — Brief X §6)
//
// Headless component: renders nothing. Watches the `messages` array from
// useChat, finds canvas tool calls that have completed on the server
// (state === "output-available"), and applies the Zustand mutation
// client-side per the Atlas Canvas State Contract.
//
// For write tools (focus, highlight, colorBy, filter, reset) the server
// execute returns `{ status: "dispatched", intent, at }`. This dispatcher:
//   1. Applies the mutation to `appStore.canvas` synchronously.
//   2. Writes `canvas.lastAction` with source: "agent".
//   3. Calls `addToolResult` to overwrite the tool output with
//      `{ status: "applied", newState, at }` so the model's next turn sees
//      the authoritative state — per the contract.
//
// For the `getCanvasState` read tool, the server returns a stub and this
// dispatcher immediately overwrites it via `addToolResult` with the real
// canvas snapshot.
//
// Deduplication is by toolCallId (ref Set). React Strict Mode double-mount
// is therefore safe: the same toolCallId won't apply twice.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { UIMessage, ToolUIPart } from "ai";
import { getToolName, isToolUIPart } from "ai";
import type { UseChatHelpers } from "@ai-sdk/react";
import { appStore } from "@/app/store";
import type { CanvasFilter, CanvasState } from "@/app/store";
import { DefaultToolName } from "@/lib/ai/tools";
import type {
  CanvasAppliedResult,
  CanvasErrorResult,
  CanvasDispatchedResult,
} from "@/lib/ai/tools/canvas/write-tools";
import type { GetCanvasStateResult } from "@/lib/ai/tools/canvas/read-tools";

type AddToolResult = UseChatHelpers<UIMessage>["addToolResult"];

const WRITE_TOOL_NAMES = new Set<string>([
  DefaultToolName.FocusOnProject,
  DefaultToolName.FocusOnOrg,
  DefaultToolName.HighlightCluster,
  DefaultToolName.ColorByLensCategory,
  DefaultToolName.FilterByQuery,
  DefaultToolName.ResetCamera,
]);

const READ_TOOL_NAMES = new Set<string>([DefaultToolName.GetCanvasState]);

type DispatchedOutput = { status?: string };

function isDispatchedWriteOutput(
  output: unknown,
): output is CanvasDispatchedResult {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as DispatchedOutput).status === "dispatched"
  );
}

function isRequestIssuedReadOutput(
  output: unknown,
): output is { status: "request-issued"; at: number } {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as DispatchedOutput).status === "request-issued"
  );
}

/** Pure mutation function: given a prior canvas slice + intent, return the next slice. */
function applyWriteIntent(
  prev: CanvasState,
  toolName: string,
  input: Record<string, unknown>,
): CanvasState | { __error: string } {
  const now = Date.now();
  const base: Partial<CanvasState> = {};

  switch (toolName) {
    case DefaultToolName.FocusOnProject: {
      const projectId =
        typeof input.projectId === "string" ? input.projectId : null;
      if (!projectId) return { __error: "focusOnProject requires a projectId" };
      return {
        ...prev,
        ...base,
        selectedNodeId: projectId,
        selectedNodeType: "project",
        lastAction: {
          type: "focusOnProject",
          payload: { projectId },
          result: { selectedNodeId: projectId },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.FocusOnOrg: {
      const orgId = typeof input.orgId === "string" ? input.orgId : null;
      if (!orgId) return { __error: "focusOnOrg requires an orgId" };
      return {
        ...prev,
        selectedNodeId: orgId,
        selectedNodeType: "organisation",
        lastAction: {
          type: "focusOnOrg",
          payload: { orgId },
          result: { selectedNodeId: orgId },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.HighlightCluster: {
      const nodeIds = Array.isArray(input.nodeIds)
        ? (input.nodeIds as unknown[]).filter(
            (v): v is string => typeof v === "string",
          )
        : [];
      if (nodeIds.length === 0)
        return { __error: "highlightCluster requires non-empty nodeIds" };
      const label = typeof input.label === "string" ? input.label : null;
      // First id is the camera target per the tool description.
      return {
        ...prev,
        selectedNodeId: nodeIds[0],
        selectedNodeType: null,
        lastAction: {
          type: "highlightCluster",
          payload: { nodeIds, label },
          result: { selectedNodeId: nodeIds[0], clusterSize: nodeIds.length },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.ColorByLensCategory: {
      const categoryId =
        typeof input.categoryId === "string" ? input.categoryId : null;
      return {
        ...prev,
        colorMode: categoryId ? "by-lens-category" : "default",
        filter: { ...prev.filter, lensCategoryId: categoryId ?? undefined },
        lastAction: {
          type: "colorByLensCategory",
          payload: { categoryId },
          result: {
            colorMode: categoryId ? "by-lens-category" : "default",
            lensCategoryId: categoryId,
          },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.FilterByQuery: {
      const nextFilter: CanvasFilter = { ...prev.filter };
      if (input.query !== undefined) {
        nextFilter.query =
          typeof input.query === "string" && input.query.length > 0
            ? input.query
            : undefined;
      }
      if (input.funder !== undefined) {
        nextFilter.funder =
          typeof input.funder === "string" && input.funder.length > 0
            ? input.funder
            : undefined;
      }
      if (input.mode !== undefined) {
        nextFilter.mode =
          typeof input.mode === "string" && input.mode.length > 0
            ? input.mode
            : undefined;
      }
      return {
        ...prev,
        filter: nextFilter,
        lastAction: {
          type: "filterByQuery",
          payload: {
            query: input.query ?? null,
            funder: input.funder ?? null,
            mode: input.mode ?? null,
          },
          result: { filter: nextFilter },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.ResetCamera: {
      return {
        ...prev,
        cameraTarget: null,
        selectedNodeId: null,
        selectedNodeType: null,
        lastAction: {
          type: "resetCamera",
          payload: {},
          result: { cameraTarget: null, selectedNodeId: null },
          at: now,
          source: "agent",
        },
      };
    }

    default:
      return { __error: `Unknown canvas write tool: ${toolName}` };
  }
}

interface CanvasToolDispatcherProps {
  messages: UIMessage[];
  addToolResult: AddToolResult;
}

/**
 * Headless effect-only component. Drop once per chat surface beside useChat.
 */
export function CanvasToolDispatcher({
  messages,
  addToolResult,
}: CanvasToolDispatcherProps): null {
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!messages?.length) return;

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const parts = message.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (!isToolUIPart(part)) continue;
        const toolName = getToolName(part);
        if (!WRITE_TOOL_NAMES.has(toolName) && !READ_TOOL_NAMES.has(toolName))
          continue;

        const { toolCallId, state, output, input } = part as ToolUIPart;
        if (state !== "output-available") continue;
        if (processedRef.current.has(toolCallId)) continue;

        // Write tools — apply mutation + overwrite output.
        if (WRITE_TOOL_NAMES.has(toolName) && isDispatchedWriteOutput(output)) {
          processedRef.current.add(toolCallId);

          const applied = applyWriteIntent(
            appStore.getState().canvas,
            toolName,
            (input ?? {}) as Record<string, unknown>,
          );

          if ("__error" in applied) {
            const err: CanvasErrorResult = {
              status: "error",
              reason: applied.__error,
              at: Date.now(),
            };
            void addToolResult({ tool: toolName, toolCallId, output: err });
            continue;
          }

          appStore.setState({ canvas: applied });
          const success: CanvasAppliedResult = {
            status: "applied",
            newState: applied,
            at: Date.now(),
          };
          void addToolResult({ tool: toolName, toolCallId, output: success });
          continue;
        }

        // Read tool — overwrite stub with real snapshot.
        if (
          READ_TOOL_NAMES.has(toolName) &&
          isRequestIssuedReadOutput(output)
        ) {
          processedRef.current.add(toolCallId);
          const snapshot: GetCanvasStateResult = {
            status: "read",
            state: appStore.getState().canvas,
            at: Date.now(),
          };
          void addToolResult({ tool: toolName, toolCallId, output: snapshot });
        }
      }
    }
  }, [messages, addToolResult]);

  return null;
}
