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

export type CanvasState = {
  selectedNodeId: string | null;
  selectedNodeType: CanvasNodeType | null;
  hoveredNodeId: string | null;
  filter: CanvasFilter;
  activeLens: CanvasLensId;
  cameraTarget: CanvasCameraTarget | null;
  colorMode: "default" | "by-lens-category";
  lastAction: CanvasLastAction | null;
};

// ---------------------------------------------------------------------------
// Briefing state (Sprint X Commit 1 — Brief C §2)
//
// The briefing panel's content — a title plus an ordered list of typed blocks
// (heading / paragraph / bullets / citation / project-card / chart). Blocks
// are appended by the agent as a byproduct of exploratory conversation and
// can be removed, re-ordered or edited by the user.
//
// Briefing is soft-persisted per-tab via sessionStorage (see mirror at the
// bottom of this file). It is deliberately excluded from the main persisted
// `partialize` payload so that it never lands in localStorage: work in one
// briefing does not bleed into another tab or a future session on the same
// device.
// ---------------------------------------------------------------------------

export type BriefingBlockType =
  | "heading"
  | "paragraph"
  | "bullets"
  | "citation"
  | "project-card"
  | "chart";

export type BriefingBlockBase = {
  id: string;
  type: BriefingBlockType;
  source: "user" | "agent";
  createdAt: number;
};

export type BriefingHeadingBlock = BriefingBlockBase & {
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
};

export type BriefingParagraphBlock = BriefingBlockBase & {
  type: "paragraph";
  text: string;
};

export type BriefingBulletsBlock = BriefingBlockBase & {
  type: "bullets";
  items: string[];
};

export type BriefingCitationBlock = BriefingBlockBase & {
  type: "citation";
  text: string;
  sourceTitle: string;
  sourceUrl?: string;
  projectId?: string;
  orgId?: string;
};

export type BriefingProjectCardBlock = BriefingBlockBase & {
  type: "project-card";
  projectId: string;
  title: string;
  summary?: string;
  funder?: string;
  funding?: number;
};

export type BriefingChartBlock = BriefingBlockBase & {
  type: "chart";
  chartId: string;
  title: string;
  payload: unknown;
};

export type BriefingBlock =
  | BriefingHeadingBlock
  | BriefingParagraphBlock
  | BriefingBulletsBlock
  | BriefingCitationBlock
  | BriefingProjectCardBlock
  | BriefingChartBlock;

export type BriefingLastAction = {
  type: string;
  payload: unknown;
  result: unknown;
  at: number;
  source: "user" | "agent";
};

export type BriefingState = {
  title: string;
  blocks: BriefingBlock[];
  lastAction: BriefingLastAction | null;
};

const BRIEFING_SESSION_STORAGE_KEY = "mc-app-store-briefing-v1";

const initialCanvasState: CanvasState = {
  selectedNodeId: null,
  selectedNodeType: null,
  hoveredNodeId: null,
  filter: {},
  activeLens: "force-graph",
  cameraTarget: null,
  colorMode: "default",
  lastAction: null,
};

const initialBriefingState: BriefingState = {
  title: "Untitled briefing",
  blocks: [],
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
  briefing: BriefingState;
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
  briefing: initialBriefingState,
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
        // NOTE: `canvas` and `briefing` are intentionally excluded here.
        // Canvas is session-only (reset on refresh).
        // Briefing is mirrored to sessionStorage separately below so it
        // survives refresh within the same tab but never lands in
        // localStorage.
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

// ---------------------------------------------------------------------------
// Briefing sessionStorage mirror (client-only)
//
// Hydrate on first client-side import, then keep sessionStorage in sync with
// any subsequent change to `state.briefing`. All access is wrapped in
// try/catch so quota, parse, or permission failures never corrupt the store
// or a write-tool result — the briefing just silently stops persisting for
// that session.
//
// Runs in a browser context only (no-op on the server during SSR/RSC).
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
  try {
    const raw = window.sessionStorage.getItem(BRIEFING_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BriefingState> | null;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.title === "string" &&
        Array.isArray(parsed.blocks)
      ) {
        appStore.setState({
          briefing: {
            title: parsed.title,
            blocks: parsed.blocks as BriefingBlock[],
            lastAction: parsed.lastAction ?? null,
          },
        });
      }
    }
  } catch {
    // Silent: corrupt JSON or blocked storage. Briefing falls back to initial.
  }

  appStore.subscribe(
    (state) => state.briefing,
    (briefing) => {
      try {
        window.sessionStorage.setItem(
          BRIEFING_SESSION_STORAGE_KEY,
          JSON.stringify(briefing),
        );
      } catch {
        // Silent: quota exceeded or storage blocked.
      }
    },
  );
}
