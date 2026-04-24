import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { ChatMention, ChatModel, ChatThread } from "app-types/chat";
import { AllowedMCPServer, MCPServerInfo } from "app-types/mcp";
import { OPENAI_VOICE } from "lib/ai/speech/open-ai/use-voice-chat.openai";
import { WorkflowSummary } from "app-types/workflow";
import { AppDefaultToolkit } from "lib/ai/tools";
import { AgentSummary } from "app-types/agent";
import { ArchiveWithItemCount } from "app-types/archive";

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  isUploading?: boolean;
  progress?: number;
  previewUrl?: string;
  abortController?: AbortController;
  dataUrl?: string; // Full data URL format: "data:image/png;base64,..."
}

// ---------------------------------------------------------------------------
// Canvas state (Sprint X Commit 1 — Brief A §2)
//
// Single source of truth for the /canvas surface: selection, filter, active
// lens, camera, and a rolling `lastAction` audit entry. Session-only — this
// slice is intentionally excluded from the persisted `partialize` payload so
// that refreshing the page resets camera and filter while the tab stays open.
//
// Every mutation (whether driven by a user interaction or by an agent write
// tool) MUST populate `lastAction` with the appropriate `source`. That is how
// the Canvas and the agent stay in sync without polling.
// ---------------------------------------------------------------------------

export type CanvasLensId =
  | "force-graph"
  | "scatter"
  | "sankey"
  | "timeline"
  | "coverage-matrix";

export type CanvasNodeType = "project" | "organisation" | "theme";

export type CanvasFilter = {
  query?: string;
  lensCategoryId?: string;
  mode?: string;
  funder?: string;
  dateRange?: { start: string; end: string };
};

export type CanvasCameraTarget = { x: number; y: number; z: number };

export type CanvasLastAction = {
  type: string;
  payload: unknown;
  result: unknown;
  at: number;
  source: "user" | "agent";
};

// ---------------------------------------------------------------------------
// Canvas stage (Sprint X Thread 2)
//
// `stage` is the thing currently mounted in the canvas main panel. It is a
// *replacement* of the force-graph (not an overlay, not a split view): when
// a chart / passport / table stage mounts it takes over the main area, and
// the user returns to the force-graph by clicking the Return affordance in
// the top bar or re-clicking the force-graph icon in the lens rail.
//
// Kept deliberately open-ended via a discriminated `kind` so subsequent
// commits can add lens variants (passport in commit 2, table in commit 3)
// without changing the contract seen by the dispatcher or the tool layer.
// ---------------------------------------------------------------------------

export type CanvasStageChartSpec =
  | {
      kind: "bar";
      title: string;
      description?: string | null;
      yAxisLabel?: string | null;
      data: Array<{
        xAxisLabel: string;
        series: Array<{ seriesName: string; value: number }>;
      }>;
    }
  | {
      kind: "line";
      title: string;
      description?: string | null;
      yAxisLabel?: string | null;
      data: Array<{
        xAxisLabel: string;
        series: Array<{ seriesName: string; value: number }>;
      }>;
    }
  | {
      kind: "pie";
      title: string;
      description?: string | null;
      unit?: string | null;
      data: Array<{ label: string; value: number }>;
    };

export type CanvasStageTableColumn = {
  key: string;
  label: string;
  type?: "string" | "number" | "date" | "boolean" | null;
};

export type CanvasStageTableSpec = {
  title: string;
  description?: string | null;
  columns: CanvasStageTableColumn[];
  data: Array<Record<string, unknown>>;
};

export type CanvasStage =
  | { kind: "force-graph" }
  | { kind: "chart"; spec: CanvasStageChartSpec }
  | { kind: "passport"; passportId: string }
  | { kind: "table"; spec: CanvasStageTableSpec };

export type CanvasState = {
  selectedNodeId: string | null;
  selectedNodeType: CanvasNodeType | null;
  hoveredNodeId: string | null;
  filter: CanvasFilter;
  activeLens: CanvasLensId;
  cameraTarget: CanvasCameraTarget | null;
  colorMode: "default" | "by-lens-category";
  stage: CanvasStage;
  lastAction: CanvasLastAction | null;
};

// ---------------------------------------------------------------------------
// Briefing state removed in Phase 2a.0 (Brief-First Rebuild).
//
// The `BriefingState` slice that lived here through the canvas-unified
// demo window was an orphan: no UI consumed it, and the real block
// state now lives in atlas.blocks behind `pgBlockRepository`. See
// post-demo-backlog.md "Orphan briefing slice on feat/canvas-unified"
// for the receipt.
// ---------------------------------------------------------------------------

const initialCanvasState: CanvasState = {
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

export interface AppState {
  threadList: ChatThread[];
  mcpList: (MCPServerInfo & { id: string })[];
  agentList: AgentSummary[];
  workflowToolList: WorkflowSummary[];
  currentThreadId: ChatThread["id"] | null;
  toolChoice: "auto" | "none" | "manual";
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
  generatingTitleThreadIds: string[];
  archiveList: ArchiveWithItemCount[];
  threadMentions: {
    [threadId: string]: ChatMention[];
  };
  threadFiles: {
    [threadId: string]: UploadedFile[];
  };
  threadImageToolModel: {
    [threadId: string]: string | undefined;
  };
  toolPresets: {
    allowedMcpServers?: Record<string, AllowedMCPServer>;
    allowedAppDefaultToolkit?: AppDefaultToolkit[];
    name: string;
  }[];
  chatModel?: ChatModel;
  openShortcutsPopup: boolean;
  openChatPreferences: boolean;
  openUserSettings: boolean;
  mcpCustomizationPopup?: MCPServerInfo & { id: string };
  temporaryChat: {
    isOpen: boolean;
    instructions: string;
    chatModel?: ChatModel;
  };
  voiceChat: {
    isOpen: boolean;
    agentId?: string;
    options: {
      provider: string;
      providerOptions?: Record<string, any>;
    };
  };
  canvas: CanvasState;
  pendingThreadMention?: ChatMention;
}

export interface AppDispatch {
  mutate: (state: Mutate<AppState>) => void;
}

const initialState: AppState = {
  threadList: [],
  archiveList: [],
  generatingTitleThreadIds: [],
  threadMentions: {},
  threadFiles: {},
  threadImageToolModel: {},
  mcpList: [],
  agentList: [],
  workflowToolList: [],
  currentThreadId: null,
  toolChoice: "auto",
  allowedMcpServers: undefined,
  openUserSettings: false,
  allowedAppDefaultToolkit: [
    AppDefaultToolkit.Code,
    AppDefaultToolkit.Visualization,
    AppDefaultToolkit.Passport,
    AppDefaultToolkit.Research,
    AppDefaultToolkit.Canvas,
    AppDefaultToolkit.KnowledgeBase,
  ],
  toolPresets: [],
  chatModel: undefined,
  openShortcutsPopup: false,
  openChatPreferences: false,
  mcpCustomizationPopup: undefined,
  temporaryChat: {
    isOpen: false,
    instructions: "",
  },
  voiceChat: {
    isOpen: false,
    options: {
      provider: "openai",
      providerOptions: {
        model: OPENAI_VOICE["Alloy"],
      },
    },
  },
  canvas: initialCanvasState,
  pendingThreadMention: undefined,
};

export const appStore = create<AppState & AppDispatch>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        ...initialState,
        mutate: set,
      }),
      {
        name: "mc-app-store-v2.0.2",
        // NOTE: `canvas` is intentionally excluded here — canvas is
        // session-only (reset on refresh). The Phase 2a.0 block state
        // now lives in atlas.blocks behind the repository layer; the
        // old sessionStorage-mirrored `briefing` slice was removed as
        // part of this phase (see post-demo-backlog.md).
        partialize: (state) => ({
          chatModel: state.chatModel || initialState.chatModel,
          toolChoice: state.toolChoice || initialState.toolChoice,
          allowedMcpServers:
            state.allowedMcpServers || initialState.allowedMcpServers,
          allowedAppDefaultToolkit: (
            state.allowedAppDefaultToolkit ??
            initialState.allowedAppDefaultToolkit
          )?.filter((v) => Object.values(AppDefaultToolkit).includes(v)),
          temporaryChat: {
            ...initialState.temporaryChat,
            ...state.temporaryChat,
            isOpen: false,
          },
          toolPresets: state.toolPresets || initialState.toolPresets,
          voiceChat: {
            ...initialState.voiceChat,
            ...state.voiceChat,
            isOpen: false,
          },
        }),
      },
    ),
  ),
);

// Phase 2a.0: Briefing sessionStorage mirror removed along with the
// orphan BriefingState slice. Block state is now sourced from
// atlas.blocks via `pgBlockRepository` on the server.
