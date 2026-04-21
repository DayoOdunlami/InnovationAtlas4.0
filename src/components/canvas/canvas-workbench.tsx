"use client";

// ---------------------------------------------------------------------------
// Canvas workbench (Sprint X Commit 7 — Brief X §7)
//
// The unified /canvas shell. Three panels from left to right:
//
//   [icon rail] [main stage] [chat rail]
//
// The icon rail is a thin lens switcher (force-graph active today; scatter,
// sankey, timeline and coverage-matrix are visible-but-disabled stubs that
// will light up as their lenses land in Commits 8–9 and beyond).
//
// The main stage embeds the force-graph lens (currently the whole
// Landscape3DPage component; Commit 9 will extract a shared <ForceGraphLens/>
// so /landscape-3d and /canvas stop duplicating chrome).
//
// The chat rail hosts the existing ChatBot. Because both /landscape-3d and
// /canvas share `appStore.canvas`, tool calls made here mutate the same
// state that any open /landscape-3d tab already observes — the dispatcher
// wired in Commit 6 applies them.
//
// The floating bottom-centre mic is the canvas voice entry point (Brief A
// §3 R6). Clicking it opens the existing Realtime voice session exactly
// the way the header / prompt mics do — by flipping
// `appStore.voiceChat.isOpen` to true and seeding `agentId` from the
// thread's @agent mention. The Realtime drawer (`<ChatBotVoice/>` in
// `app-popup-provider`) overlays the whole viewport, so the chat rail's
// layout state is irrelevant to voice visibility.
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type { CanvasLensId, CanvasStage } from "@/app/store";
import { CanvasStage as CanvasStageRouter } from "@/components/canvas/canvas-stage";
import { CanvasStatusPopover } from "@/components/canvas/canvas-status-popover";
import ChatBot from "@/components/chat-bot";
import { Button } from "@/components/ui/button";
import { AppDefaultToolkit } from "@/lib/ai/tools";
import { agentIdForVoiceFromThreadMentions } from "@/lib/chat/agent-id-for-voice";
import { cn } from "lib/utils";
import {
  ArrowLeft,
  CircleDot,
  GitBranch,
  Grid3x3,
  Layers,
  Mic,
  Timer,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

interface LensOption {
  id: CanvasLensId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

const LENSES: LensOption[] = [
  { id: "force-graph", label: "Force graph", icon: GitBranch, enabled: true },
  { id: "scatter", label: "Scatter", icon: CircleDot, enabled: false },
  { id: "sankey", label: "Sankey", icon: Layers, enabled: false },
  { id: "timeline", label: "Timeline", icon: Timer, enabled: false },
  { id: "coverage-matrix", label: "Coverage", icon: Grid3x3, enabled: false },
];

interface CanvasWorkbenchProps {
  threadId: string;
  initialPassportId?: string | null;
}

export function CanvasWorkbench({
  threadId,
  initialPassportId,
}: CanvasWorkbenchProps) {
  // Single-fire passport hydration (R2 of the confirmed refinements). The
  // actual filter resolution will land in Commit 10 with the demo
  // choreography — for now we just log the intent and drop a toast so we
  // can verify URL params reach the page.
  // Merge-in the Canvas toolkit once on mount so the agent can see the
  // canvas tools without the user having to toggle them in the tool
  // selector. Other user-enabled toolkits are left untouched.
  useEffect(() => {
    const current = appStore.getState().allowedAppDefaultToolkit;
    const list = current ?? [
      AppDefaultToolkit.Code,
      AppDefaultToolkit.Visualization,
      AppDefaultToolkit.Passport,
      AppDefaultToolkit.Research,
    ];
    if (!list.includes(AppDefaultToolkit.Canvas)) {
      appStore.setState({
        allowedAppDefaultToolkit: [...list, AppDefaultToolkit.Canvas],
      });
    }
  }, []);

  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (!initialPassportId) return;
    hasHydratedRef.current = true;
    // Thread 2 commit 2: mount the passport in the main stage. The
    // CanvasStagePassport component will fetch it via /api/passport/[id].
    appStore.setState((prev) => ({
      canvas: {
        ...prev.canvas,
        stage: { kind: "passport", passportId: initialPassportId },
        lastAction: {
          type: "mountPassportInStage",
          payload: { passportId: initialPassportId, source: "url" },
          result: { stage: "passport", passportId: initialPassportId },
          at: Date.now(),
          source: "user",
        },
      },
    }));
  }, [initialPassportId]);

  const [activeLens, setActiveLens] = useState<CanvasLensId>(
    () => appStore.getState().canvas.activeLens,
  );

  const stage = useSyncExternalStore(
    (cb) => appStore.subscribe(cb),
    () => appStore.getState().canvas.stage,
    () => ({ kind: "force-graph" }) as CanvasStage,
  );

  const handleReturnToForceGraph = useCallback(() => {
    const current = appStore.getState().canvas.stage;
    if (current.kind === "force-graph") return;
    appStore.setState((prev) => ({
      canvas: {
        ...prev.canvas,
        stage: { kind: "force-graph" },
        lastAction: {
          type: "returnToForceGraph",
          payload: {},
          result: { stage: "force-graph" },
          at: Date.now(),
          source: "user",
        },
      },
    }));
  }, []);

  const handleLensChange = useCallback(
    (next: LensOption) => {
      if (!next.enabled) {
        toast.message(`${next.label} lens lands in a later sprint.`);
        return;
      }
      setActiveLens(next.id);
      // Clicking the force-graph lens chip ALWAYS returns the stage to the
      // force-graph per the Thread 2 spec ("Lens chip stays visible in the
      // lens rail; clicking it returns to force-graph").
      if (next.id === "force-graph") handleReturnToForceGraph();
      appStore.setState((prev) => ({
        canvas: {
          ...prev.canvas,
          activeLens: next.id,
          lastAction: {
            type: "setActiveLens",
            payload: { lens: next.id },
            result: { activeLens: next.id },
            at: Date.now(),
            source: "user",
          },
        },
      }));
    },
    [handleReturnToForceGraph],
  );

  // Subscribe to voiceChat.isOpen so the floating mic can reflect active
  // state while a Realtime session is live — the drawer itself is a
  // top-direction overlay rendered by <ChatBotVoice/> in the popup
  // provider, so no layout surgery is needed here.
  const voiceOpen = useSyncExternalStore(
    (cb) => appStore.subscribe(cb),
    () => appStore.getState().voiceChat.isOpen,
    () => false,
  );

  const handleMicClick = useCallback(() => {
    // Mirror the prompt-input / header-mic activation exactly: seed the
    // thread's agent (so JARVIS / MCP tool binding keeps working via
    // @mentions) and flip the drawer open. ChatBotVoice is mounted at the
    // app shell level, so it picks up the state change immediately.
    appStore.setState((prev) => ({
      voiceChat: {
        ...prev.voiceChat,
        isOpen: true,
        agentId: agentIdForVoiceFromThreadMentions(
          prev.threadMentions,
          threadId ?? prev.currentThreadId,
        ),
      },
    }));
  }, [threadId]);

  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden">
      {/* Top bar — thin header with the status popover (Thread 1) and the
          single-click Return-to-force-graph affordance (Thread 2). Lives
          outside the three-column grid so the stage keeps its full width. */}
      <header className="flex h-9 flex-none items-center justify-between border-b border-border bg-background/95 px-3">
        <span className="text-xs font-medium text-muted-foreground">
          Canvas
        </span>
        <div className="flex items-center gap-2">
          {stage.kind !== "force-graph" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleReturnToForceGraph}
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label="Return to force-graph"
            >
              <ArrowLeft className="size-3.5" />
              Return to force-graph
            </Button>
          )}
          <CanvasStatusPopover />
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Icon rail — lens switcher */}
        <aside
          aria-label="Canvas lens switcher"
          className="flex w-14 flex-col items-center gap-1 border-r border-border bg-muted/10 py-3"
        >
          {LENSES.map((lens) => {
            const Icon = lens.icon;
            const isActive = activeLens === lens.id && lens.enabled;
            return (
              <button
                key={lens.id}
                type="button"
                onClick={() => handleLensChange(lens)}
                title={
                  lens.enabled
                    ? `Switch to ${lens.label} lens`
                    : `${lens.label} (coming soon)`
                }
                aria-pressed={isActive}
                className={cn(
                  "flex size-10 items-center justify-center rounded-md transition-colors",
                  lens.enabled
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
                  isActive && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-5" />
                <span className="sr-only">{lens.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main stage — force-graph by default; can be taken over by a
            mounted chart (Thread 2 commit 1), passport (commit 2) or table
            (commit 3). CanvasStageRouter reads `appStore.canvas.stage`. */}
        <section className="relative flex-1 overflow-hidden bg-background">
          <CanvasStageRouter />

          {/* Floating mic — always-visible voice entry point on the canvas.
              Complementary to the header / prompt mics: clicking here opens
              the same Realtime drawer (Brief A §3 R6). */}
          <button
            type="button"
            onClick={handleMicClick}
            title={voiceOpen ? "Voice session open" : "Talk to JARVIS"}
            aria-label={voiceOpen ? "Voice session open" : "Open voice chat"}
            aria-pressed={voiceOpen}
            disabled={voiceOpen}
            className={cn(
              "absolute bottom-6 left-1/2 z-30 -translate-x-1/2",
              "flex size-12 items-center justify-center rounded-full",
              "border shadow-lg transition-colors backdrop-blur",
              voiceOpen
                ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                : "border-border bg-background/90 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Mic className="size-5" />
            <span className="sr-only">
              {voiceOpen ? "Voice session open" : "Open voice chat"}
            </span>
          </button>
        </section>

        {/* Chat rail — fixed width 420px today; resizable in a later sprint */}
        <aside
          aria-label="Canvas chat rail"
          className="flex w-[420px] flex-none flex-col border-l border-border bg-background"
        >
          <ChatBot initialMessages={[]} threadId={threadId} />
        </aside>
      </div>
    </div>
  );
}
