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
import { applyWriteIntent } from "@/lib/canvas/apply-write-intent";
import { DefaultToolName } from "@/lib/ai/tools";
import type {
  CanvasAppliedResult,
  CanvasErrorResult,
  CanvasDispatchedResult,
} from "@/lib/ai/tools/canvas/write-tools";
import type { GetCanvasStateResult } from "@/lib/ai/tools/canvas/read-tools";
import type { StageMountDispatchedResult } from "@/lib/ai/tools/canvas/stage-mount-tools";

type AddToolResult = UseChatHelpers<UIMessage>["addToolResult"];

const WRITE_TOOL_NAMES = new Set<string>([
  DefaultToolName.FocusOnProject,
  DefaultToolName.FocusOnOrg,
  DefaultToolName.HighlightCluster,
  DefaultToolName.ColorByLensCategory,
  DefaultToolName.FilterByQuery,
  DefaultToolName.ResetCamera,
  DefaultToolName.MountChartInStage,
  DefaultToolName.MountPassportInStage,
]);

const READ_TOOL_NAMES = new Set<string>([DefaultToolName.GetCanvasState]);

type DispatchedOutput = { status?: string };

function isDispatchedWriteOutput(
  output: unknown,
): output is CanvasDispatchedResult | StageMountDispatchedResult {
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
