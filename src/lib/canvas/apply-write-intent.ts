// ---------------------------------------------------------------------------
// Pure canvas-state reducer (Sprint X Thread 2, commit 1)
//
// Extracted from `canvas-tool-dispatcher.tsx` so the reducer can be
// unit-tested without pulling in Zustand, Next/React, or the auth/DB
// modules that transitively load when this file is imported from the
// client dispatcher.
//
// Contract: given the prior `CanvasState` slice and a validated tool
// input, return the next slice — or an `{ __error }` sentinel if the
// input is invalid for the tool (which the dispatcher surfaces to the
// model as a `status: "error"` tool result).
//
// All mutations populate `lastAction` with `source: "agent"` per the
// Canvas State Contract.
// ---------------------------------------------------------------------------

import type {
  CanvasFilter,
  CanvasStage,
  CanvasStageChartSpec,
  CanvasState,
} from "@/app/store";
import { DefaultToolName } from "@/lib/ai/tools";

export function applyWriteIntent(
  prev: CanvasState,
  toolName: string,
  input: Record<string, unknown>,
): CanvasState | { __error: string } {
  const now = Date.now();

  switch (toolName) {
    case DefaultToolName.FocusOnProject: {
      const projectId =
        typeof input.projectId === "string" ? input.projectId : null;
      if (!projectId) return { __error: "focusOnProject requires a projectId" };
      return {
        ...prev,
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

    case DefaultToolName.MountChartInStage: {
      const spec = (input as { spec?: unknown }).spec;
      if (!spec || typeof spec !== "object") {
        return { __error: "mountChartInStage requires a chart spec" };
      }
      const kind = (spec as { kind?: unknown }).kind;
      if (kind !== "bar" && kind !== "line" && kind !== "pie") {
        return {
          __error: `mountChartInStage: unsupported chart kind '${String(kind)}'`,
        };
      }
      const stage: CanvasStage = {
        kind: "chart",
        spec: spec as CanvasStageChartSpec,
      };
      return {
        ...prev,
        stage,
        lastAction: {
          type: "mountChartInStage",
          payload: { kind },
          result: { stage: stage.kind, chartKind: kind },
          at: now,
          source: "agent",
        },
      };
    }

    case DefaultToolName.MountPassportInStage: {
      const passportId =
        typeof input.passportId === "string" && input.passportId.length > 0
          ? input.passportId
          : null;
      if (!passportId) {
        return { __error: "mountPassportInStage requires a passportId" };
      }
      const stage: CanvasStage = { kind: "passport", passportId };
      return {
        ...prev,
        stage,
        lastAction: {
          type: "mountPassportInStage",
          payload: { passportId },
          result: { stage: stage.kind, passportId },
          at: now,
          source: "agent",
        },
      };
    }

    default:
      return { __error: `Unknown canvas write tool: ${toolName}` };
  }
}
